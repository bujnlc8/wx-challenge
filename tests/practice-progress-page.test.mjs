import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { runWithAuth } from "./helpers/auth-loader.mjs";

function setup() {
  let now = Date.parse("2026-11-01T04:00:00Z");
  let definition;
  const requests = [];
  const storage = new Map([
    ["uid", "u1"],
    ["token", "t1"],
  ]);
  const source = fs
    .readFileSync(new URL("../pages/train/train.js", import.meta.url), "utf8")
    .replace(/import[\s\S]*?from\s+["'][^"']+["'];?/g, "");
  runWithAuth(source, {
    Date: class extends Date {
      constructor(...args) {
        super(...(args.length ? args : [now]));
      }
      static now() {
        return now;
      }
    },
    Page: (value) => {
      definition = value;
    },
    getApp: () => ({ clickSound() {} }),
    wx: {
      getStorageSync: (key) => storage.get(key),
      setStorageSync: (key, value) => storage.set(key, value),
      removeStorageSync: (key) => storage.delete(key),
      hideShareMenu() {},
    },
    httpGET: (path, data) =>
      new Promise((resolve, reject) =>
        requests.push({ path, data, resolve, reject }),
      ),
  });
  const page = {
    ...definition,
    data: { ...definition.data },
    setData(patch) {
      Object.assign(this.data, patch);
    },
  };
  return {
    page,
    requests,
    storage,
    setNow(value) {
      now = Date.parse(value);
    },
  };
}
const progress = (overrides = {}) => ({
  data: {
    code: 10000,
    data: {
      date: "2026-11-01",
      answered_count: 32,
      target_count: 100,
      reward_coins: 10000,
      reward_received: false,
      ...overrides,
    },
  },
});
const flush = () => new Promise((resolve) => setImmediate(resolve));

test("practice shows canonical progress and caps only the visual bar", async () => {
  const s = setup();
  s.page.onShow();
  assert.equal(s.requests[0].path, "api/question/practice-progress");
  assert.equal(s.page.data.practice_progress_state, "loading");
  s.requests[0].resolve(progress({ answered_count: 127 }));
  await flush();
  assert.equal(s.page.data.practice_progress_state, "ready");
  assert.equal(s.page.data.practice_progress.answered_count, 127);
  assert.equal(s.page.data.practice_progress_percent, 100);
  assert.equal(
    s.page.data.practice_reward_text,
    "已达标，下次练习时自动发放奖励",
  );
});
test("an existing reward ledger stays received without inventing answered questions", async () => {
  const s = setup();
  s.page.onShow();
  s.requests[0].resolve(progress({ answered_count: 0, reward_received: true }));
  await flush();
  assert.equal(s.page.data.practice_progress.answered_count, 0);
  assert.equal(s.page.data.practice_reward_text, "10000百科币已到账");
});
test("logged-out practice never requests protected progress", async () => {
  const s = setup();
  s.storage.delete("uid");
  s.page.onShow();
  assert.equal(s.requests.length, 0);
  assert.equal(s.page.data.practice_progress_state, "logged-out");
  assert.equal(s.page.data.practice_progress, null);
});
test("progress errors are recoverable and never become fabricated zero", async () => {
  const s = setup();
  s.page.onShow();
  s.requests[0].reject(Error("offline"));
  await flush();
  assert.equal(s.page.data.practice_progress_state, "error");
  assert.equal(s.page.data.practice_progress, null);
  const retry = s.page.loadPracticeProgress();
  s.requests[1].resolve(progress({ answered_count: 9 }));
  await retry;
  assert.equal(s.page.data.practice_progress.answered_count, 9);
});
test("returning from practice reloads canonical counts and clears yesterday's displayed progress", async () => {
  const s = setup();
  s.page.onShow();
  s.requests[0].resolve(progress());
  await flush();
  s.page.onHide();
  s.setNow("2026-11-01T16:00:01Z");
  s.page.onShow();
  assert.equal(s.page.data.practice_progress, null);
  assert.equal(s.page.data.practice_progress_state, "loading");
  s.requests[1].resolve(progress({ date: "2026-11-02", answered_count: 0 }));
  await flush();
  assert.equal(s.page.data.practice_progress.date, "2026-11-02");
  assert.equal(s.page.data.practice_progress.answered_count, 0);
});
for (const transition of ["onHide", "onUnload", "switch-account"])
  test(`practice ignores old responses after ${transition}`, async () => {
    const s = setup();
    s.page.onShow();
    if (transition === "switch-account") {
      s.storage.set("uid", "u2");
      s.storage.set("token", "t2");
      s.page.onShow();
      s.requests[1].resolve(progress({ answered_count: 2 }));
    } else s.page[transition]();
    s.requests[0].resolve(progress({ answered_count: 88 }));
    await flush();
    assert.notEqual(s.page.data.practice_progress?.answered_count, 88);
    if (transition === "switch-account")
      assert.equal(s.page.data.practice_progress.answered_count, 2);
  });
