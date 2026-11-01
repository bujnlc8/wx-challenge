import { runWithAuth } from "./helpers/auth-loader.mjs";
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
const strip = (source) =>
  source
    .replace(/import[\s\S]*?from\s+["'][^"']+["'];?/g, "")
    .replace(/export\s*\{[\s\S]*?\};?/g, "");
const flush = () => new Promise((resolve) => setImmediate(resolve));
function challenge(count = 10) {
  let definition;
  const storage = new Map([
    ["challenge_question_count", count],
    ["uid", "u1"],
    ["token", "t1"],
  ]);
  const requests = [],
    tasks = [];
  let popupShows = 0;
  const popup = {
    setData() {},
    hidePopup() {},
    showPopup() {
      popupShows++;
    },
  };
  const source =
    strip(
      fs.readFileSync(
        new URL("../utils/challenge-settings.js", import.meta.url),
        "utf8",
      ),
    ) +
    "\n" +
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
  runWithAuth(source, {
    Page: (value) => (definition = value),
    getApp: () =>
      new Proxy(
        { category: 0, show_analysis: 1, show_correct_answer: 1 },
        { get: (target, key) => (key in target ? target[key] : () => {}) },
      ),
    wx: {
      getStorageSync: (key) => storage.get(key),
      setNavigationBarTitle() {},
      removeStorageSync: (key) => storage.delete(key),
      switchTab() {},
      redirectTo() {},
    },
    createDailyReminder: () => ({
      refresh() {},
      isCurrentAccount: () => true,
      isNativeOpen: () => false,
      prompt() {},
    }),
    showToast() {},
    showLoading() {},
    hideLoading() {},
    setInterval: () => 1,
    clearInterval() {},
    setTimeout(callback) {
      tasks.push(callback);
    },
    httpPOST(path, body) {
      return new Promise((resolve, reject) =>
        requests.push({ path, body, resolve, reject }),
      );
    },
  });
  const page = {
    ...definition,
    data: { ...definition.data },
    popup,
    setData(patch) {
      Object.assign(this.data, patch);
    },
    selectComponent: () => ({ close() {} }),
  };
  const response = (data) => ({ data: { code: 10000, data } });
  const question = (id) => ({ id, content: "题" + id, options: "甲|乙" });
  return {
    page,
    requests,
    storage,
    get popupShows() {
      return popupShows;
    },
    async start() {
      page.onLoad({});
      requests[0].resolve(
        response({
          round_id: 7,
          list: Array.from({ length: Math.min(count, 6) }, (_, index) =>
            question(index + 1),
          ),
          last_skip_chance: 3,
          last_relive_times: 3,
          timeout: 30,
        }),
      );
      await flush();
    },
    async answer(result = 1) {
      page.tapOption({ target: { dataset: { i: 1 } } });
      page.submitAnswer();
      requests.at(-1).resolve(
        response({
          result,
          total_score: 80,
          rank: 1,
          analysis: "",
          right_answer: 2,
        }),
      );
      await flush();
    },
    runTimers() {
      const pending = tasks.splice(0);
      pending.forEach((callback) => callback());
    },
    done() {
      requests.at(-1).resolve(
        response({
          round_id: 7,
          total_score: 80,
          correct_question: 1,
          finished: true,
        }),
      );
    },
  };
}
test("a one-question challenge stops after its answer and closes the round instead of fetching more", async () => {
  const s = challenge(1);
  await s.start();
  await s.answer();
  assert.equal(s.page.data.challenge_finished, true);
  assert.equal(s.requests.at(-1).path, "api/question/finish-challenge");
  s.done();
  await flush();
  s.runTimers();
  assert.equal(s.page.data.challenge_finish_state, "done");
  assert.equal(s.page.data.total_index, 1);
  assert.equal(
    s.requests.filter((r) => r.path === "api/question/start-challenge").length,
    1,
  );
});
test("the last wrong answer ends at the limit without asking for paid revival", async () => {
  const s = challenge(1);
  await s.start();
  await s.answer(0);
  s.runTimers();
  assert.equal(s.page.data.challenge_finished, true);
  assert.equal(s.popupShows, 0);
  assert.equal(s.requests.at(-1).path, "api/question/finish-challenge");
});
test("skipping the only question consumes the slot and never displays a second question", async () => {
  const s = challenge(1);
  await s.start();
  s.page.hideQuestion({ target: { dataset: { t: 1 } } });
  s.page.popupConfirm();
  assert.equal(s.requests.at(-1).path, "api/question/hide");
  s.requests.at(-1).resolve({ data: { code: 10000 } });
  await flush();
  s.runTimers();
  assert.equal(s.page.data.challenge_finished, true);
  assert.equal(s.page.data.total_index, 1);
  assert.equal(s.requests.at(-1).path, "api/question/finish-challenge");
});
test("count is fixed for this round and changes only when starting another round", async () => {
  const s = challenge(2);
  await s.start();
  s.storage.set("challenge_question_count", 100);
  await s.answer();
  s.runTimers();
  assert.equal(s.page.data.total_index, 2);
  assert.equal(s.page.data.challenge_limit, 2);
  await s.answer();
  assert.equal(s.page.data.challenge_finished, true);
  assert.equal(s.requests.at(-1).path, "api/question/finish-challenge");
});
test("unknown finish result can be retried without answering or loading more questions", async () => {
  const s = challenge(1);
  await s.start();
  await s.answer();
  s.requests.at(-1).reject(Error("offline"));
  await flush();
  assert.equal(s.page.data.challenge_finish_state, "error");
  s.page.startAnswer();
  s.page.finishChallenge();
  assert.equal(s.requests.at(-1).path, "api/question/finish-challenge");
  assert.equal(
    s.requests.filter((r) => r.path === "api/question/check-answer").length,
    1,
  );
  s.done();
  await flush();
  assert.equal(s.page.data.challenge_finish_state, "done");
});

