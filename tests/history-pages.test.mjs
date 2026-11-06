import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runWithAuth } from "./helpers/auth-loader.mjs";

const flush = async () => {
  for (let i = 0; i < 12; i++) await Promise.resolve();
};
function setup(name) {
  let definition;
  const requests = [],
    storage = new Map([
      ["uid", "u1"],
      ["token", "t1"],
      ["wrong_show_tip", 1],
    ]);
  const source = readFileSync(
    new URL(`../pages/${name}/${name}.js`, import.meta.url),
    "utf8",
  ).replace(/import[\s\S]*?from\s+["'][^"']+["'];?/g, "");
  runWithAuth(source, {
    getApp: () => ({
      clickSound() {},
      playSound() {},
      checkLogin(cb) {
        cb();
      },
    }),
    Page: (value) => {
      definition = value;
    },
    wx: {
      getStorageSync: (key) => storage.get(key),
      setStorageSync: (key, value) => storage.set(key, value),
      removeStorageSync: (key) => storage.delete(key),
      setStorage() {},
      setNavigationBarTitle() {},
      hideShareMenu() {},
      stopPullDownRefresh() {},
    },
    httpGET: (path, data) =>
      new Promise((resolve, reject) =>
        requests.push({ path, data, resolve, reject }),
      ),
    httpDELETE: (path, data) =>
      new Promise((resolve, reject) =>
        requests.push({ path, data, resolve, reject }),
      ),
    showToast() {},
  });
  const p = {
    ...definition,
    data: structuredClone(definition.data),
    setData(patch) {
      Object.assign(this.data, patch);
    },
  };
  p.onLoad();
  p.onShow();
  const list = () => p.data[name === "wrong" ? "question_list" : "record_list"];
  const item = (id) =>
    name === "wrong"
      ? { id, question_id: id, content: "题目", options: "甲|乙" }
      : { id, amount: 100, source_text: "答题", create_time: "2026-11-07" };
  const ok = (items) => ({
    data: { code: 10000, data: name === "wrong" ? items : { list: items } },
  });
  return { p, requests, storage, list, item, ok };
}

test("folding an earlier wrong answer keeps other expanded answers open", () => {
  const { p } = setup("wrong");
  for (const id of [101, 102, 101]) p.showAnswer({ mark: { i: id } });
  assert.deepEqual(Array.from(p.data.show_answer_ids), [102]);
});

test("deleting a wrong record refreshes shifted pages and can reach the empty state", async () => {
  const s = setup("wrong");
  s.p.popup = { setData() {}, showPopup() {}, hidePopup() {} };
  s.requests[0].resolve(s.ok([s.item(1)]));
  await flush();
  s.p.longpressQuestion({ mark: { i: 1, ii: 0 } });
  s.p.popupConfirm();
  s.requests[1].resolve({ data: { code: 10000, data: { result: true } } });
  await flush();
  assert.equal(s.requests.length, 3);
  assert.equal(s.requests[2].data.page, 1);
  s.requests[2].resolve(s.ok([]));
  await flush();
  assert.equal(s.p.data.view_state, "empty");
});

test("a wrong-record deletion completing after refresh revalidates shifted pages", async () => {
  const s = setup("wrong");
  s.p.popup = { setData() {}, showPopup() {}, hidePopup() {} };
  s.requests[0].resolve(s.ok([s.item(1)]));
  await flush();
  s.p.longpressQuestion({ mark: { i: 1, ii: 0 } });
  s.p.popupConfirm();
  s.p.onPullDownRefresh();
  s.requests[2].resolve(s.ok([s.item(2)]));
  await flush();
  s.requests[1].resolve({ data: { code: 10000, data: { result: true } } });
  await flush();
  assert.equal(s.requests.length, 4);
  s.requests[3].resolve(s.ok([s.item(2)]));
  await flush();
  assert.equal(s.list()[0].id, 2);
});

