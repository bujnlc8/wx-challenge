import { runWithAuth } from "./helpers/auth-loader.mjs";
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

function setup(remaining = 3) {
  let definition;
  let popupDefinition;
  const timers = [];
  const requests = [];
  const navigations = [];
  const storage = new Map([["uid", "u1"], ["token", "t1"]]);
  const app = new Proxy({}, { get: () => () => {} });
  const source = fs
    .readFileSync(new URL("../pages/answer/answer.js", import.meta.url), "utf8")
    .replace(/import[\s\S]*?from\s+["'][^"']+["'];?/g, "");
  const readOwner = runWithAuth(source + "\nchallengeAccount;", {
    Page: (page) => {
      definition = page;
    },
    getApp: () => app,
    setTimeout: (run, delay) => {
      timers.push({ run, delay });
    },
    clearInterval() {},
    setInterval: () => 1,
    showToast() {},
    httpPOST: async (url, data) => {
      requests.push({ url, data });
      return {
        data: {
          code: 10000,
          data:
            url === "api/coin/operate"
              ? { result: 1 }
              : {
                  result: 0,
                  total_score: 380,
                  rank: 12,
                  right_answer: 2,
                  analysis: "",
                },
        },
      };
    },
    wx: {
      getStorageSync: (key) => storage.get(key),
      switchTab: ({ url }) => navigations.push({ kind: "tab", url }),
      redirectTo: ({ url }) => navigations.push({ kind: "redirect", url }),
    },
  });
  runWithAuth(
    fs
      .readFileSync(new URL("../utils/modal-lock.js", import.meta.url), "utf8")
      .replace(/export\s*\{[\s\S]*?\};?/g, "") +
      "\n" +
      fs
        .readFileSync(
          new URL("../component/popup/popup.js", import.meta.url),
          "utf8",
        )
        .replace(/import[\s\S]*?from\s+["'][^"']+["'];?/g, ""),
    {
      getApp: () => app,
      Component: (component) => {
        popupDefinition = component;
      },
    },
  );
  const page = {
    ...definition,
    data: {
      ...definition.data,
      last_relive_times: remaining,
      current_question_id: 42,
      round_id: 77,
    },
    setData(patch) {
      Object.assign(this.data, patch);
    },
    selectComponent() { return { close() {}, open() {} }; },
    report: { getCaptcha() {} },
    startAnswer() {
      this.setData({ answer_result: -2 });
    },
  };
  const popup = {
    ...popupDefinition.methods,
    data: {
      ...Object.fromEntries(
        Object.entries(popupDefinition.properties).map(([name, prop]) => [
          name,
          prop.value,
        ]),
      ),
      ...popupDefinition.data,
    },
    setData(patch) {
      Object.assign(this.data, patch);
    },
    triggerEvent(name) {
      if (name === "error") page.popupCancel();
      if (name === "success") page.popupConfirm();
    },
  };
  page.popup = popup;
  return {
    page,
    popup,
    requests,
    navigations,
    storage,
    owner: readOwner,
    runTimer(delay) {
      const index = timers.findIndex((timer) => timer.delay === delay);
      assert.notEqual(index, -1, `expected a ${delay}ms popup timer`);
      timers.splice(index, 1)[0].run();
    },
  };
}

async function showFailure(state, timeout = 0) {
  state.page.setData({ answer_result: -2 });
  state.page._submitAnswer(timeout);
  await new Promise((resolve) => setImmediate(resolve));
  state.runTimer(1000);
}

test("wrong-answer revival explains its real cost and current remaining chances", async () => {
  const state = setup(3);
  await showFailure(state);
  assert.equal(state.popup.data.title, "本题未答对");
  assert.match(state.popup.data.content, /1000\s*百科币/);
  assert.match(state.popup.data.content, /剩余\s*3\s*次/);
  assert.equal(state.popup.data.btn_no, "结束本轮");
  assert.equal(state.popup.data.btn_ok, "复活继续");
  assert.equal(state.page.data.last_relive_times, 3);
  assert.equal(state.popup.data.flag, false);
});

test("timeout has its own heading and does not reuse a previous wrong-answer heading", async () => {
  const state = setup(1);
  await showFailure(state);
  state.popup.hidePopup();
  await showFailure(state, 1);
  assert.equal(state.popup.data.title, "答题超时");
  assert.match(state.popup.data.content, /剩余\s*1\s*次/);
  assert.equal(state.popup.data.btn_ok, "复活继续");
});