for (const [count, batches] of [
  [7, 2],
  [100, 17],
]) {
  test(`${count}-question challenge crosses batches and stops at its exact selected limit`, async () => {
    const s = challenge(count);
    await s.start();
    for (let index = 1; index <= count; index++) {
      assert.equal(s.page.data.total_index, index);
      await s.answer();
      s.runTimers();
      if (s.requests.at(-1).path === "api/question/start-challenge") {
        s.requests.at(-1).resolve({
          data: {
            code: 10000,
            data: {
              round_id: 7,
              list: Array.from({ length: 6 }, (_, offset) => ({
                id: index + offset + 1,
                content: "下一批题",
                options: "甲|乙",
              })),
              last_skip_chance: 3,
              last_relive_times: 3,
              timeout: 30,
            },
          },
        });
        await flush();
      }
    }
    assert.equal(s.page.data.total_index, count);
    assert.equal(s.page.data.challenge_finished, true);
    assert.equal(s.requests.at(-1).path, "api/question/finish-challenge");
    assert.equal(
      s.requests.filter((r) => r.path === "api/question/start-challenge")
        .length,
      batches,
    );
  });
}

test("overlapping feedback and answer timers cannot advance a second time after a new question appears", async () => {
  const s = challenge(2);
  await s.start();
  await s.answer();
  s.page.nextQuestionAfterCloseFeedback();
  s.runTimers();
  assert.equal(s.page.data.total_index, 2);
  assert.equal(s.page.data.answer_result, -2);
  assert.equal(s.page.data.challenge_finished, false);
});

test("overlapping advances share one batch request and do not finish before the final question is answered", async () => {
  const s = challenge(7);
  await s.start();
  for (let index = 0; index < 5; index++) {
    await s.answer();
    s.runTimers();
  }
  await s.answer();
  s.page.nextQuestionAfterCloseFeedback();
  s.runTimers();
  assert.equal(
    s.requests.filter((r) => r.path === "api/question/start-challenge").length,
    2,
  );
  s.requests.at(-1).resolve({
    data: {
      code: 10000,
      data: {
        round_id: 7,
        list: [{ id: 7, content: "最后一题", options: "甲|乙" }],
        last_skip_chance: 3,
        last_relive_times: 3,
        timeout: 30,
      },
    },
  });
  await flush();
  assert.equal(s.page.data.total_index, 7);
  assert.equal(s.page.data.challenge_finished, false);
  assert.equal(s.page.data.answer_result, -2);
});

for (const utility of ["report", "poster"]) {
  test(`a correct response waits for its ${utility} to close before continuing`, async () => {
    const s = challenge(2);
    await s.start();
    s.page.report = { getCaptcha() {} };
    s.page.selectComponent = () => ({ close() {}, open() {} });
    if (utility === "report") s.page.doFeedback();
    else s.page.openQuestionPoster();
    await s.answer();
    s.runTimers();
    assert.equal(s.page.data.total_index, 1);
    assert.equal(s.page.data.answer_result, 1);
    if (utility === "report") s.page.nextQuestionAfterCloseFeedback();
    else s.page.onQuestionPosterClose({ detail: { reason: "user" } });
    s.runTimers();
    assert.equal(s.page.data.total_index, 2);
    assert.equal(s.page.data.answer_result, -2);
  });
}