test("same-account refreshed tokens preserve the stable progress owner", async () => {
  const s = setup();
  s.page.onShow();
  const identity = s.storage.get("auth_client_session_id");
  s.storage.set("token", "refreshed");
  s.storage.set("auth_client_session_id", { ...identity, token: "refreshed" });
  s.requests[0].resolve(progress());
  await flush();
  assert.equal(s.page.data.practice_progress.answered_count, 32);
});
test("practice authentication expiry clears the session and progress", async () => {
  const s = setup();
  s.page.onShow();
  s.requests[0].resolve({ statusCode: 401 });
  await flush();
  assert.equal(s.page.data.practice_progress_state, "logged-out");
  assert.equal(s.storage.has("uid"), false);
  assert.equal(s.page.data.practice_progress, null);
});
for (const invalid of [
  { answered_count: -1 },
  { reward_received: "true" },
  { target_count: 0 },
  { date: "yesterday" },
])
  test(`malformed progress remains an error: ${JSON.stringify(invalid)}`, async () => {
    const s = setup();
    s.page.onShow();
    s.requests[0].resolve(progress(invalid));
    await flush();
    assert.equal(s.page.data.practice_progress_state, "error");
    assert.equal(s.page.data.practice_progress, null);
  });

test("same-day tab return retains progress while refreshing and replaces it in place", async () => {
  const s = setup();
  s.page.onShow();
  s.requests[0].resolve(progress());
  await flush();
  s.page.onHide();
  s.page.onShow();
  assert.equal(s.page.data.practice_progress_state, "ready");
  assert.equal(s.page.data.practice_progress.answered_count, 32);
  assert.equal(s.page.data.practice_progress_percent, 32);
  s.requests[1].resolve(progress({ answered_count: 33 }));
  await flush();
  assert.equal(s.page.data.practice_progress.answered_count, 33);
});

test("failed background refresh retains real same-day counts with a retry indication", async () => {
  const s = setup();
  s.page.onShow();
  s.requests[0].resolve(progress());
  await flush();
  s.page.onHide();
  s.page.onShow();
  s.requests[1].reject(Error("offline"));
  await flush();
  assert.equal(s.page.data.practice_progress_state, "ready");
  assert.equal(s.page.data.practice_progress.answered_count, 32);
  assert.equal(s.page.data.practice_progress_refresh_error, true);
  const retry = s.page.loadPracticeProgress();
  s.requests[2].resolve(progress({ answered_count: 34 }));
  await retry;
  assert.equal(s.page.data.practice_progress_refresh_error, false);
  assert.equal(s.page.data.practice_progress.answered_count, 34);
});

test("account switch and expired authentication immediately discard the displayed snapshot", async () => {
  const s = setup();
  s.page.onShow();
  s.requests[0].resolve(progress());
  await flush();
  s.storage.set("uid", "u2");
  s.storage.set("token", "t2");
  s.page.onShow();
  assert.equal(s.page.data.practice_progress, null);
  s.requests[1].resolve(progress({ answered_count: 7 }));
  await flush();
  s.page.onShow();
  s.requests[2].resolve({ statusCode: 401 });
  await flush();
  assert.equal(s.page.data.practice_progress, null);
  assert.equal(s.page.data.practice_progress_state, "logged-out");
});
