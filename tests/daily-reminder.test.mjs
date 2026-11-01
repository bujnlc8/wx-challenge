import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
function sources() {
  const strip = (text) =>
    text
      .replace(/import[\s\S]*?from\s+["'][^"']+["'];?/g, "")
      .replace(/export\s*\{[\s\S]*?\};?/g, "");
  const helper = new URL("../utils/daily-reminder.js", import.meta.url);
  assert.ok(fs.existsSync(helper), "daily reminder helper must exist");
  return (
    strip(
      fs.readFileSync(
        new URL("../utils/daily-subscription.js", import.meta.url),
        "utf8",
      ),
    ) +
    "\n" +
    strip(fs.readFileSync(helper, "utf8"))
  );
}
function fixture() {
  let now = Date.parse("2026-11-01T15:59:00Z");
  let uid = "u1";
  let token = "secret-token";
  let env = "release";
  const storage = new Map();
  const native = [];
  const records = [];
  const events = [];
  const platform = {
    getStorageSync(key) {
      return key === "uid" ? uid : key === "token" ? token : storage.get(key);
    },
    setStorageSync(key, value) {
      storage.set(key, value);
    },
    getAccountInfoSync() {
      return { miniProgram: { envVersion: env } };
    },
    requestSubscribeMessage(options) {
      events.push("native");
      native.push(options);
    },
  };
  const scope = vm.createContext({ Promise, Date, Math, Error });
  vm.runInContext(
    sources() +
      "\nthis.api={createDailyReminder,createDailySubscription,beijingDay};",
    scope,
  );
  const create = (options = {}) =>
    scope.api.createDailyReminder({
      platform,
      now: () => now,
      loadPreference: async () => ({ enabled: true, template_id: "t" }),
      recordAcceptance: async (body) => records.push(body),
      onNativeOpen: () => events.push("open"),
      onNativeSettled: () => events.push("settled"),
      ...options,
    });
  return {
    create,
    platform,
    native,
    records,
    events,
    storage,
    api: scope.api,
    setToken(v) {
      token = v;
    },
    setEnv(v) {
      env = v;
    },
    setUid(v) {
      uid = v;
    },
    tomorrow() {
      now += 60000;
    },
  };
}
async function flush() {
  for (let i = 0; i < 8; i++) await Promise.resolve();
}
test("cap persists across modes and reloads, with Beijing midnight and UID isolation", async () => {
  const s = fixture();
  const a = s.create();
  await a.refresh();
  assert.equal(a.prompt(), true);
  s.native[0].success({ t: "reject" });
  await flush();
  const b = s.create();
  await b.refresh();
  assert.equal(b.prompt(), false);
  s.tomorrow();
  assert.equal(b.prompt(), true);
  s.native[1].fail({});
  await flush();
  assert.equal(s.create().prompt(), false);
  s.setUid("u2");
  await b.refresh();
  assert.equal(b.prompt(), true);
  assert.ok(
    [...s.storage.keys()].every((key) => !key.includes("secret-token")),
  );
});
test("reject and fail each consume the daily automatic opportunity", async () => {
  for (const choice of ["reject", "fail"]) {
    const s = fixture();
    const a = s.create();
    await a.refresh();
    a.prompt();
    if (choice === "fail") s.native[0].fail({});
    else s.native[0].success({ t: choice });
    await flush();
    assert.equal(a.prompt(), false);
    assert.equal(s.records.length, 0);
    assert.equal(s.events.filter((value) => value === "settled").length, 1);
  }
});
test("manual requests mark the same day while remaining explicitly repeatable", async () => {
  const s = fixture();
  const manual = s.api.createDailySubscription({
    platform: s.platform,
    now: () => Date.parse("2026-11-01T15:59:00Z"),
    recordAcceptance: async () => {},
  });
  const task = manual.request("t");
  s.native[0].success({ t: "reject" });
  await task;
  const automatic = s.create();
  await automatic.refresh();
  assert.equal(automatic.prompt(), false);
  const second = manual.request("t");
  s.native[1].fail({});
  await assert.rejects(second);
  assert.equal(s.native.length, 2);
});
test("preference reads dedupe and stale account responses cannot enable a prompt", async () => {
  const s = fixture();
  const reads = [];
  const a = s.create({
    loadPreference: () => new Promise((resolve) => reads.push(resolve)),
  });
  const first = a.refresh();
  const duplicate = a.refresh();
  assert.equal(reads.length, 1);
  s.setUid("u2");
  const second = a.refresh();
  reads[0]({ enabled: true, template_id: "t" });
  await first;
  await duplicate;
  assert.equal(a.prompt(), false);
  reads[1]({ enabled: false, template_id: "t" });
  await second;
  assert.equal(a.prompt(), false);
});
test("native settlement releases before accept recording finishes and ignores duplicate callbacks", async () => {
  const s = fixture();
  let finish;
  const a = s.create({
    recordAcceptance: () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  });
  await a.refresh();
  assert.equal(a.prompt(), true);
  s.native[0].success({ t: "accept" });
  s.native[0].fail({});
  assert.equal(a.isNativeOpen(), false);
  assert.equal(s.events.filter((value) => value === "settled").length, 1);
  await flush();
  assert.equal(typeof finish, "function");
  finish({});
  await flush();
});
test("logged-out, unsupported, unloaded and disabled prompts make no native request", async () => {
  const s = fixture();
  const a = s.create();
  s.setUid("");
  await a.refresh();
  assert.equal(a.prompt(), false);
  s.setUid("u1");
  await a.refresh();
  const native = s.platform.requestSubscribeMessage;
  delete s.platform.requestSubscribeMessage;
  assert.equal(a.prompt(), false);
  s.platform.requestSubscribeMessage = native;
  a.dispose();
  assert.equal(a.prompt(), false);
  assert.equal(s.native.length, 0);
});

