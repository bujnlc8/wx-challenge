import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
function harness(overrides = {}) {
  let definition,
    uid = "old-user";
  const source = fs
    .readFileSync(new URL("../pages/daily/daily.js", import.meta.url), "utf8")
    .replace(/import[\s\S]*?from\s+["'][^"']+["'];?/g, "");
  const context = vm.createContext({
    getApp: () => ({}),
    Page: (d) => (definition = d),
    wx: { getStorageSync: (key) => (key === "uid" ? uid : "token") },
    Promise,
    Number,
    String,
    encodeURIComponent,
    showToast: () => {},
    ...overrides,
  });
  vm.runInContext(source, context);
  const page = {
    ...definition,
    data: { ...definition.data },
    setData(v) {
      Object.assign(this.data, v);
    },
  };
  return { page, setUid: (u) => (uid = u) };
}
test("returning after an account switch clears the previous pending state and preferences", () => {
  const s = harness();
  let loads = 0;
  s.page.loadDaily = () => {
    loads++;
  };
  s.page.onShow();
  s.page.data.pending = true;
  s.page.data.enabled = true;
  s.page.data.credits = 9;
  s.setUid("new-user");
  s.page.onShow();
  assert.equal(s.page.data.pending, false);
  assert.equal(s.page.data.enabled, false);
  assert.equal(s.page.data.credits, 0);
  assert.equal(loads, 2);
});
test("leaving the page invalidates callbacks and returning releases stale view pending state", () => {
  const s = harness();
  s.page.loadDaily = () => {};
  s.page.onShow();
  s.page._operation = 5;
  s.page.data.pending = true;
  const owner = "old-user:token";
  assert.equal(s.page.isCurrent(5, owner), true);
  s.page.onHide();
  assert.equal(s.page.isCurrent(5, owner), false);
  s.page.onShow();
  assert.equal(s.page.data.pending, false);
});

test("failed preference save waits for the already-open subscription before releasing pending and reconciling", async () => {
  let resolveSubscription;
  const request = new Promise((resolve) => {
    resolveSubscription = resolve;
  });
  const s = harness({ httpPOST: () => Promise.reject(Error("save failed")) });
  const p = s.page;
  let loads = 0,
    notified = 0;
  p.loadDaily = () => {
    loads++;
  };
  p.onShow();
  loads = 0;
  p.data.view_state = "ready";
  p._subscriptions = { request: () => request };
  p.notifySubscription = () => {
    notified++;
  };
  const action = p.toggleReminder({ detail: { value: true } });
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(p.data.pending, true);
  assert.equal(loads, 0);
  resolveSubscription({ choice: "accept" });
  await action;
  assert.equal(p.data.pending, false);
  assert.equal(loads, 1);
  assert.equal(notified, 1);
});
