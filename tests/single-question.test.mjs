import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
const strip = (source) =>
  source
    .replace(/import[\s\S]*?from\s+["'][^"']+["'];?/g, "")
    .replace(/export\s*\{[\s\S]*?\};?/g, "");
async function flush() {
  await new Promise((resolve) => setImmediate(resolve));
}
function gateway(entry) {
  let definition;
  const calls = [];
  const navigation = [];
  let music = 0;
  const source =
    strip(
      fs.readFileSync(
        new URL("../utils/question-entry.js", import.meta.url),
        "utf8",
      ),
    ) +
    "\n" +
    strip(
      fs.readFileSync(
        new URL("../pages/answer/answer.js", import.meta.url),
        "utf8",
      ),
    );
  vm.runInNewContext(source, {
    Page(value) {
      definition = value;
    },
    getApp: () => ({
      playBgSound() {
        music++;
      },
    }),
    wx: {
      redirectTo(o) {
        navigation.push(o.url);
      },
      setNavigationBarTitle() {},
      getStorageSync: () => "u",
    },
    showToast() {},
    showLoading() {},
    hideLoading() {},
    httpPOST(path) {
      calls.push(path);
      return Promise.resolve({ data: { code: 400 } });
    },
  });
  const page = {
    ...definition,
    data: { ...definition.data },
    setData(patch) {
      Object.assign(this.data, patch);
    },
    initializeDailyReminder() {},
  };
  page.onLoad(entry);
  page.onShow();
  return { page, calls, navigation, music: () => music };
}
function single({ authenticated = true, question, deferredGet = false } = {}) {
  const path = new URL("../pages/single/single.js", import.meta.url);
  assert.ok(fs.existsSync(path), "standalone single-question page must exist");
  let definition;
  const events = [];
  const posts = [];
  const gets = [];
  const nav = [];
  const posters = [];
  const storage = new Map([
    ["uid", authenticated ? "u1" : ""],
    ["token", authenticated ? "t1" : ""],
    ["mine_cache", { nickname: "old" }],
    ["daily-reminder:u1:t:release:2026-11-01", true],
    ["question_category", 3],
  ]);
  let requestCounter = 0;
  const detail = question || {
    question_id: 42,
    question_revision: "s1.opaque-question-revision",
    content: "独立题干###https://a.test/question.png",
    options: "甲||丙|丁",
    level: 1,
    category: 2,
  };
  const app = {
    show_analysis: 1,
    show_correct_answer: 1,
    checkLogin(callback) {
      storage.set("uid", "u1");
      storage.set("token", "new-token");
      callback();
    },
    clickSound() {},
    playSound() {},
    correctSound() {},
    wrongSound() {},
  };
  vm.runInNewContext(
    strip(
      fs.readFileSync(
        new URL("../utils/question-entry.js", import.meta.url),
        "utf8",
      ),
    ) +
      "\n" +
      strip(fs.readFileSync(path, "utf8")),
    {
      Page(value) {
        definition = value;
      },
      getApp: () => app,
      getCurrentPages: () => [],
      wx: {
        getStorageSync: (key) => storage.get(key),
        removeStorageSync: (key) => storage.delete(key),
        setNavigationBarTitle() {},
        redirectTo(o) {
          nav.push(o.url);
        },
        switchTab(o) {
          nav.push(o.url);
        },
        navigateBack() {
          nav.push("back");
        },
        previewImage() {},
      },
      httpGET(path, body) {
        events.push("get:" + path);
        return new Promise((resolve, reject) => {
          gets.push({ path, body, resolve, reject });
          if (!deferredGet) resolve({ data: { code: 10000, data: detail } });
        });
      },
      httpPOST(path, body) {
        events.push("post:" + path);
        return new Promise((resolve, reject) =>
          posts.push({ path, body, resolve, reject }),
        );
      },
      createDailyReminder: () => ({
        refresh: () => Promise.resolve(),
        dispose() {},
        prompt() {
          events.push("native");
          return true;
        },
      }),
      reminderSettings(response) {
        return response.data.data;
      },
      subscriptionRequestId: () =>
        "12345678-1234-4123-8123-" + String(++requestCounter).padStart(12, "0"),
      showToast() {},
    },
  );
  const page = {
    ...definition,
    data: { ...definition.data },
    setData(patch) {
      Object.assign(this.data, patch);
    },
    selectComponent(selector) {
      return selector === "#question-poster"
        ? {
            open(data) {
              posters.push(data);
            },
          }
        : {
            getCaptcha() {
              events.push("captcha");
            },
          };
    },
  };
  return {
    page,
    events,
    posts,
    gets,
    nav,
    posters,
    storage,
    app,
    load(options = { question_id: "42", from: "share" }) {
      page.onLoad(options);
      page.onShow();
    },
  };
}
const answer = (result) => ({
  data: {
    code: 10000,
    data: {
      question_id: 42,
      result,
      right_answer: 3,
      analysis: "独立解析",
      score: result ? 100 : 0,
    },
  },
});
test("legacy positive entries redirect before any challenge request or background music", async () => {
  for (const entry of [{ question_id: "42" }, { scene: "42", from: "daily" }]) {
    const s = gateway(entry);
    await flush();
    assert.deepEqual(s.calls, []);
    assert.deepEqual(s.navigation, [
      `/pages/single/single?question_id=42&from=${entry.from === "daily" ? "daily" : "share"}`,
    ]);
    assert.equal(s.music(), 0);
  }
  const normal = gateway({});
  await flush();
  assert.deepEqual(normal.calls, ["api/question/start-challenge"]);
});
test("standalone GET preserves target identity and original option numbers without creating a round", async () => {
  const s = single();
  s.load();
  await flush();
  assert.equal(s.gets.length, 1);
  assert.equal(s.gets[0].path, "api/question/single");
  assert.equal(s.gets[0].body.question_id, 42);
  assert.equal(s.page.data.view_state, "ready");
  assert.deepEqual(
    Array.from(s.page.data.options, (option) => option.number),
    [1, 3, 4],
  );
  assert.equal(Object.hasOwn(s.page.data, "round_id"), false);
  assert.equal(Object.hasOwn(s.page.data, "count_down"), false);
  assert.equal(s.posts.length, 0);
});
for (const result of [1, 0])
  test(`standalone ${result ? "correct" : "wrong"} answer scores once and ends without continuation`, async () => {
    const s = single();
    s.load();
    await flush();
    s.page.tapOption({ currentTarget: { dataset: { number: 3 } } });
    s.page.submitAnswer();
    assert.equal(s.posts.length, 1);
    assert.equal(s.posts[0].path, "api/question/single-answer");
    assert.equal(s.posts[0].body.answer, 3);
    assert.equal(s.posts[0].body.question_id, 42);
    assert.equal(Object.hasOwn(s.posts[0].body, "round_id"), false);
    assert.ok(
      s.events.indexOf("native") <
        s.events.indexOf("post:api/question/single-answer"),
    );
    s.posts[0].resolve(answer(result));
    await flush();
    assert.equal(s.page.data.phase, "completed");
    assert.equal(s.page.data.score, result ? 100 : 0);
    assert.equal(s.page.data.analysis, "独立解析");
    s.page.submitAnswer();
    s.page.onShow();
    assert.equal(s.posts.length, 1);
    assert.equal(s.gets.length, 1);
  });
