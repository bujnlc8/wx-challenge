import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
const ok = (data) => ({ data: { code: 10000, data } });
async function flush() {
  for (let i = 0; i < 15; i++) await Promise.resolve();
}
function fixture(initialOwner = "account-a") {
  let owner = initialOwner,
    definition;
  const calls = [],
    toasts = [];
  const app = {
    category: 0,
    show_class_tip: 0,
    category_lables: [],
    categories: {},
    clickSound() {},
    checkLogin: (cb) => cb.call(page),
  };
  const scope = vm.createContext({
    getSessionIdentity: () => owner,
    clearAuthSession() {
      owner = "";
    },
    getApp: () => app,
    Page: (value) => (definition = value),
    showToast: (value) => toasts.push(value),
    httpGET: (path, data) =>
      new Promise((resolve, reject) =>
        calls.push({ path, data, resolve, reject, method: "GET" }),
      ),
    httpPOST: (path, data) =>
      new Promise((resolve, reject) =>
        calls.push({ path, data, resolve, reject, method: "POST" }),
      ),
    wx: {
      setNavigationBarTitle() {},
      hideShareMenu() {},
      getStorage() {},
      setStorageSync() {},
      getStorageSync: (key) => (key === "uid" ? owner : ""),
    },
  });
  const store = fs
    .readFileSync(new URL("../utils/favorites.js", import.meta.url), "utf8")
    .replace(/import[\s\S]*?from\s+["'][^"']+["'];?/g, "")
    .replace(/export\s*\{[\s\S]*?\};?/g, "");
  vm.runInContext(store, scope);
  const source = fs
    .readFileSync(new URL("../pages/mine/mine.js", import.meta.url), "utf8")
    .replace(/import[\s\S]*?from\s+["'][^"']+["'];?/g, "");
  vm.runInContext(source, scope);
  const page = {
    ...definition,
    data: { ...definition.data },
    setData(value) {
      Object.assign(this.data, value);
    },
  };
  page.onLoad();
  async function mine(index) {
    calls[index].resolve(ok({ total_question: 0, wrong_question: 0 }));
    await flush();
    assert.equal(
      calls.length,
      index + 2,
      "profile success must request the real favorite count",
    );
  }
  return {
    page,
    calls,
    toasts,
    mine,
    setFavorite: scope.setFavorite,
    setOwner: (value) => (owner = value),
  };
}
test("logged-in Mine fetches the real total and preserves zero as a known count", async () => {
  const f = fixture();
  f.page.onShow();
  await f.mine(0);
  assert.equal(f.calls[1].path, "api/question/favorites");
  assert.deepEqual({ ...f.calls[1].data }, { page: 1, size: 1 });
  f.calls[1].resolve(ok({ items: [], total: 0, page: 1, size: 1 }));
  await flush();
  assert.equal(f.page.data.favorite_count, 0);
  assert.equal(f.toasts.length, 0);
});
test("returning with the same owner keeps the known count until its fresh total arrives", async () => {
  const f = fixture();
  f.page.onShow();
  await f.mine(0);
  f.calls[1].resolve(ok({ items: [], total: 9, page: 1, size: 1 }));
  await flush();
  f.page.onHide();
  f.page.onShow();
  assert.equal(f.page.data.favorite_count, 9);
  await f.mine(2);
  assert.equal(f.page.data.favorite_count, 9);
  f.calls[3].resolve(ok({ items: [], total: 8, page: 1, size: 1 }));
  await flush();
  assert.equal(f.page.data.favorite_count, 8);
});
test("account change clears the count immediately and drops the previous owner response", async () => {
  const f = fixture();
  f.page.onShow();
  await f.mine(0);
  f.calls[1].resolve(ok({ total: 9 }));
  await flush();
  f.page.onHide();
  f.page.onShow();
  await f.mine(2);
  f.setOwner("account-b");
  f.page.onShow();
  assert.equal(f.page.data.favorite_count, null);
  f.calls[3].resolve(ok({ total: 99 }));
  await flush();
  assert.equal(f.page.data.favorite_count, null);
  await f.mine(4);
  f.calls[5].resolve(ok({ total: 2 }));
  await flush();
  assert.equal(f.page.data.favorite_count, 2);
});
test("hidden, unloaded and older-generation totals do not change the displayed count", async () => {
  const f = fixture();
  f.page.onShow();
  await f.mine(0);
  f.page.onHide();
  f.calls[1].resolve(ok({ total: 4 }));
  await flush();
  assert.equal(f.page.data.favorite_count, null);
  f.page.onShow();
  await f.mine(2);
  f.page.onHide();
  f.page.onShow();
  await f.mine(4);
  f.calls[3].resolve(ok({ total: 7 }));
  await flush();
  assert.equal(f.page.data.favorite_count, null);
  f.calls[5].resolve(ok({ total: 3 }));
  await flush();
  assert.equal(f.page.data.favorite_count, 3);
  f.page.onHide();
  f.page.onShow();
  await f.mine(6);
  f.page.onUnload();
  f.calls[7].resolve(ok({ total: 8 }));
  await flush();
  assert.equal(f.page.data.favorite_count, 3);
});
test("failed and invalid totals remain unknown without extra notifications", async () => {
  const f = fixture();
  f.page.onShow();
  await f.mine(0);
  f.calls[1].resolve(ok({ total: 5 }));
  await flush();
  f.page.onHide();
  f.page.onShow();
  await f.mine(2);
  f.calls[3].reject(Error("offline"));
  await flush();
  assert.equal(f.page.data.favorite_count, null);
  f.page.onHide();
  f.page.onShow();
  await f.mine(4);
  f.calls[5].resolve(ok({ total: -1 }));
  await flush();
  assert.equal(f.page.data.favorite_count, null);
  assert.equal(f.toasts.length, 0);
});
test("first login from guest Mine loads the favorite count after profile succeeds", async () => {
  const f = fixture("");
  f.page.onShow();
  assert.equal(f.calls.length, 0);
  assert.equal(f.page.data.favorite_count, null);
  f.setOwner("account-a");
  f.page.login();
  await f.mine(0);
  assert.equal(f.calls[1].path, "api/question/favorites");
  f.calls[1].resolve(ok({ total: 6 }));
  await flush();
  assert.equal(f.page.data.favorite_count, 6);
});

test("Mine waits for a pending favorite write before reading its final total", async () => {
  const f = fixture();
  const save = f.setFavorite(42, true);
  assert.equal(f.calls[0].method, "POST");
  f.page.onShow();
  f.calls[1].resolve(ok({ total_question: 0, wrong_question: 0 }));
  await flush();
  assert.equal(
    f.calls.length,
    2,
    "count must wait until the pending write settles",
  );
  f.calls[0].resolve(ok({ question_id: 42, favorite: true }));
  await save;
  await flush();
  assert.equal(f.calls[2].path, "api/question/favorites");
  f.calls[2].resolve(ok({ items: [], total: 1, page: 1, size: 1 }));
  await flush();
  assert.equal(f.page.data.favorite_count, 1);
});