function answeringPage(mode = "answer") {
  const s = fixture();
  let definition;
  const posts = [];
  const timers = [];
  let next = 0;
  const app = new Proxy({}, { get: () => () => {} });
  const strip = (text) =>
    text.replace(/import[\s\S]*?from\s+["'][^"']+["'];?/g, "");
  vm.runInNewContext(
    sources() +
      "\n" +
      fs
        .readFileSync(
          new URL("../utils/challenge-settings.js", import.meta.url),
          "utf8",
        )
        .replace(/export\s*\{[\s\S]*?\};?/g, "") +
      "\n" +
      strip(
        fs.readFileSync(
          new URL(`../pages/${mode}/${mode}.js`, import.meta.url),
          "utf8",
        ),
      ),
    {
      Date,
      Math,
      Promise,
      Error,
      wx: { ...s.platform, setNavigationBarTitle() {} },
      Page(value) {
        definition = value;
      },
      getApp: () => app,
      parseQuestionEntry: () => 0,
      httpGET: async () => ({
        data: { code: 10000, data: { enabled: true, template_id: "t" } },
      }),
      httpPOST(path, body) {
        s.events.push("post:" + path);
        return new Promise((resolve) => posts.push({ path, body, resolve }));
      },
      showToast() {},
      showLoading() {},
      hideLoading() {},
      clearInterval() {},
      setTimeout(fn, delay) {
        timers.push({ fn, delay });
      },
    },
  );
  const p = {
    ...definition,
    data: {
      ...definition.data,
      selected_option: 1,
      option_a: "甲",
      current_question_id: 9,
      questions: [{}, {}],
      interval_handle: 1,
    },
    setData(patch) {
      Object.assign(this.data, patch);
    },
    selectComponent() {
      return { close() {} };
    },
  };
  p.getChallengeQuestions = p.getTrainingQuestions = () => {};
  p._startAnswer = () => {
    next++;
  };
  return { ...s, p, posts, timers, next: () => next };
}
test("both valid answer gestures prompt synchronously and send answer HTTP before native completion", async () => {
  for (const mode of ["answer", "training"]) {
    const s = answeringPage(mode);
    s.p.onLoad({});
    s.p.onShow();
    await flush();
    s.p.submitAnswer();
    assert.equal(s.native.length, 1);
    assert.equal(s.posts.length, 1);
    assert.match(s.posts[0].path, /check-/);
    assert.ok(
      s.events.indexOf("native") <
        s.events.findIndex((value) => value.startsWith("post:")),
    );
    assert.equal(s.p.data.answer_result, -1);
    s.native[0].success({ t: "reject" });
    await flush();
  }
});
test("invalid options never open a prompt, while correct auto-advance waits for native settlement and visibility", async () => {
  const s = answeringPage();
  s.p.onLoad({});
  s.p.onShow();
  await flush();
  s.p.data.selected_option = 0;
  s.p.submitAnswer();
  assert.equal(s.native.length, 0);
  assert.equal(s.posts.length, 0);
  s.p.data.selected_option = 1;
  s.p.submitAnswer();
  s.posts[0].resolve({
    data: {
      code: 10000,
      data: { result: 1, total_score: 1, rank: 1, analysis: "" },
    },
  });
  await flush();
  s.timers.find((timer) => timer.delay === 2000).fn();
  assert.equal(s.next(), 0);
  s.p.onHide();
  s.native[0].success({ t: "accept" });
  await flush();
  assert.equal(s.next(), 0);
  s.p.onShow();
  assert.equal(s.next(), 1);
  assert.ok(s.posts.some((post) => post.path.endsWith("/accept")));
  assert.equal(s.p._subscriptionPanelOpen, false);
});
test("native release preserves poster deferral and unload prevents a delayed resume", async () => {
  const s = answeringPage();
  s.p.onLoad({});
  s.p.onShow();
  await flush();
  s.p.submitAnswer();
  s.p.data.answer_result = 1;
  s.p._posterOpen = true;
  s.p.startAnswer();
  s.native[0].success({ t: "reject" });
  await flush();
  assert.equal(s.next(), 0);
  s.p.onQuestionPosterClose({ detail: { reason: "user" } });
  assert.equal(s.next(), 1);
  const other = answeringPage();
  other.p.onLoad({});
  other.p.onShow();
  await flush();
  other.p.submitAnswer();
  other.p.data.answer_result = 1;
  other.p.startAnswer();
  other.p.onUnload();
  other.native[0].success({ t: "reject" });
  await flush();
  assert.equal(other.next(), 0);
});