test("uncertain submission freezes its option and reuses the same UUID and payload on retry", async () => {
  const s = single();
  s.load();
  await flush();
  s.page.tapOption({ currentTarget: { dataset: { number: 1 } } });
  s.page.submitAnswer();
  const first = s.posts[0].body;
  s.posts[0].reject(Error("network timeout"));
  await flush();
  assert.equal(s.page.data.phase, "uncertain");
  s.page.tapOption({ currentTarget: { dataset: { number: 3 } } });
  assert.equal(s.page.data.selected_option, 1);
  s.page.submitAnswer();
  assert.equal(s.posts.length, 2);
  assert.deepEqual(s.posts[1].body, first);
  s.posts[1].resolve(answer(1));
  await flush();
  assert.equal(s.page.data.phase, "completed");
});
test("missing target and malformed links never fall back to random challenge questions", async () => {
  const missing = single({
    question: { question_id: 99, content: "wrong", options: "a|b" },
  });
  missing.load();
  await flush();
  assert.equal(missing.page.data.view_state, "error");
  assert.equal(missing.posts.length, 0);
  const bad = single();
  bad.load({ question_id: "bad" });
  await flush();
  assert.equal(bad.gets.length, 0);
  assert.equal(bad.page.data.view_state, "error");
});
test("account changes and unload discard in-flight result writes", async () => {
  const changed = single();
  changed.load();
  await flush();
  changed.page.tapOption({ currentTarget: { dataset: { number: 1 } } });
  changed.page.submitAnswer();
  changed.storage.set("uid", "u2");
  changed.storage.set("token", "t2");
  changed.posts[0].resolve(answer(1));
  await flush();
  assert.notEqual(changed.page.data.phase, "completed");
  const disposed = single();
  disposed.load();
  await flush();
  disposed.page.tapOption({ currentTarget: { dataset: { number: 1 } } });
  disposed.page.submitAnswer();
  disposed.page.onUnload();
  disposed.posts[0].resolve(answer(1));
  await flush();
  assert.notEqual(disposed.page.data.phase, "completed");
});
test("expired authentication clears only session data and login reloads the designated question", async () => {
  const s = single({ deferredGet: true });
  s.load();
  s.gets[0].resolve({ statusCode: 401, data: { code: 11111 } });
  await flush();
  assert.equal(s.page.data.view_state, "logged-out");
  assert.equal(s.storage.has("uid"), false);
  assert.equal(s.storage.has("token"), false);
  assert.equal(s.storage.has("mine_cache"), false);
  assert.equal(s.storage.get("daily-reminder:u1:t:release:2026-11-01"), true);
  assert.equal(s.storage.get("question_category"), 3);
  s.page.loginAndLoad();
  assert.equal(s.gets.length, 2);
  assert.equal(s.gets[1].body.question_id, 42);
});
test("daily launch points directly to the independent question page", () => {
  let definition;
  const calls = [];
  vm.runInNewContext(
    strip(
      fs.readFileSync(
        new URL("../pages/daily/daily.js", import.meta.url),
        "utf8",
      ),
    ),
    {
      Page(value) {
        definition = value;
      },
      getApp: () => ({}),
      wx: {
        navigateTo(o) {
          calls.push(o.url);
        },
      },
    },
  );
  definition.startDaily.call({
    data: { view_state: "ready", today: { question_id: 42 } },
  });
  assert.deepEqual(calls, ["/pages/single/single?question_id=42&from=daily"]);
});

