import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runWithAuth } from "./helpers/auth-loader.mjs";

const flush = async () => {
  for (let i = 0; i < 12; i++) await Promise.resolve();
};
function setup(name, size) {
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
    data: { ...structuredClone(definition.data), ...(size ? { size } : {}) },
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

test("a successful wrong-record deletion stays local and cannot reopen the real confirmation popup", async () => {
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
  assert.equal(
    s.requests.length,
    2,
    "confirmed deletion must not reload the list",
  );
  assert.equal(s.p.data.view_state, "empty");
  s.p.onHide();
  s.p.onShow();
  assert.equal(popup.data.flag, true);
  assert.equal(s.p.data.modal_locked, false);
});

test("deleting the last loaded wrong record updates the empty state without a GET", async () => {
  const s = setup("wrong");
  s.p.popup = { setData() {}, showPopup() {}, hidePopup() {} };
  s.requests[0].resolve(s.ok([s.item(1)]));
  await flush();
  s.p.longpressQuestion({ mark: { i: 1, ii: 0 } });
  s.p.popupConfirm();
  s.requests[1].resolve({ data: { code: 10000, data: { result: true } } });
  await flush();
  assert.equal(s.requests.length, 2);
  assert.equal(s.p.data.view_state, "empty");
  assert.equal(s.p.data.page, 1);
});

test("manual refresh waits for the pending deletion before reading the new list", async () => {
  const s = setup("wrong");
  s.p.popup = { setData() {}, showPopup() {}, hidePopup() {} };
  s.requests[0].resolve(s.ok([s.item(1)]));
  await flush();
  s.p.longpressQuestion({ mark: { i: 1, ii: 0 } });
  s.p.popupConfirm();
  s.p.onPullDownRefresh();
  assert.equal(
    s.requests.length,
    2,
    "do not read an offset snapshot during a pending write",
  );
  s.requests[1].resolve({ data: { code: 10000, data: { result: true } } });
  await flush();
  assert.equal(s.requests.length, 3);
  s.requests[2].resolve(s.ok([s.item(2)]));
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

test("a confirmed deletion while hidden is applied locally on returning", async () => {
  const s = setup("wrong");
  s.p.popup = { setData() {}, showPopup() {}, hidePopup() {} };
  s.requests[0].resolve(s.ok([s.item(1), s.item(2)]));
  await flush();
  const row = s.list()[1];
  s.p.longpressQuestion({ mark: { i: 1, ii: 0 } });
  s.p.popupConfirm();
  s.p.onHide();
  s.requests[1].resolve({ data: { code: 10000, data: { result: true } } });
  await flush();
  s.p.onShow();
  assert.equal(s.requests.length, 2);
  assert.equal(s.list().length, 1);
  assert.equal(s.list()[0], row);
});

async function removeWrong(s, id) {
  const index = s.list().findIndex((item) => item.id === id);
  s.p.longpressQuestion({ mark: { i: id, ii: index } });
  const task = s.p.popupConfirm();
  const count = s.requests.length;
  s.requests.at(-1).resolve({ data: { code: 10000, data: { result: true } } });
  await flush();
  assert.equal(
    s.requests.length,
    count,
    "successful deletion must not read the list again",
  );
  await task;
}

test("a deletion deep in the list keeps other rows, expanded answers and the confirmed page", async () => {
  const s = setup("wrong", 3);
  s.p.popup = { setData() {}, showPopup() {}, hidePopup() {} };
  s.requests[0].resolve(s.ok([9, 8, 7].map(s.item)));
  await flush();
  s.p.onReachBottom();
  s.requests[1].resolve(s.ok([6, 5, 4].map(s.item)));
  await flush();
  const rows = s.list().filter((item) => item.id !== 8);
  s.p.data.show_answer_ids = [8, 5];
  await removeWrong(s, 8);
  assert.equal(s.requests.length, 3);
  assert.equal(s.p.data.page, 2);
  assert.equal(s.p.data.view_state, "ready");
  assert.equal(s.list().length, 5);
  rows.forEach((row, i) => assert.equal(s.list()[i], row));
  assert.deepEqual(Array.from(s.p.data.show_answer_ids), [5]);
  s.p.onReachBottom();
  assert.equal(
    s.requests[3].data.page,
    2,
    "reread the boundary page to fill the shifted offset",
  );
  s.requests[3].resolve(s.ok([5, 4, 3].map(s.item)));
  await flush();
  assert.deepEqual(
    Array.from(s.list(), (item) => item.id),
    [9, 7, 6, 5, 4, 3],
  );
  s.p.onReachBottom();
  assert.equal(s.requests[4].data.page, 3);
  s.requests[4].resolve(s.ok([2, 1].map(s.item)));
  await flush();
  assert.deepEqual(
    Array.from(s.list(), (item) => item.id),
    [9, 7, 6, 5, 4, 3, 2, 1],
  );
});

test("a failed boundary read on page one remains an append error and retries without clearing rows", async () => {
  const s = setup("wrong", 3);
  s.p.popup = { setData() {}, showPopup() {}, hidePopup() {} };
  s.requests[0].resolve(s.ok([6, 5, 4].map(s.item)));
  await flush();
  await removeWrong(s, 5);
  s.p.onReachBottom();
  assert.equal(s.requests[2].data.page, 1);
  s.requests[2].reject(Error("offline"));
  await flush();
  assert.equal(s.p.data.view_state, "ready");
  assert.deepEqual(
    Array.from(s.list(), (item) => item.id),
    [6, 4],
  );
  assert.match(s.p.data.more_error, /offline/);
  s.p.retryMore();
  assert.equal(s.requests[3].data.page, 1);
  s.requests[3].resolve(s.ok([6, 4, 3].map(s.item)));
  await flush();
  assert.deepEqual(
    Array.from(s.list(), (item) => item.id),
    [6, 4, 3],
  );
});

test("a known deleted id in a later list payload cannot reappear", async () => {
  const s = setup("wrong");
  s.p.popup = { setData() {}, showPopup() {}, hidePopup() {} };
  s.requests[0].resolve(s.ok([s.item(1), s.item(2)]));
  await flush();
  await removeWrong(s, 1);
  s.p.onPullDownRefresh();
  s.requests[2].resolve(s.ok([s.item(1), s.item(2)]));
  await flush();
  assert.deepEqual(
    Array.from(s.list(), (item) => item.id),
    [2],
  );
});

test("an uncertain deletion keeps the visible list and does not reset the page", async () => {
  const s = setup("wrong");
  s.p.popup = { setData() {}, showPopup() {}, hidePopup() {} };
  s.requests[0].resolve(s.ok([s.item(1), s.item(2)]));
  await flush();
  const rows = s.list();
  s.p.longpressQuestion({ mark: { i: 1, ii: 0 } });
  const task = s.p.popupConfirm();
  s.requests[1].reject(Error("response lost"));
  await flush();
  assert.equal(s.requests.length, 2);
  await task;
  assert.equal(s.list(), rows);
  assert.equal(s.p.data.page, 1);
  assert.equal(s.p.data.view_state, "ready");
});

for (const committed of [true, false]) {
  test(`an uncertain deletion with server commit ${committed} cannot skip unread rows`, async () => {
    const s = setup("wrong", 3);
    s.p.popup = { setData() {}, showPopup() {}, hidePopup() {} };
    s.requests[0].resolve(s.ok([6, 5, 4].map(s.item)));
    await flush();
    s.p.longpressQuestion({ mark: { i: 5, ii: 1 } });
    const task = s.p.popupConfirm();
    s.requests[1].reject(Error("response lost"));
    await task;
    const server = committed ? [6, 4, 3, 2, 1] : [6, 5, 4, 3, 2, 1];
    s.p.onReachBottom();
    assert.equal(
      s.requests[2].data.page,
      1,
      "conservatively reread the boundary after an uncertain write",
    );
    s.requests[2].resolve(s.ok(server.slice(0, 3).map(s.item)));
    await flush();
    s.p.onReachBottom();
    assert.equal(s.requests[3].data.page, 2);
    s.requests[3].resolve(s.ok(server.slice(3, 6).map(s.item)));
    await flush();
    const ids = Array.from(s.list(), (item) => item.id);
    assert.ok(
      server.every((id) => ids.includes(id)),
      "every unread valid row must remain reachable",
    );
    assert.equal(new Set(ids).size, ids.length);
  });
}

test("switching accounts during deletion still loads the new account immediately", async () => {
  const s = setup("wrong");
  s.p.popup = { setData() {}, showPopup() {}, hidePopup() {} };
  s.requests[0].resolve(s.ok([s.item(1)]));
  await flush();
  s.p.longpressQuestion({ mark: { i: 1, ii: 0 } });
  s.p.popupConfirm();
  s.storage.set("uid", "u2");
  s.storage.set("token", "t2");
  s.p.onShow();
  assert.equal(s.requests.length, 3);
  s.requests[2].resolve(s.ok([s.item(2)]));
  await flush();
  s.requests[1].resolve({ data: { code: 10000, data: { result: true } } });
  await flush();
  assert.deepEqual(
    Array.from(s.list(), (item) => item.id),
    [2],
  );
  assert.equal(s.p.data.view_state, "ready");
});

test("returning after removing every loaded row continues into unread server rows", async () => {
  const s = setup("wrong", 1);
  s.p.popup = { setData() {}, showPopup() {}, hidePopup() {} };
  s.requests[0].resolve(s.ok([s.item(3)]));
  await flush();
  s.p.longpressQuestion({ mark: { i: 3, ii: 0 } });
  s.p.popupConfirm();
  s.p.onHide();
  s.requests[1].resolve({ data: { code: 10000, data: { result: true } } });
  await flush();
  s.p.onShow();
  assert.equal(s.requests.length, 3);
  assert.equal(s.requests[2].data.page, 1);
  s.requests[2].resolve(s.ok([s.item(2)]));
  await flush();
  assert.deepEqual(
    Array.from(s.list(), (item) => item.id),
    [2],
  );
});