for (const name of ["wrong", "coin"]) {
  test(`${name}: authentication cleared by transport leaves a login state rather than an endless loader`, async () => {
    const s = setup(name);
    s.storage.delete("uid");
    s.storage.delete("token");
    s.requests[0].reject(Error("登录已失效"));
    await flush();
    assert.equal(s.p.data.view_state, "logged-out");
    assert.equal(s.p.data.loading_str, "");
    assert.equal(s.list().length, 0);
  });
  test(`${name}: initial failure stays an error and retries page one into a true empty state`, async () => {
    const s = setup(name);
    s.requests[0].reject(Error("offline"));
    await flush();
    assert.equal(s.p.data.view_state, "error");
    assert.match(s.p.data.error_message, /offline/);
    s.p.retryList();
    assert.equal(s.requests[1].data.page, 1);
    s.requests[1].resolve(s.ok([]));
    await flush();
    assert.equal(s.p.data.view_state, "empty");
    assert.equal(s.p.data.error_message, "");
  });

  test(`${name}: repeated bottom events share a request and a failed page is retried without skipping`, async () => {
    const s = setup(name),
      size = s.p.data.size;
    s.requests[0].resolve(
      s.ok(Array.from({ length: size }, (_, i) => s.item(i + 1))),
    );
    await flush();
    s.p.onReachBottom();
    s.p.onReachBottom();
    s.p.onReachBottom();
    assert.equal(s.requests.length, 2);
    assert.equal(s.p.data.page, 1);
    s.requests[1].reject(Error("offline"));
    await flush();
    assert.equal(s.p.data.page, 1);
    assert.equal(s.list().length, size);
    assert.equal(s.p.data.view_state, "ready");
    assert.match(s.p.data.more_error, /offline/);
    s.p.retryMore();
    assert.equal(s.requests[2].data.page, 2);
    s.requests[2].resolve(s.ok([s.item(size + 1)]));
    await flush();
    assert.equal(s.p.data.page, 2);
    assert.equal(s.list().length, size + 1);
    assert.equal(s.p.data.more_error, "");
    assert.equal(s.p.data.no_more_data, 1);
  });

  test(`${name}: refreshing discards older responses and unloading ignores late results`, async () => {
    const s = setup(name);
    s.p.onPullDownRefresh();
    assert.equal(s.requests.length, 2);
    s.requests[1].resolve(s.ok([s.item(90)]));
    await flush();
    s.requests[0].resolve(s.ok([s.item(1)]));
    await flush();
    assert.equal(s.list()[0].id, 90);
    s.p.onPullDownRefresh();
    const before = JSON.stringify(s.p.data);
    s.p.onUnload();
    const hidden = JSON.stringify(s.p.data);
    s.requests[2].resolve(s.ok([s.item(2)]));
    await flush();
    assert.equal(JSON.stringify(s.p.data), hidden);
    assert.ok(before);
  });

  test(`${name}: an account switch starts a fresh list and old results cannot appear`, async () => {
    const s = setup(name);
    s.storage.set("uid", "u2");
    s.storage.set("token", "t2");
    s.p.onShow();
    assert.equal(s.requests.length, 2);
    s.requests[0].resolve(s.ok([s.item(1)]));
    await flush();
    assert.equal(s.list().length, 0);
    s.requests[1].resolve(s.ok([s.item(2)]));
    await flush();
    assert.equal(s.list()[0].id, 2);
  });
}

test("a wrong-record deletion settled while hidden refreshes on returning", async () => {
  const s = setup("wrong");
  s.p.popup = { setData() {}, showPopup() {}, hidePopup() {} };
  s.requests[0].resolve(s.ok([s.item(1)]));
  await flush();
  s.p.longpressQuestion({ mark: { i: 1, ii: 0 } });
  s.p.popupConfirm();
  s.p.onHide();
  s.requests[1].resolve({ data: { code: 10000, data: { result: true } } });
  await flush();
  assert.equal(s.requests.length, 2);
  s.p.onShow();
  assert.equal(s.requests.length, 3);
  assert.equal(s.requests[2].data.page, 1);
  s.requests[2].resolve(s.ok([]));
  await flush();
  assert.equal(s.p.data.view_state, "empty");
});
