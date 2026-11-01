import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { loadAuth } from "./helpers/auth-loader.mjs";
const read = (file) =>
  fs
    .readFileSync(new URL("../" + file, import.meta.url), "utf8")
    .replace(/import[\s\S]*?from\s+["'][^"']+["'];?/g, "")
    .replace(/export\s*\{[\s\S]*?\};?/g, "");
const ok = (data) => ({ data: { code: 10000, data } });
const flush = async () => {
  for (let i = 0; i < 15; i++) await Promise.resolve();
};
function runtime() {
  let owner = "account-a",
    time = 1000;
  const calls = [];
  const sounds = [];
  const toasts = [];
  const navigation = [];
  const scope = vm.createContext({
    Date: { now: () => time },
    Number,
    Map,
    Set,
    Promise,
    Error,
    Object,
    Array,
    JSON,
    Boolean,
    String,
    getSessionIdentity: () => owner,
    httpGET: (path, data) =>
      new Promise((resolve, reject) =>
        calls.push({ path, data, resolve, reject, method: "GET" }),
      ),
    httpPOST: (path, data) =>
      new Promise((resolve, reject) =>
        calls.push({ path, data, resolve, reject, method: "POST" }),
      ),
    showToast: (x) => toasts.push(x),
    getApp: () => ({
      clickSound: () => sounds.push("click"),
      checkLogin: (cb) => cb(),
    }),
    wx: {
      hideShareMenu() {},
      setNavigationBarTitle() {},
      stopPullDownRefresh() {},
      navigateTo: (x) => navigation.push(x),
    },
    Component: (x) => (scope.component = x),
    Page: (x) => (scope.page = x),
  });
  const path = new URL("../utils/favorites.js", import.meta.url);
  assert.ok(fs.existsSync(path), "shared favorite module is implemented");
  vm.runInContext(
    read("utils/favorites.js") +
      "\nthis.favoriteAPI={subscribeFavorite,loadFavorite,setFavorite,seedFavorites,getFavoriteSnapshot};",
    scope,
  );
  return {
    scope,
    api: scope.favoriteAPI,
    calls,
    sounds,
    toasts,
    navigation,
    setOwner: (x) => (owner = x),
    setTime: (x) => (time = x),
  };
}
function component(s, id) {
  if (!s.scope.component)
    vm.runInContext(
      read("component/question-favorite/question-favorite.js"),
      s.scope,
    );
  const d = s.scope.component;
  const c = {
    ...d.methods,
    data: { ...d.data, question_id: id },
    properties: { question_id: id },
    setData(v) {
      Object.assign(this.data, v);
    },
    triggerEvent() {},
  };
  d.lifetimes.attached.call(c);
  return { c, d };
}
function page(s) {
  vm.runInContext(read("pages/favorites/favorites.js"), s.scope);
  const d = s.scope.page;
  const p = {
    ...d,
    data: { ...d.data },
    setData(v) {
      Object.assign(this.data, v);
    },
  };
  p.onLoad();
  p.onShow();
  return p;
}
test("two visible controls share load, confirmed state and one rapid-tap POST", async () => {
  const s = runtime(),
    a = component(s, 42),
    b = component(s, 42);
  assert.equal(s.calls.length, 1);
  assert.equal(a.c.data.loading, true);
  s.calls[0].resolve(ok({ question_id: 42, favorite: false }));
  await flush();
  assert.equal(a.c.data.favorite, false);
  const first = a.c.toggleFavorite(),
    second = b.c.toggleFavorite();
  assert.equal(s.calls.length, 2);
  assert.equal(s.calls[1].method, "POST");
  assert.equal(s.calls[1].data.favorite, true);
  assert.equal(a.c.data.favorite, false);
  s.calls[1].resolve(ok({ question_id: 42, favorite: true }));
  await Promise.all([first, second]);
  assert.equal(a.c.data.favorite, true);
  assert.equal(b.c.data.favorite, true);
});
test("failed lookup retries GET and never guesses a toggle target", async () => {
  const s = runtime(),
    { c } = component(s, 5);
  s.calls[0].reject(Error("offline"));
  await flush();
  assert.ok(c.data.error);
  assert.equal(c.data.known, false);
  const task = c.toggleFavorite();
  assert.equal(s.calls[1].method, "GET");
  s.calls[1].resolve(ok({ question_id: 5, favorite: true }));
  await task;
  assert.equal(c.data.favorite, true);
  assert.equal(s.calls.length, 2);
});
test("owner switch discards late result and hidden controls do not render", async () => {
  const s = runtime(),
    { c, d } = component(s, 5);
  d.pageLifetimes.hide.call(c);
  const before = JSON.stringify(c.data);
  s.calls[0].resolve(ok({ question_id: 5, favorite: true }));
  await flush();
  assert.equal(JSON.stringify(c.data), before);
  s.setOwner("account-b");
  d.pageLifetimes.show.call(c);
  assert.equal(c.data.favorite, false);
  assert.equal(c.data.known, false);
  s.calls[1].resolve(ok({ question_id: 5, favorite: false }));
  await flush();
  assert.equal(c.data.favorite, false);
});
test("cache expires while a recent same-owner show shares the loaded state", async () => {
  const s = runtime();
  const task = s.api.loadFavorite(2);
  s.calls[0].resolve(ok({ question_id: 2, favorite: true }));
  await task;
  await s.api.loadFavorite(2);
  assert.equal(s.calls.length, 1);
  s.setTime(90000);
  const refreshed = s.api.loadFavorite(2);
  assert.equal(s.calls.length, 2);
  s.calls[1].resolve(ok({ question_id: 2, favorite: false }));
  await refreshed;
  assert.equal(s.api.getFavoriteSnapshot(2).favorite, false);
});
test("list pagination deduplicates and cancellation resets cursor so no shifted record is skipped", async () => {
  const s = runtime(),
    p = page(s);
  s.calls[0].resolve(
    ok({
      items: [{ question_id: 1, content: "第一题", options: "甲|乙" }],
      total: 3,
      page: 1,
      size: 1,
    }),
  );
  await flush();
  assert.equal(p.data.question_list.length, 1);
  p.onReachBottom();
  s.calls[1].resolve(
    ok({
      items: [
        { question_id: 1, content: "第一题", options: "甲|乙" },
        { question_id: 2, content: "第二题", options: "甲|乙" },
      ],
      total: 3,
      page: 2,
      size: 1,
    }),
  );
  await flush();
  assert.equal(p.data.question_list.length, 2);
  const removal = p.removeFavorite({ currentTarget: { dataset: { id: 1 } } });
  assert.equal(s.calls[2].data.favorite, false);
  s.calls[2].resolve(ok({ question_id: 1, favorite: false }));
  await flush();
  assert.equal(s.calls[3].data.page, 1);
  s.calls[3].resolve(
    ok({
      items: [{ question_id: 2, content: "第二题", options: "甲|乙" }],
      total: 2,
      page: 1,
      size: 1,
    }),
  );
  await removal;
  assert.equal(p.data.question_list[0].question_id, 2);
  assert.equal(p.data.page, 1);
  p.openQuestion({ currentTarget: { dataset: { id: 2 } } });
  assert.equal(
    s.navigation[0].url,
    "/pages/single/single?question_id=2&from=favorite",
  );
  assert.equal(s.calls.filter((x) => /answer|submit/.test(x.path)).length, 0);
});
test("list hides old account records and ignores late pagination after account change", async () => {
  const s = runtime(),
    p = page(s);
  s.setOwner("account-b");
  p.onShow();
  assert.equal(p.data.question_list.length, 0);
  s.calls[0].resolve(
    ok({
      items: [{ question_id: 7, content: "私有旧题", options: "甲|乙" }],
      total: 1,
      page: 1,
      size: 12,
    }),
  );
  s.calls[1].resolve(ok({ items: [], total: 0, page: 1, size: 12 }));
  await flush();
  assert.equal(p.data.question_list.length, 0);
  assert.equal(p.data.view_state, "empty");
  assert.equal(s.sounds.length, 0);
});
test("late store result from another owner is rejected and does not seed the new owner", async () => {
  const s = runtime();
  const old = s.api.loadFavorite(8);
  s.setOwner("account-b");
  const current = s.api.loadFavorite(8);
  s.calls[0].resolve(ok({ question_id: 8, favorite: true }));
  await assert.rejects(old, /账号已变更/);
  assert.equal(s.api.getFavoriteSnapshot(8).known, false);
  s.calls[1].resolve(ok({ question_id: 8, favorite: false }));
  await current;
  assert.equal(s.api.getFavoriteSnapshot(8).favorite, false);
});
test("uncertain failed write requires GET reconciliation before another toggle", async () => {
  const s = runtime(),
    { c } = component(s, 8);
  s.calls[0].resolve(ok({ question_id: 8, favorite: false }));
  await flush();
  const write = c.toggleFavorite();
  s.calls[1].reject(Error("offline"));
  await write;
  assert.equal(c.data.favorite, false);
  assert.equal(c.data.known, false);
  const retry = c.toggleFavorite();
  assert.equal(s.calls[2].method, "GET");
  s.calls[2].resolve(ok({ question_id: 8, favorite: true }));
  await retry;
  assert.equal(c.data.favorite, true);
  assert.equal(s.calls.filter((x) => x.method === "POST").length, 1);
});
test("explicit cancellation waits for the current lookup before sending its target", async () => {
  const s = runtime();
  const load = s.api.loadFavorite(9);
  const removal = s.api.setFavorite(9, false);
  s.calls[0].resolve(ok({ question_id: 9, favorite: true }));
  await load;
  await flush();
  assert.equal(s.calls.length, 2);
  assert.equal(s.calls[1].method, "POST");
  assert.equal(s.calls[1].data.favorite, false);
  s.calls[1].resolve(ok({ question_id: 9, favorite: false }));
  await removal;
  assert.equal(s.api.getFavoriteSnapshot(9).favorite, false);
});
test("pagination error keeps earlier records and retry uses the same failed page", async () => {
  const s = runtime(),
    p = page(s);
  s.calls[0].resolve(
    ok({
      items: [{ question_id: 1, content: "题目", options: "甲|乙" }],
      total: 25,
      page: 1,
      size: 12,
    }),
  );
  await flush();
  p.onReachBottom();
  s.calls[1].reject(Error("offline"));
  await flush();
  assert.equal(p.data.question_list.length, 1);
  assert.equal(p.data.page, 1);
  assert.ok(p.data.more_error);
  p.retryMore();
  assert.equal(s.calls[2].data.page, 2);
  s.calls[2].resolve(ok({ items: [], total: 1, page: 2, size: 12 }));
  await flush();
  assert.equal(p.data.no_more_data, true);
});

