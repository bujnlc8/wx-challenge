// Business sessions are independent of WeChat's short-lived login code.
const AUTH_HOST = "https://challenge.haihui.site/";
const AUTH_STORAGE_KEYS = ["uid", "token", "auth_session", "auth_client_session_id", "mine_cache"];
const authRuntimes = new WeakMap();
function authRuntime(platform) {
  if (!authRuntimes.has(platform)) authRuntimes.set(platform, { revision: 0, observed: null, flight: null });
  return authRuntimes.get(platform);
}
function authEpoch() {
  return Date.now().toString(36) + "-" + Math.random().toString(36).slice(2) + "-" + Math.random().toString(36).slice(2);
}
function getSessionIdentity(platform = wx) {
  const runtime = authRuntime(platform);
  const uid = platform.getStorageSync("uid") || "";
  const token = platform.getStorageSync("token") || "";
  if (!uid || !token) {
    if (runtime.observed) runtime.revision++;
    runtime.observed = null;
    return "";
  }
  if (runtime.observed && runtime.observed.uid === uid && runtime.observed.token === token)
    return JSON.stringify([String(uid), runtime.observed.id]);
  const stored = platform.getStorageSync("auth_client_session_id");
  const id = stored && stored.uid === uid && stored.token === token && typeof stored.id === "string" ? stored.id : authEpoch();
  if (runtime.observed && runtime.observed.id !== id) runtime.revision++;
  runtime.observed = { uid, token, id };
  if (!stored || stored.id !== id) {
    try { platform.setStorageSync("auth_client_session_id", { uid, token, id }); } catch (error) { /* Runtime ownership still works when storage is unavailable. */ }
  }
  return JSON.stringify([String(uid), id]);
}
function captureAuthSession(platform = wx) {
  const identity = getSessionIdentity(platform);
  return { identity, uid: platform.getStorageSync("uid") || "", token: platform.getStorageSync("token") || "", revision: authRuntime(platform).revision };
}
function isAuthSessionCurrent(capture, platform = wx) {
  return capture.identity === getSessionIdentity(platform) && capture.revision === authRuntime(platform).revision;
}
function authSessionChanged() {
  const error = new Error("账号已变更，请重试");
  error.sessionChanged = true;
  return error;
}
function authError(response) {
  const error = new Error((response && response.data && response.data.message) || "登录已失效，请重新登录");
  error.authentication = true;
  error.response = response;
  return error;
}
function authInvalid(response) {
  return !!response && (Number(response.statusCode) === 401 || (response.data && Number(response.data.code) === 11111));
}
function authPayload(response) {
  if (authInvalid(response)) throw authError(response);
  if (!response || !response.data || Number(response.data.code) !== 10000) {
    const error = new Error((response && response.data && response.data.message) || "登录暂时不可用，请稍后重试");
    // A silent lookup of an unknown account requires an explicit manual login.
    if (response && response.data && Number(response.data.code) === 20003) error.authentication = true;
    throw error;
  }
  return response.data.data;
}
function saveAuthSession(data, { manual = false, preserveIdentity = false, expected } = {}, platform = wx) {
  if (expected && !isAuthSessionCurrent(expected, platform)) throw authSessionChanged();
  if (!data || !data.uid || !data.token || !data.refresh_token || !(Number(data.access_expires_in) > 0) || !(Number(data.refresh_expires_in) > 0))
    throw new Error("登录信息不完整，请重试");
  const current = captureAuthSession(platform);
  const runtime = authRuntime(platform);
  const id = !manual && preserveIdentity && String(current.uid) === String(data.uid) && runtime.observed ? runtime.observed.id : authEpoch();
  const now = Date.now();
  const session = { uid: data.uid, token: data.token, refresh_token: data.refresh_token, session_id: data.session_id || "", access_expires_at: now + Number(data.access_expires_in) * 1000, refresh_expires_at: now + Number(data.refresh_expires_in) * 1000 };
  const values = { uid: data.uid, token: data.token, auth_session: session, auth_client_session_id: { uid: data.uid, token: data.token, id } };
  if (manual || String(current.uid) !== String(data.uid)) values.mine_cache = undefined;
  const keys = Object.keys(values);
  const previous = keys.map((key) => [key, platform.getStorageSync(key)]);
  try {
    for (const key of keys) {
      if (values[key] === undefined) platform.removeStorageSync(key);
      else platform.setStorageSync(key, values[key]);
    }
  } catch (error) {
    // Publish synchronously and roll back every field before returning to callers.
    let rollbackFailed = false;
    for (const [key, value] of previous) {
      try {
        if (value === undefined || value === "" || value === null) platform.removeStorageSync(key);
        else platform.setStorageSync(key, value);
      } catch (rollbackError) {
        rollbackFailed = true;
      }
    }
    if (rollbackFailed) {
      // Persistent storage errors must never expose credentials from two sessions.
      clearAuthSession(undefined, platform);
    }
    throw error;
  }
  if (manual || String(current.uid) !== String(data.uid)) runtime.revision++;
  runtime.observed = { uid: data.uid, token: data.token, id };
  return session;
}
function clearAuthSession(expected, platform = wx) {
  if (expected && !isAuthSessionCurrent(expected, platform)) return false;
  const runtime = authRuntime(platform);
  runtime.revision++;
  runtime.observed = null;
  for (const key of AUTH_STORAGE_KEYS) platform.removeStorageSync(key);
  return true;
}
function rawAuthRequest(url, method, data, json, session, platform = wx) {
  const header = { "content-type": json ? "application/json" : "application/x-www-form-urlencoded" };
  if (session && session.uid && session.token) header.Authorization = "Bearer " + session.uid + "_" + session.token;
  return new Promise((resolve, reject) => {
    platform.request({ url, method, data, header, success: resolve, fail: reject });
  });
}
function savedAuthSession(platform) {
  const session = platform.getStorageSync("auth_session");
  return session && session.uid === platform.getStorageSync("uid") && session.token === platform.getStorageSync("token") ? session : null;
}
function silentAuthSession(capture, platform) {
  if (!capture.uid || !isAuthSessionCurrent(capture, platform)) return Promise.reject(authSessionChanged());
  return new Promise((resolve, reject) => platform.login({ success: resolve, fail: reject }))
    .then((result) => {
      if (!isAuthSessionCurrent(capture, platform)) throw authSessionChanged();
      if (!result.code) throw new Error("微信登录暂时不可用");
      return rawAuthRequest(AUTH_HOST + "api/user/silent-login", "POST", { code: result.code }, true, null, platform);
    })
    .then(authPayload)
    .then((data) => saveAuthSession(data, { preserveIdentity: true, expected: capture }, platform));
}
function ensureAuthSession({ force = false, rejectedToken } = {}, platform = wx) {
  const capture = captureAuthSession(platform);
  if (!capture.uid || !capture.token) return Promise.resolve(null);
  const runtime = authRuntime(platform);
  const saved = savedAuthSession(platform);
  if (rejectedToken && rejectedToken !== capture.token) return Promise.resolve(saved || capture);
  if (!force && saved && saved.access_expires_at > Date.now() + 60000) return Promise.resolve(saved);
  if (runtime.flight && runtime.flight.identity === capture.identity && runtime.flight.revision === capture.revision) return runtime.flight.promise;
  const flight = { identity: capture.identity, revision: capture.revision, promise: null };
  const path = saved && saved.refresh_token ? "api/user/refresh-token" : "api/user/upgrade-session";
  const payload = saved && saved.refresh_token ? { uid: capture.uid, refresh_token: saved.refresh_token } : {};
  const pending = Promise.resolve()
    .then(() => {
      if (!isAuthSessionCurrent(capture, platform)) throw authSessionChanged();
      if (saved && saved.refresh_expires_at <= Date.now()) throw authError();
      return rawAuthRequest(AUTH_HOST + path, "POST", payload, false, path.endsWith("upgrade-session") ? capture : null, platform);
    })
    .then(authPayload)
    .then((data) => saveAuthSession(data, { preserveIdentity: true, expected: capture }, platform))
    .catch((error) => {
      if (!isAuthSessionCurrent(capture, platform)) throw authSessionChanged();
      if (!error.authentication) throw error;
      return silentAuthSession(capture, platform);
    })
    .finally(() => { if (runtime.flight === flight) runtime.flight = null; });
  flight.promise = pending;
  runtime.flight = flight;
  return pending;
}
async function requestWithSession(url, method, data, json, platform = wx) {
  // Login and session recovery use raw transport to prevent recursive interception.
  if (/\/api\/user\/(?:login-by-weixin|silent-login|refresh-token|upgrade-session|logout)(?:[?#]|$)/.test(url))
    return rawAuthRequest(url, method, data, json, null, platform);
  const owner = captureAuthSession(platform);
  if (!owner.uid || !owner.token) return rawAuthRequest(url, method, data, json, null, platform);
  try {
    await ensureAuthSession({}, platform);
  } catch (error) {
    if (!isAuthSessionCurrent(owner, platform)) throw authSessionChanged();
    if (error.authentication) return error.response || { statusCode: 401, data: { code: 11111, message: error.message } };
    throw error;
  }
  if (!isAuthSessionCurrent(owner, platform)) throw authSessionChanged();
  const sent = captureAuthSession(platform);
  const response = await rawAuthRequest(url, method, data, json, sent, platform);
  if (!isAuthSessionCurrent(owner, platform)) throw authSessionChanged();
  if (!authInvalid(response)) return response;
  try {
    await ensureAuthSession({ force: true, rejectedToken: sent.token }, platform);
  } catch (error) {
    if (!isAuthSessionCurrent(owner, platform)) throw authSessionChanged();
    if (error.authentication) return response;
    throw error;
  }
  if (!isAuthSessionCurrent(owner, platform)) throw authSessionChanged();
  // Only an explicit authentication rejection is safe to retry, once.
  const retrySession = captureAuthSession(platform);
  const retry = await rawAuthRequest(url, method, data, json, retrySession, platform);
  if (!isAuthSessionCurrent(owner, platform) ||
      (authInvalid(retry) && retrySession.token !== platform.getStorageSync("token")))
    throw authSessionChanged();
  return retry;
}
function logoutAuthSession(platform = wx) {
  const session = savedAuthSession(platform);
  clearAuthSession(undefined, platform);
  if (!session || !session.refresh_token) return Promise.resolve();
  return rawAuthRequest(AUTH_HOST + "api/user/logout", "POST", { uid: session.uid, refresh_token: session.refresh_token }, false, null, platform).catch(() => {});
}
export { AUTH_STORAGE_KEYS, getSessionIdentity, captureAuthSession, isAuthSessionCurrent, saveAuthSession, clearAuthSession, ensureAuthSession, requestWithSession, logoutAuthSession };
