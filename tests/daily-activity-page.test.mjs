import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
function setup(get) {
  let definition,
    uid = "u1";
  const helper = fs
    .readFileSync(
      new URL("../utils/activity-calendar.js", import.meta.url),
      "utf8",
    )
    .replace(/export\s*\{[\s\S]*?\};?/g, "");
  const page = fs
    .readFileSync(new URL("../pages/daily/daily.js", import.meta.url), "utf8")
    .replace(/import[\s\S]*?from\s+["'][^"']+["'];?/g, "");
  vm.runInNewContext(helper + "\n" + page, {
    Page: (d) => (definition = d),
    getApp: () => ({}),
    wx: { getStorageSync: (k) => (k === "uid" ? uid : "token") },
    httpGET: get,
  });
  const p = {
    ...definition,
    data: {
      ...definition.data,
      view_state: "ready",
      today: { question_id: 42 },
    },
    _visible: true,
    setData(d, done) {
      Object.assign(this.data, d);
      if (done) done();
    },
  };
  return { p, setUid: (v) => (uid = v) };
}
const response = (n) => ({
  data: {
    code: 10000,
    data: {
      start_date: "2026-11-01",
      end_date: "2026-11-01",
      history_start_date: "2026-11-01",
      days: [{ date: "2026-11-01", count: n }],
    },
  },
});
test("heatmap loads independently without changing today question or reminder view state", async () => {
  const { p } = setup(async () => response(3));
  await p.loadActivity();
  assert.equal(p.data.activity_state, "ready");
  assert.equal(p.data.activity.total_count, 3);
  assert.equal(p.data.view_state, "ready");
  assert.equal(p.data.today.question_id, 42);
  assert.equal(p.data.activity_scroll_target, "activity-today");
});
test("stats outage leaves the existing daily challenge usable and recoverable", async () => {
  const { p } = setup(async () => {
    throw Error("offline");
  });
  await p.loadActivity();
  assert.equal(p.data.activity_state, "error");
  assert.equal(p.data.view_state, "ready");
  assert.equal(p.data.today.question_id, 42);
});
test("late stats from another account cannot expose its contributions", async () => {
  let resolve;
  const request = new Promise((r) => (resolve = r));
  const { p, setUid } = setup(() => request);
  const pending = p.loadActivity();
  setUid("u2");
  resolve(response(12));
  await pending;
  assert.equal(p.data.activity, null);
});
test("a superseded stats response cannot overwrite the newer contribution calendar", async () => {
  let resolve,
    calls = 0;
  const old = new Promise((r) => (resolve = r));
  const { p } = setup(() =>
    ++calls === 1 ? old : Promise.resolve(response(5)),
  );
  const pending = p.loadActivity();
  await p.loadActivity();
  resolve(response(1));
  await pending;
  assert.equal(p.data.activity.total_count, 5);
});
test("logged-out views clear old stats and never request account data", async () => {
  let calls = 0;
  const { p, setUid } = setup(async () => {
    calls++;
    return response(1);
  });
  setUid("");
  await p.loadActivity();
  assert.equal(calls, 0);
  assert.equal(p.data.activity, null);
  assert.equal(p.data.activity_state, "idle");
});