test("invalid empty-option positions do not prompt or submit and a frozen retry cannot be reset by loading", async () => {
  const s = single();
  s.load();
  await flush();
  s.page.tapOption({ currentTarget: { dataset: { number: 2 } } });
  s.page.submitAnswer();
  assert.equal(s.posts.length, 0);
  assert.ok(!s.events.includes("native"));
  s.page.tapOption({ currentTarget: { dataset: { number: 1 } } });
  s.page.submitAnswer();
  s.posts[0].reject(Error("timeout"));
  await flush();
  s.page.loadQuestion();
  assert.equal(s.gets.length, 1);
  assert.equal(s.page.data.phase, "uncertain");
});
test("a malformed result remains uncertain and retries the exact original request", async () => {
  const s = single();
  s.load();
  await flush();
  s.page.tapOption({ currentTarget: { dataset: { number: 1 } } });
  s.page.submitAnswer();
  const original = s.posts[0].body;
  const bad = answer(1);
  bad.data.data.question_id = 99;
  s.posts[0].resolve(bad);
  await flush();
  assert.equal(s.page.data.phase, "uncertain");
  assert.equal(s.page.data.score, 0);
  s.page.submitAnswer();
  assert.deepEqual(s.posts[1].body, original);
});
test("late GET responses from a previous account cannot display that account's question", async () => {
  const s = single({ deferredGet: true });
  s.load();
  s.storage.set("uid", "u2");
  s.storage.set("token", "t2");
  s.page.onShow();
  assert.equal(s.gets.length, 2);
  s.gets[0].resolve({
    data: {
      code: 10000,
      data: { question_id: 42, content: "old-owner-question", options: "a|b" },
    },
  });
  await flush();
  assert.equal(s.page.data.view_state, "loading");
  assert.notEqual(s.page.data.content, "old-owner-question");
});
test("completed question can share and reopen feedback without triggering another answer", async () => {
  const s = single();
  s.load();
  await flush();
  s.page.tapOption({ currentTarget: { dataset: { number: 3 } } });
  s.page.submitAnswer();
  s.posts[0].resolve(answer(1));
  await flush();
  s.page.openQuestionPoster();
  assert.equal(s.posters.length, 1);
  assert.equal(s.posters[0].options[1], "");
  assert.equal(s.posters[0].options[2], "丙");
  s.page.openFeedback();
  s.page.onFeedbackClosed();
  s.page.openFeedback();
  assert.equal(s.events.filter((event) => event === "captcha").length, 2);
  assert.equal(s.posts.length, 1);
  assert.equal(s.page.data.phase, "completed");
});