test("real auth token refresh retains favorite owner and confirmed state", async () => {
  const storage = new Map(),
    requests = [];
  const wx = {
    getStorageSync: (k) => storage.get(k),
    setStorageSync: (k, v) => storage.set(k, v),
    removeStorageSync: (k) => storage.delete(k),
    request: (o) => requests.push(o),
  };
  const { api, scope } = loadAuth({
    wx,
    Date,
    Math,
    Promise,
    WeakMap,
    Map,
    Set,
    Error,
    Number,
    Object,
    Array,
    JSON,
    Boolean,
    String,
  });
  const credentials = (token) => ({
    uid: "u1",
    token,
    refresh_token: "refresh",
    session_id: "sid",
    access_expires_in: 7200,
    refresh_expires_in: 2592000,
  });
  api.saveAuthSession(credentials("old"), { manual: true });
  const owner = api.getSessionIdentity();
  scope.httpGET = (path, data) =>
    api.requestWithSession(
      "https://challenge.haihui.site/" + path,
      "GET",
      data,
      false,
    );
  scope.httpPOST = (path, data) =>
    api.requestWithSession(
      "https://challenge.haihui.site/" + path,
      "POST",
      data,
      false,
    );
  vm.runInContext(
    read("utils/favorites.js") +
      "\nthis.favorites={loadFavorite,setFavorite,getFavoriteSnapshot};",
    scope,
  );
  const load = scope.favorites.loadFavorite(42);
  await flush();
  requests[0].success(ok({ question_id: 42, favorite: false }));
  await load;
  const write = scope.favorites.setFavorite(42, true);
  await flush();
  requests[1].success({ statusCode: 401, data: { code: 11111 } });
  await flush();
  requests[2].success(ok(credentials("new")));
  await flush();
  requests[3].success(ok({ question_id: 42, favorite: true }));
  await write;
  assert.equal(api.getSessionIdentity(), owner);
  assert.equal(scope.favorites.getFavoriteSnapshot(42).favorite, true);
  assert.equal(scope.favorites.getFavoriteSnapshot(42).owner, owner);
  assert.equal(requests[1].data.favorite, true);
  assert.equal(requests[3].data.favorite, true);
  assert.equal(requests.length, 4);
});
test("compact favorite control declares a boolean input and keeps confirmed toggle behavior", async () => {
  const s = runtime(),
    { c, d } = component(s, 4);
  assert.equal(typeof d.properties.compact, "object");
  assert.equal(d.properties.compact.type, s.scope.Boolean);
  assert.equal(d.properties.compact.value, false);
  c.data.compact = true;
  s.calls[0].resolve(ok({ question_id: 4, favorite: false }));
  await flush();
  const action = c.toggleFavorite();
  assert.equal(c.data.favorite, false);
  s.calls[1].resolve(ok({ question_id: 4, favorite: true }));
  await action;
  assert.equal(c.data.favorite, true);
});

