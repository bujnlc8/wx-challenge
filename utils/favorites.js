import { getSessionIdentity } from "./auth-session";
import { httpGET, httpPOST } from "./util";

// Only confirmed server state is cached, and only for the current stable login.
const FAVORITE_TTL = 60000;
let favoriteOwner = "";
let favoriteWriteRevision = 0;
let favoriteEntries = new Map();
let favoritePendingWrites = new Set();
const favoriteListeners = new Map();
function favoriteId(value) {
  const id = Number(value);
  if (!Number.isSafeInteger(id) || id <= 0) throw Error("题目暂时不可用");
  return id;
}
function favoriteSessionError() {
  const error = Error("账号已变更，请重试");
  error.sessionChanged = true;
  return error;
}
function syncFavoriteOwner() {
  const owner = getSessionIdentity();
  if (owner !== favoriteOwner) {
    favoriteOwner = owner;
    favoriteEntries = new Map();
    favoritePendingWrites = new Set();
    for (const id of favoriteListeners.keys()) notifyFavorite(id);
  }
  return owner;
}
function favoriteEntry(id) {
  if (!favoriteEntries.has(id))
    favoriteEntries.set(id, {
      known: false,
      favorite: false,
      loading: false,
      saving: false,
      error: "",
      updatedAt: 0,
      sequence: 0,
      writeRevision: 0,
      flight: null,
    });
  return favoriteEntries.get(id);
}
function favoriteSnapshot(id) {
  const entry = favoriteEntry(id);
  return {
    owner: favoriteOwner,
    known: entry.known,
    favorite: entry.favorite,
    loading: entry.loading,
    saving: entry.saving,
    error: entry.error,
  };
}
function notifyFavorite(id) {
  const listeners = favoriteListeners.get(id);
  if (listeners)
    for (const listener of listeners) listener(favoriteSnapshot(id));
}
function getFavoriteSnapshot(questionId) {
  syncFavoriteOwner();
  return favoriteSnapshot(favoriteId(questionId));
}
function subscribeFavorite(questionId, listener) {
  syncFavoriteOwner();
  const id = favoriteId(questionId);
  if (!favoriteListeners.has(id)) favoriteListeners.set(id, new Set());
  favoriteListeners.get(id).add(listener);
  listener(favoriteSnapshot(id));
  return () => {
    const listeners = favoriteListeners.get(id);
    if (listeners) {
      listeners.delete(listener);
      if (!listeners.size) favoriteListeners.delete(id);
    }
  };
}
function favoritePayload(response, id) {
  const result = response && response.data;
  if (!result || Number(result.code) !== 10000)
    throw Error((result && result.message) || "收藏暂时不可用，请重试");
  const value = result.data;
  if (
    !value ||
    Number(value.question_id) !== id ||
    typeof value.favorite !== "boolean"
  )
    throw Error("收藏状态异常，请重试");
  return value;
}
function requestFavorite(id, target) {
  const owner = syncFavoriteOwner();
  if (!owner) return Promise.reject(Error("请先登录后收藏"));
  const entry = favoriteEntry(id);
  if (entry.flight) return entry.flight;
  const saving = typeof target === "boolean";
  const sequence = ++entry.sequence;
  entry.loading = !saving;
  entry.saving = saving;
  entry.target = target;
  entry.error = "";
  // Publish the flight before notifying either instance of a question control.
  let resolveFlight, rejectFlight;
  const flight = new Promise((resolve, reject) => {
    resolveFlight = resolve;
    rejectFlight = reject;
  });
  entry.flight = flight;
  notifyFavorite(id);
  const current = () =>
    syncFavoriteOwner() === owner &&
    favoriteEntries.get(id) === entry &&
    entry.sequence === sequence;
  let request;
  try {
    request = saving
      ? httpPOST("api/question/favorite", { question_id: id, favorite: target })
      : httpGET("api/question/favorite", { question_id: id });
  } catch (error) {
    request = Promise.reject(error);
  }
  Promise.resolve(request)
    .then((response) => {
      if (!current()) throw favoriteSessionError();
      const value = favoritePayload(response, id);
      entry.known = true;
      entry.favorite = value.favorite;
      entry.updatedAt = Date.now();
      if (saving) entry.writeRevision = ++favoriteWriteRevision;
      return value;
    })
    .then(
      (value) => {
        if (current()) {
          entry.loading = false;
          entry.saving = false;
          entry.flight = null;
          notifyFavorite(id);
        }
        resolveFlight(value);
      },
      (error) => {
        if (current()) {
          entry.loading = false;
          entry.saving = false;
          entry.flight = null;
          // A failed write may have reached the server: require another GET before toggling.
          if (saving) {
            entry.known = false;
            // Invalidate list snapshots even after this uncertain write settles.
            entry.writeRevision = ++favoriteWriteRevision;
          }
          entry.error = (error && error.message) || "网络异常，请重试";
          notifyFavorite(id);
        }
        rejectFlight(error);
      },
    );
  return flight;
}
function loadFavorite(questionId, { force = false } = {}) {
  const id = favoriteId(questionId);
  syncFavoriteOwner();
  const entry = favoriteEntry(id);
  if (entry.flight) return entry.flight;
  if (!force && entry.known && Date.now() - entry.updatedAt < FAVORITE_TTL)
    return Promise.resolve({ question_id: id, favorite: entry.favorite });
  return requestFavorite(id);
}
function requestSetFavorite(questionId, target) {
  const id = favoriteId(questionId);
  if (typeof target !== "boolean")
    return Promise.reject(Error("收藏状态异常，请重试"));
  const owner = syncFavoriteOwner(),
    entry = favoriteEntry(id);
  if (entry.flight) {
    if (entry.saving && entry.target === target) return entry.flight;
    return entry.flight.then(() => {
      if (owner !== syncFavoriteOwner()) throw favoriteSessionError();
      return requestSetFavorite(id, target);
    });
  }
  return requestFavorite(id, target);
}
function setFavorite(questionId, target) {
  syncFavoriteOwner();
  const pending = favoritePendingWrites;
  const task = requestSetFavorite(questionId, target);
  pending.add(task);
  task.then(
    () => pending.delete(task),
    () => pending.delete(task),
  );
  return task;
}
function waitForFavoriteWrites() {
  syncFavoriteOwner();
  // Include queued target writes, not just a POST that has already reached transport.
  return favoritePendingWrites.size
    ? Promise.allSettled(Array.from(favoritePendingWrites))
    : null;
}
function getFavoriteRevision() {
  syncFavoriteOwner();
  return favoriteWriteRevision;
}
function seedFavorites(items, readRevision = favoriteWriteRevision) {
  if (!syncFavoriteOwner()) return false;
  let stale = false;
  for (const item of items) {
    const id = favoriteId(item.question_id),
      entry = favoriteEntry(id);
    if (entry.writeRevision > readRevision) {
      stale = true;
      continue;
    }
    if (entry.flight) continue;
    entry.known = true;
    entry.favorite = true;
    entry.error = "";
    entry.updatedAt = Date.now();
    notifyFavorite(id);
  }
  return stale;
}
export {
  getFavoriteSnapshot,
  subscribeFavorite,
  loadFavorite,
  setFavorite,
  seedFavorites,
  getFavoriteRevision,
  waitForFavoriteWrites,
};
