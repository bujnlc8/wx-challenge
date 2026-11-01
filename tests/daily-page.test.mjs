import { installAuth } from "./helpers/auth-loader.mjs";
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
function harness(overrides = {}) {
  let definition,
    uid = "old-user",
    navigate = () => {};
  const source = fs
    .readFileSync(new URL("../pages/daily/daily.js", import.meta.url), "utf8")
    .replace(/import[\s\S]*?from\s+["'][^"']+["'];?/g, "");
  const context = vm.createContext({
    getApp: () => ({ clickSound() {} }),
    Page: (d) => (definition = d),
    wx: {
      getStorageSync: (key) => (key === "uid" ? uid : "token"),
      navigateTo: ({ url }) => navigate(url),
    },
    Promise,
    Number,
    String,
    encodeURIComponent,
    showToast: () => {},
    showLoading: () => ({}),
    hideLoading() {},
    DAILY_TEMPLATE_ID: "template",
    ...overrides,
  });
  installAuth(context);
  vm.runInContext(source, context);
  const page = {
    ...definition,
    loadActivity() {},
    data: { ...definition.data },
    setData(v) {
      Object.assign(this.data, v);
    },
  };
  return {
    page,
    owner: () => context.getSessionIdentity(),
    setUid: (u) => (uid = u),
    setNavigate: (fn) => {
      navigate = fn;
    },
  };
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
  const owner = s.owner();
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

function dailyResponse(completed) {
  const today = { date: "2026-11-01", question_id: 42 };
  if (completed !== undefined) today.completed = completed;
  return (path) =>
    Promise.resolve({
      data: {
        code: 10000,
        data: path.endsWith("/today") ? today : { enabled: true, credits: 1 },
      },
    });
}
for (const completed of [true, false, undefined])
  test(`daily accepts completion ${completed} and keeps the original question action`, async () => {
    const s = harness({ httpGET: dailyResponse(completed) });
    await s.page.loadDaily();
    assert.equal(s.page.data.view_state, "ready");
    assert.equal(s.page.data.today.completed, completed === true);
    assert.equal(
      s.page.data.daily_action_label,
      completed === true ? "再答一次" : "开始今日挑战",
    );
    let destination;
    // Use the page's own action and native navigation boundary.
    s.setNavigate((url) => {
      destination = url;
    });
    s.page.startDaily();
    assert.equal(destination, "/pages/single/single?question_id=42&from=daily");
  });
for (const completed of ["true", 1, null])
  test(`daily rejects malformed completion ${JSON.stringify(completed)}`, async () => {
    const s = harness({ httpGET: dailyResponse(completed) });
    await s.page.loadDaily();
    assert.equal(s.page.data.view_state, "error");
    assert.equal(s.page.data.today, null);
  });
