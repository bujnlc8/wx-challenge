import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
function setup() {
  let definition;
  const requests = [];
  const toasts = [];
  let logins = 0;
  const storage = new Map([
    ["uid", "u1"],
    ["token", "old-token"],
    ["mine_cache", { name: "old" }],
    ["daily-reminder:u1:t:2026-11-01", true],
    ["question_category", 2],
    ["sound_close", 1],
  ]);
  const source = fs
    .readFileSync(new URL("../pages/daily/daily.js", import.meta.url), "utf8")
    .replace(/import[\s\S]*?from\s+["'][^"']+["'];?/g, "");
  vm.runInNewContext(source, {
    Page(value) {
      definition = value;
    },
    getApp: () => ({
      checkLogin(callback) {
        logins++;
        storage.set("uid", "u1");
        storage.set("token", "fresh-token");
        callback();
      },
    }),
    wx: {
      getStorageSync: (key) => storage.get(key),
      removeStorageSync: (key) => storage.delete(key),
    },
    createDailySubscription: () => ({
      request: async () => ({ choice: "reject" }),
    }),
    DAILY_TEMPLATE_ID: "t",
    showLoading: () => ({}),
    hideLoading() {},
    showToast: (text) => toasts.push(text),
    buildActivityCalendar: (value) => ({ ...value, today: {} }),
    httpGET(path) {
      return new Promise((resolve, reject) =>
        requests.push({ path, resolve, reject }),
      );
    },
  });
  const p = {
    ...definition,
    data: {
      ...definition.data,
      today: { question_id: 42 },
      enabled: true,
      credits: 9,
      activity: { total_count: 99 },
      activity_selected: { count: 99 },
    },
    _visible: true,
    setData(patch, done) {
      Object.assign(this.data, patch);
      if (done) done();
    },
  };
  p.onLoad();
  return { p, storage, requests, toasts, loginCount: () => logins };
}
async function flush() {
  await new Promise((resolve) => setImmediate(resolve));
}
for (const code of [401, 11111])
  test(`daily authentication ${code} clears session and old account data while keeping local caps and preferences`, async () => {
    const s = setup();
    const task = s.p.loadDaily();
    s.requests[0].resolve(
      code === 401 ? { statusCode: 401 } : { data: { code: 11111 } },
    );
    await task;
    assert.equal(s.p.data.view_state, "logged-out");
    assert.equal(s.p.data.pending, false);
    assert.equal(s.p.data.today, null);
    assert.equal(s.p.data.activity, null);
    assert.equal(s.p.data.enabled, false);
    for (const key of ["uid", "token", "mine_cache"])
      assert.equal(s.storage.has(key), false);
    assert.equal(s.storage.get("daily-reminder:u1:t:2026-11-01"), true);
    assert.equal(s.storage.get("question_category"), 2);
    assert.equal(s.storage.get("sound_close"), 1);
    s.p.loginAndLoad();
    assert.equal(s.loginCount(), 1);
    assert.equal(
      s.requests.filter((r) => r.path.endsWith("/activity")).length,
      1,
    );
    assert.equal(s.requests.filter((r) => r.path.endsWith("/today")).length, 2);
  });
test("heatmap auth failure clears old contributions and switches the whole page to login", async () => {
  const s = setup();
  const task = s.p.loadActivity();
  s.requests[0].resolve({ statusCode: 401, data: {} });
  await task;
  assert.equal(s.p.data.view_state, "logged-out");
  assert.equal(s.p.data.activity, null);
  assert.equal(s.p.data.activity_selected, null);
});
test("late daily or heatmap auth failures never clear newer account credentials or UI", async () => {
  for (const method of ["loadDaily", "loadActivity"]) {
    const s = setup();
    const task = s.p[method]();
    s.storage.set("uid", "u2");
    s.storage.set("token", "new-token");
    s.requests[0].resolve({ statusCode: 401, data: { code: 11111 } });
    await task;
    assert.equal(s.storage.get("uid"), "u2");
    assert.equal(s.storage.get("token"), "new-token");
    assert.notEqual(s.p.data.view_state, "logged-out");
  }
});
test("a superseded daily operation ignores an old auth failure even for the same account", async () => {
  const s = setup();
  const old = s.p.loadDaily();
  const current = s.p.loadDaily();
  s.requests[0].resolve({ statusCode: 401, data: {} });
  await old;
  assert.equal(s.storage.get("uid"), "u1");
  assert.notEqual(s.p.data.view_state, "logged-out");
});

test("reminder auth expiry invalidates an overlapping heatmap result and cannot redisplay old statistics", async () => {
  const s = setup();
  const daily = s.p.loadDaily();
  const activity = s.p.loadActivity();
  s.requests
    .find((request) => request.path.endsWith("/reminder"))
    .resolve({ data: { code: 11111 } });
  await daily;
  s.requests
    .find((request) => request.path.endsWith("/activity"))
    .resolve({ data: { code: 10000, data: { total_count: 999 } } });
  await activity;
  assert.equal(s.p.data.view_state, "logged-out");
  assert.equal(s.p.data.activity, null);
});
test("an old auth failure after token refresh cannot erase the new token on the same UID", async () => {
  const s = setup();
  const task = s.p.loadDaily();
  s.storage.set("token", "refreshed-token");
  s.requests[0].resolve({ statusCode: 401, data: {} });
  await task;
  assert.equal(s.storage.get("uid"), "u1");
  assert.equal(s.storage.get("token"), "refreshed-token");
  assert.notEqual(s.p.data.view_state, "logged-out");
});
