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

test("a successful wrong-record deletion and refresh cannot reopen the real confirmation popup", async () => {
  const s = setup("wrong");
  s.requests[0].resolve(s.ok([s.item(1)]));
  await flush();
  let definition;
  const strip = (source) =>
    source
      .replace(/import[\s\S]*?from\s+["'][^"']+["'];?/g, "")
      .replace(/export\s*\{[\s\S]*?\};?/g, "");
  runWithAuth(
    strip(
      readFileSync(new URL("../utils/modal-lock.js", import.meta.url), "utf8"),
    ) +
      "\n" +
      strip(
        readFileSync(
          new URL("../component/popup/popup.js", import.meta.url),
          "utf8",
        ),
      ),
    {
      getCurrentPages: () => [s.p],
      getApp: () => ({ clickSound() {} }),
      wx: { getStorageSync: () => "" },
      Component: (value) => {
        definition = value;
      },
    },
  );
  const popup = {
    ...definition.methods,
    data: {
      ...Object.fromEntries(
        Object.entries(definition.properties).map(([key, prop]) => [
          key,
          prop.value,
        ]),
      ),
      ...definition.data,
    },
    setData(patch) {
      Object.assign(this.data, patch);
      if ("flag" in patch || "content" in patch)
        definition.observers["flag, content"].call(
          this,
          this.data.flag,
          this.data.content,
        );
    },
    triggerEvent(name) {
      if (name === "success") s.p.popupConfirm();
    },
  };
  definition.lifetimes.attached.call(popup);
  s.p.popup = popup;
  s.p.longpressQuestion({ mark: { i: 1, ii: 0 } });
  assert.equal(popup.data.flag, false);
  assert.equal(s.p.data.modal_locked, true);
  popup.popupConfirm();
  assert.equal(popup.data.flag, true);
  s.requests[1].resolve({ data: { code: 10000, data: { result: true } } });
  await flush();
  assert.equal(
    popup.data.flag,
    true,
    "refresh must keep the confirmed dialog closed",
  );
  assert.equal(s.p.data.modal_locked, false);
  assert.equal(
    s.requests.filter((r) => r.path === "api/question/delete-wrong-question")
      .length,
    1,
  );
  s.requests[2].resolve(s.ok([]));
  await flush();
  s.p.onHide();
  s.p.onShow();
  assert.equal(popup.data.flag, true);
  assert.equal(s.p.data.modal_locked, false);
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