test("a native callback from the previous account cannot resume that account's completed question", async () => {
  const s = answeringPage();
  s.p.onLoad({});
  s.p.onShow();
  await flush();
  s.p.submitAnswer();
  s.p.data.answer_result = 1;
  s.p.startAnswer();
  s.setUid("u2");
  s.native[0].success({ t: "accept" });
  await flush();
  s.p.onShow();
  assert.equal(s.next(), 0);
  assert.equal(
    s.posts.filter((post) => post.path.endsWith("/accept")).length,
    0,
  );
});
test("Beijing day uses UTC plus eight hours independent of host timezone", () => {
  const s = fixture();
  assert.equal(
    s.api.beijingDay(Date.parse("2026-11-01T15:59:59Z")),
    "2026-11-01",
  );
  assert.equal(
    s.api.beijingDay(Date.parse("2026-11-01T16:00:00Z")),
    "2026-11-02",
  );
});

test("same UID and template has one daily automatic allowance across develop, trial and release", async () => {
  const s = fixture();
  s.setEnv("develop");
  const first = s.create();
  await first.refresh();
  assert.equal(first.prompt(), true);
  s.native[0].success({ t: "reject" });
  await flush();
  for (const env of ["trial", "release"]) {
    s.setEnv(env);
    const next = s.create();
    await next.refresh();
    assert.equal(next.prompt(), false);
  }
  assert.equal(s.native.length, 1);
  assert.equal(s.storage.get("daily-reminder:u1:t:2026-11-01"), true);
});
test("every legacy environment marker migrates to the canonical key even when the runtime changed", async () => {
  for (const env of ["develop", "trial", "release"]) {
    const s = fixture();
    s.setEnv(env === "release" ? "develop" : "release");
    s.storage.set(`daily-reminder:u1:t:${env}:2026-11-01`, true);
    const reminder = s.create();
    await reminder.refresh();
    assert.equal(reminder.prompt(), false);
    assert.equal(s.native.length, 0);
    assert.equal(s.storage.get("daily-reminder:u1:t:2026-11-01"), true);
    s.tomorrow();
    assert.equal(reminder.prompt(), true);
    s.native[0].fail({});
    await flush();
    s.setUid("u2");
    await reminder.refresh();
    assert.equal(reminder.prompt(), true);
  }
});
test("token refresh keeps the consumed daily cap and marking does not need account-info APIs", async () => {
  const s = fixture();
  delete s.platform.getAccountInfoSync;
  const reminder = s.create();
  await reminder.refresh();
  assert.equal(reminder.prompt(), true);
  s.native[0].fail({});
  await flush();
  s.setToken("new-token");
  await reminder.refresh();
  assert.equal(reminder.prompt(), false);
  assert.equal(s.native.length, 1);
  assert.ok(
    [...s.storage.keys()].every(
      (key) => !key.includes("token") && !/(develop|trial|release)/.test(key),
    ),
  );
});
test("canonical or legacy storage failures skip automatic prompts without throwing", async () => {
  for (const operation of ["read", "write", "migration"]) {
    const s = fixture();
    if (operation === "migration")
      s.storage.set("daily-reminder:u1:t:develop:2026-11-01", true);
    const read = s.platform.getStorageSync;
    if (operation === "read")
      s.platform.getStorageSync = (key) => {
        if (key.startsWith("daily-reminder:")) throw Error("storage");
        return read(key);
      };
    else
      s.platform.setStorageSync = () => {
        throw Error("storage");
      };
    const reminder = s.create();
    await reminder.refresh();
    assert.equal(reminder.prompt(), false);
    assert.equal(s.native.length, 0);
  }
});