test("opaque question revision is kept private and frozen into first submission and every uncertain retry", async () => {
  const s = single();
  s.load();
  await flush();
  assert.equal(
    JSON.stringify(s.page.data).includes("s1.opaque-question-revision"),
    false,
  );
  s.page.tapOption({ currentTarget: { dataset: { number: 1 } } });
  s.page.submitAnswer();
  assert.equal(
    s.posts[0].body.question_revision,
    "s1.opaque-question-revision",
  );
  s.posts[0].reject(Error("timeout"));
  await flush();
  s.page.submitAnswer();
  assert.deepEqual(s.posts[1].body, s.posts[0].body);
});
test("missing, blank, oversized or non-string revisions fail GET without enabling submission", async () => {
  for (const revision of [undefined, null, "", "   ", "x".repeat(257), 123]) {
    const s = single({
      question: {
        question_id: 42,
        content: "题目",
        options: "甲|乙",
        question_revision: revision,
      },
    });
    s.load();
    await flush();
    assert.equal(s.page.data.view_state, "error");
    s.page.submitAnswer();
    assert.equal(s.posts.length, 0);
  }
});
test("only an explicit unaccepted revision conflict unlocks reload and permits a new intent after fresh GET", async () => {
  const detail = {
    question_id: 42,
    content: "旧题",
    options: "甲||丙",
    question_revision: "s1.old-opaque-value",
  };
  const s = single({ question: detail });
  s.load();
  await flush();
  s.page.tapOption({ currentTarget: { dataset: { number: 1 } } });
  s.page.submitAnswer();
  const old = s.posts[0].body;
  s.posts[0].resolve({
    data: {
      code: 40901,
      message: "题目已更新或下架请刷新后重新作答",
      data: { reload_required: true, accepted: false },
    },
  });
  await flush();
  assert.equal(s.page.data.view_state, "error");
  assert.equal(s.page.data.selected_option, 0);
  s.page.submitAnswer();
  assert.equal(s.posts.length, 1);
  detail.question_revision = "s1.new-opaque-value";
  detail.content = "新题";
  await s.page.loadQuestion();
  assert.equal(s.page.data.view_state, "ready");
  s.page.tapOption({ currentTarget: { dataset: { number: 3 } } });
  s.page.submitAnswer();
  assert.equal(s.posts[1].body.question_revision, "s1.new-opaque-value");
  assert.notEqual(s.posts[1].body.request_id, old.request_id);
});
test("generic conflicts and incomplete reload flags preserve the frozen UUID and locked selection", async () => {
  for (const response of [
    { code: 400, message: "提交标识已用于其他答案" },
    { code: 400, data: { reload_required: true, accepted: false } },
    { code: 40901 },
    { code: 40901, data: { reload_required: true } },
    { code: 40901, data: { reload_required: true, accepted: true } },
    { code: 40901, data: { reload_required: false, accepted: false } },
  ]) {
    const s = single();
    s.load();
    await flush();
    s.page.tapOption({ currentTarget: { dataset: { number: 1 } } });
    s.page.submitAnswer();
    const original = s.posts[0].body;
    s.posts[0].resolve({ data: response });
    await flush();
    assert.equal(s.page.data.phase, "uncertain");
    s.page.tapOption({ currentTarget: { dataset: { number: 3 } } });
    assert.equal(s.page.data.selected_option, 1);
    s.page.loadQuestion();
    assert.equal(s.gets.length, 1);
    s.page.submitAnswer();
    assert.deepEqual(s.posts[1].body, original);
  }
});