test("a list read started before cancellation cannot overwrite the confirmed write", async () => {
  const s = runtime();
  const p = page(s);
  const cancel = s.api.setFavorite(11, false);
  s.calls[1].resolve(ok({ question_id: 11, favorite: false }));
  await cancel;
  assert.equal(s.api.getFavoriteSnapshot(11).favorite, false);
  s.calls[0].resolve(
    ok({
      items: [{ question_id: 11, content: "旧收藏快照", options: "甲|乙" }],
      total: 1,
      page: 1,
      size: 12,
    }),
  );
  await flush();
  assert.equal(s.api.getFavoriteSnapshot(11).favorite, false);
  assert.equal(s.calls[2].data.page, 1);
  s.calls[2].resolve(ok({ items: [], total: 0, page: 1, size: 12 }));
  await flush();
  assert.equal(p.data.view_state, "empty");
});
test("returning to favorites waits for an earlier cancellation before requesting the new list", async () => {
  const s = runtime(),
    p = page(s);
  s.calls[0].resolve(
    ok({
      items: [{ question_id: 1, content: "题目", options: "甲|乙" }],
      total: 1,
      page: 1,
      size: 12,
    }),
  );
  await flush();
  const cancel = p.removeFavorite({ currentTarget: { dataset: { id: 1 } } });
  assert.equal(s.calls[1].method, "POST");
  p.onHide();
  p.onShow();
  assert.equal(
    s.calls.length,
    2,
    "returning must wait instead of fetching a stale list",
  );
  s.calls[1].resolve(ok({ question_id: 1, favorite: false }));
  await cancel;
  await flush();
  assert.equal(s.calls.length, 3);
  assert.equal(s.calls[2].path, "api/question/favorites");
  s.calls[2].resolve(ok({ items: [], total: 0, page: 1, size: 12 }));
  await flush();
  assert.equal(p.data.view_state, "empty");
  assert.equal(p.data.question_list.length, 0);
});
test("changing owner while a returned page waits for cancellation never starts an obsolete list GET", async () => {
  const s = runtime(),
    p = page(s);
  s.calls[0].resolve(
    ok({
      items: [{ question_id: 1, content: "题目", options: "甲|乙" }],
      total: 1,
      page: 1,
      size: 12,
    }),
  );
  await flush();
  const cancel = p.removeFavorite({ currentTarget: { dataset: { id: 1 } } });
  p.onHide();
  p.onShow();
  s.setOwner("account-b");
  p.onShow();
  assert.equal(s.calls.length, 3);
  s.calls[1].resolve(ok({ question_id: 1, favorite: false }));
  await cancel;
  await flush();
  assert.equal(
    s.calls.length,
    3,
    "old waiting generation must not issue another GET",
  );
  s.calls[2].resolve(ok({ items: [], total: 0, page: 1, size: 12 }));
  await flush();
  assert.equal(p.data.view_state, "empty");
});
function removalPopup(s, p) {
  s.scope.createModalLock = () => ({
    set() {},
    dispose() {},
    hide() {},
    show() {},
  });
  vm.runInContext(
    "(function(){" + read("component/popup/popup.js") + "\n})()",
    s.scope,
  );
  const d = s.scope.component;
  const popup = {
    ...d.methods,
    data: {
      ...Object.fromEntries(
        Object.entries(d.properties).map(([key, value]) => [key, value.value]),
      ),
      ...d.data,
    },
    setData(value) {
      Object.assign(this.data, value);
    },
    triggerEvent(event) {
      return event === "success"
        ? p.confirmRemoveFavorite()
        : p.cancelRemoveFavorite();
    },
  };
  d.lifetimes.attached.call(popup);
  p.selectComponent = () => popup;
  return popup;
}
async function loadedFavorites(
  s,
  items = [{ question_id: 1, content: "题目", options: "甲|乙" }],
) {
  const p = page(s);
  s.calls[0].resolve(ok({ items, total: items.length, page: 1, size: 12 }));
  await flush();
  return p;
}
test("favorite star opens confirmation and keeping the favorite sends no POST", async () => {
  const s = runtime(),
    p = await loadedFavorites(s),
    popup = removalPopup(s, p);
  assert.equal(
    typeof p.requestRemoveFavorite,
    "function",
    "favorite star needs a confirmation-only action",
  );
  p.requestRemoveFavorite({ currentTarget: { dataset: { id: 1 } } });
  assert.equal(popup.data.flag, false);
  assert.equal(s.calls.length, 1);
  assert.equal(s.sounds.length, 1);
  popup.popupCancel();
  assert.equal(popup.data.flag, true);
  assert.equal(s.calls.length, 1);
  assert.equal(s.sounds.length, 2);
});
test("confirming removal twice sends one POST and does not add a second handler sound", async () => {
  const s = runtime(),
    p = await loadedFavorites(s),
    popup = removalPopup(s, p);
  assert.equal(typeof p.requestRemoveFavorite, "function");
  p.requestRemoveFavorite({ currentTarget: { dataset: { id: 1 } } });
  popup.popupConfirm();
  assert.equal(
    s.sounds.length,
    2,
    "one star sound plus the popup confirmation sound",
  );
  popup.popupConfirm();
  assert.equal(s.calls.filter((call) => call.method === "POST").length, 1);
  assert.equal(s.calls[1].data.favorite, false);
  s.calls[1].resolve(ok({ question_id: 1, favorite: false }));
  await flush();
  assert.equal(s.calls[2].data.page, 1);
  s.calls[2].resolve(ok({ items: [], total: 0, page: 1, size: 12 }));
  await flush();
  assert.equal(p.data.view_state, "empty");
});
test("hidden, refreshed, unloaded or other-owner removal confirmations cannot delete a newer list", async () => {
  for (const invalidate of [
    (p) => p.onHide(),
    (p) => p.refreshFavorites(),
    (p) => p.onUnload(),
    (p, s) => s.setOwner("account-b"),
  ]) {
    const s = runtime(),
      p = await loadedFavorites(s),
      popup = removalPopup(s, p);
    assert.equal(typeof p.requestRemoveFavorite, "function");
    p.requestRemoveFavorite({ currentTarget: { dataset: { id: 1 } } });
    invalidate(p, s);
    popup.popupConfirm();
    assert.equal(s.calls.filter((call) => call.method === "POST").length, 0);
  }
});
test("favorite cards show the recorded local timestamp without a clock or timezone replacement", async () => {
  const s = runtime();
  const p = await loadedFavorites(s, [
    {
      question_id: 1,
      content: "题目",
      created_at: "2026-11-01T08:09:10",
      options: "甲|乙",
    },
    {
      question_id: 2,
      content: "题目",
      created_at: "2026-10-31T23:45",
      options: "甲|乙",
    },
    { question_id: 3, content: "题目", created_at: null, options: "甲|乙" },
    {
      question_id: 4,
      content: "题目",
      created_at: "invalid",
      options: "甲|乙",
    },
  ]);
  assert.deepEqual(
    Array.from(p.data.question_list, (item) => item.created_at_text),
    ["2026-11-01 08:09:10", "2026-10-31 23:45:00", "—", "—"],
  );
});
test("favorite sharing opens the actual question poster with ordered empty option slots and no answer write", async () => {
  const s = runtime(),
    p = await loadedFavorites(s, [
      {
        question_id: 27,
        content: "题干###https://example.com/photo.png",
        options: "第二||第一|",
      },
    ]);
  const opened = [],
    poster = {
      data: { visible: false },
      open(value) {
        opened.push(value);
        this.data.visible = true;
      },
    };
  p.selectComponent = (selector) =>
    selector === "#favorites-poster" ? poster : null;
  assert.equal(typeof p.openFavoriteQuestionPoster, "function");
  p.openFavoriteQuestionPoster({ currentTarget: { dataset: { id: 27 } } });
  assert.equal(opened[0].id, 27);
  assert.equal(opened[0].content, "题干");
  assert.equal(opened[0].question_image, "https://example.com/photo.png");
  assert.deepEqual(Array.from(opened[0].options), ["第二", "", "第一", ""]);
  assert.equal(opened[0].option_type, 0);
  assert.equal(s.calls.length, 1);
  assert.equal(s.navigation.length, 0);
  assert.equal(s.sounds.length, 1);
  p.openFavoriteQuestionPoster({ currentTarget: { dataset: { id: 27 } } });
  assert.equal(opened.length, 1);
  assert.equal(s.sounds.length, 1);
});
test("favorite sharing preserves array order and recognizes image options after an empty slot", async () => {
  const s = runtime(),
    p = await loadedFavorites(s, [
      {
        question_id: 3,
        content: "图片题",
        options: [
          "",
          "https://example.com/b.png",
          "https://example.com/a.png",
          "",
        ],
      },
    ]);
  let opened;
  p.selectComponent = (selector) =>
    selector === "#favorites-poster"
      ? {
          data: { visible: false },
          open(value) {
            opened = value;
          },
        }
      : null;
  assert.equal(typeof p.openFavoriteQuestionPoster, "function");
  p.openFavoriteQuestionPoster({ currentTarget: { dataset: { id: 3 } } });
  assert.deepEqual(Array.from(opened.options), [
    "",
    "https://example.com/b.png",
    "https://example.com/a.png",
    "",
  ]);
  assert.equal(opened.option_type, 1);
});
test("share and answer actions cannot pass through an open removal confirmation or use stale items", async () => {
  const s = runtime(),
    p = await loadedFavorites(s),
    popup = removalPopup(s, p),
    opened = [];
  p.selectComponent = (selector) =>
    selector === "#favorites-poster"
      ? {
          data: { visible: false },
          open(value) {
            opened.push(value);
          },
        }
      : popup;
  assert.equal(typeof p.openFavoriteQuestionPoster, "function");
  p.requestRemoveFavorite({ currentTarget: { dataset: { id: 1 } } });
  p.openFavoriteQuestionPoster({ currentTarget: { dataset: { id: 1 } } });
  p.openQuestion({ currentTarget: { dataset: { id: 1 } } });
  assert.equal(opened.length, 0);
  assert.equal(s.navigation.length, 0);
  popup.popupCancel();
  p.openFavoriteQuestionPoster({ currentTarget: { dataset: { id: 99 } } });
  assert.equal(opened.length, 0);
  s.setOwner("account-b");
  p.openFavoriteQuestionPoster({ currentTarget: { dataset: { id: 1 } } });
  assert.equal(opened.length, 0);
});
test("favorite card markup puts plain recorded time and all three actions in one footer", () => {
  const source = fs.readFileSync(
    new URL("../pages/favorites/favorites.wxml", import.meta.url),
    "utf8",
  );
  assert.doesNotMatch(source, /favorite-card-heading|>收藏题目<|收藏于/);
  const footer = source.slice(
    source.indexOf('class="favorite-card-footer"'),
    source.indexOf('class="favorites-pagination"'),
  );
  assert.match(
    footer,
    /class="favorite-created-at">\{\{item\.created_at_text\}\}<\/text>/,
  );
  for (const action of [
    "requestRemoveFavorite",
    "openFavoriteQuestionPoster",
    "openQuestion",
  ])
    assert.ok(
      footer.includes('bindtap="' + action + '"'),
      action + " belongs in the footer",
    );
  assert.match(source, /<question-poster\s+id="favorites-poster"/);
});
test("refreshing a favorite list closes its old poster and stale hidden rows cannot reopen it", async () => {
  const s = runtime(),
    p = await loadedFavorites(s),
    opened = [],
    closed = [];
  const poster = {
    data: { visible: false },
    open(value) {
      this.data.visible = true;
      opened.push(value);
    },
    close(reason) {
      this.data.visible = false;
      closed.push(reason);
    },
  };
  p.selectComponent = (selector) =>
    selector === "#favorites-poster" ? poster : null;
  p.openFavoriteQuestionPoster({ currentTarget: { dataset: { id: 1 } } });
  p.refreshFavorites();
  assert.equal(closed.length, 1);
  p.openFavoriteQuestionPoster({ currentTarget: { dataset: { id: 1 } } });
  assert.equal(opened.length, 1);
  s.calls[1].resolve(
    ok({
      items: [{ question_id: 2, content: "新题", options: "甲|乙" }],
      total: 1,
      page: 1,
      size: 12,
    }),
  );
  await flush();
  p.onHide();
  p.openFavoriteQuestionPoster({ currentTarget: { dataset: { id: 2 } } });
  assert.equal(opened.length, 1);
});