test("ending revival replaces persistent action labels and keeps both original navigation choices", async () => {
  for (const confirm of [false, true]) {
    const state = setup();
    await showFailure(state);
    state.popup.popupCancel();
    assert.equal(state.page.data.pop_type, 2);
    assert.equal(state.popup.data.title, "本轮挑战结束");
    assert.equal(state.popup.data.btn_no, "返回首页");
    assert.equal(state.popup.data.btn_ok, "再来一轮");
    assert.match(state.popup.data.content, /380/);
    assert.match(state.popup.data.content, /12/);
    if (confirm) state.popup.popupConfirm();
    else state.popup.popupCancel();
    assert.deepEqual(state.navigations, [
      {
        kind: confirm ? "redirect" : "tab",
        url: confirm ? "/pages/answer/answer" : "/pages/index/index",
      },
    ]);
  }
});

test("successful revival keeps its debit contract and later skip dialogs reset all reused labels", async () => {
  const state = setup(3);
  await showFailure(state);
  state.popup.popupConfirm();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(state.requests[1].url, "api/coin/operate");
  assert.equal(state.requests[1].data.source, 4);
  assert.equal(state.requests[1].data.round_id, 77);
  assert.equal(state.page.data.last_relive_times, 2);
  state.runTimer(2000);
  for (const type of [1, 0]) {
    state.page.hideQuestion({ target: { dataset: { t: type } } });
    assert.equal(
      state.popup.data.title,
      type === 1 ? "跳过本题" : "不再显示本题",
    );
    assert.equal(state.popup.data.btn_no, "取消");
    assert.equal(state.popup.data.btn_ok, "确认");
    assert.equal(state.page.data.pop_type, 3);
    assert.equal(state.page.data.hide_type, type);
    state.popup.popupCancel();
  }
});

for (const utility of ["report", "poster"]) {
  test(`timeout revival waits for ${utility} to close and keeps its original delay`, async () => {
    const s = setup();
    s.page.data.answer_result = -2;
    if (utility === "report") s.page.doFeedback();
    else s.page.openQuestionPoster();
    s.page._submitAnswer(1);
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(s.popup.data.flag, true);
    s.runTimer(1000);
    assert.equal(s.popup.data.flag, true);
    if (utility === "report") s.page.nextQuestionAfterCloseFeedback();
    else s.page.onQuestionPosterClose({ detail: { reason: "user" } });
    assert.equal(s.popup.data.flag, false);
    assert.equal(s.popup.data.title, "答题超时");
    assert.equal(s.page.data.last_relive_times, 3);
  });
}
test("closing utilities before the revival delay does not show a prompt early", async () => {
  const s = setup();
  s.page.doFeedback();
  s.page._submitAnswer(1);
  await new Promise((resolve) => setImmediate(resolve));
  s.page.nextQuestionAfterCloseFeedback();
  assert.equal(s.popup.data.flag, true);
  s.runTimer(1000);
  assert.equal(s.popup.data.flag, false);
});
test("no-revival ending waits for its poster and original two-second delay", async () => {
  const s = setup(0);
  s.page.openQuestionPoster();
  s.page._submitAnswer(1);
  await new Promise((resolve) => setImmediate(resolve));
  s.runTimer(2000);
  assert.equal(s.popup.data.flag, true);
  s.page.onQuestionPosterClose({ detail: { reason: "user" } });
  assert.equal(s.popup.data.title, "本轮挑战结束");
  assert.equal(s.popup.data.flag, false);
});
test("failure prompts wait for page visibility after native preview", async () => {
  const s = setup();
  s.page.openQuestionPoster();
  s.page._submitAnswer(1);
  await new Promise((resolve) => setImmediate(resolve));
  s.page.onHide();
  s.page.onQuestionPosterClose({ detail: { reason: "page-hide" } });
  s.runTimer(1000);
  assert.equal(s.popup.data.flag, true);
  s.page.onShow();
  assert.equal(s.popup.data.flag, false);
});
for (const change of ["question", "round", "unload", "account"]) {
  test(`a delayed failure cannot reopen after ${change} changes`, async () => {
    const s = setup();
    s.page._challengeOwner = s.owner();
    s.page._submitAnswer(1);
    await new Promise((resolve) => setImmediate(resolve));
    if (change === "question") s.page._startAnswer({ id: 99, content: "新题", options: "甲|乙" });
    if (change === "round") s.page.data.round_id++;
    if (change === "unload") s.page.onUnload();
    if (change === "account") s.storage.set("token", "t2");
    s.runTimer(1000);
    s.page.onShow();
    assert.equal(s.popup.data.flag, true);
  });
}
