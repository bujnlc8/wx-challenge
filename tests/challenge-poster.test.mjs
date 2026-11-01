import { runWithAuth } from "./helpers/auth-loader.mjs";
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
function page() {
  let definition,
    opens = 0;
  const payloads = [];
  let clears = 0;
  const notices = [];
  const app = new Proxy({}, { get: () => () => {} });
  const s = fs
    .readFileSync(new URL("../pages/answer/answer.js", import.meta.url), "utf8")
    .replace(/import[\s\S]*?from\s+["'][^"']+["'];?/g, "");
  runWithAuth(s, {
    Page: (d) => (definition = d),
    getApp: () => app,
    showToast: (t) => notices.push(t),
    clearInterval: () => { clears++; },
    setTimeout: () => {},
    wx: {},
  });
  return {
    p: {
      ...definition,
      data: { ...definition.data, current_question_id: 42, questions: [{}] },
      setData(v) {
        Object.assign(this.data, v);
      },
      selectComponent() {
        return {
          open(payload) {
            payloads.push(payload);
            opens++;
          },
          close() {},
        };
      },
    },
    payloads,
    get clears() { return clears; },
    get opens() {
      return opens;
    },
    notices,
  };
}
test("active and submitting challenges can share the question without stopping the timer or exposing the answer", () => {
  for (const result of [-2, -1]) {
    const s = page();
    Object.assign(s.p.data, { answer_result: result, interval_handle: 9, right_answer: 3, analysis: "secret", selected_option: 1 });
    s.p.openQuestionPoster();
    assert.equal(s.opens, 1);
    assert.equal(s.p._posterOpen, true);
    assert.equal(s.payloads[0].id, 42);
    assert.equal(Object.hasOwn(s.payloads[0], "right_answer"), false);
    assert.equal(Object.hasOwn(s.payloads[0], "analysis"), false);
    assert.equal(Object.hasOwn(s.payloads[0], "selected_option"), false);
    assert.equal(s.clears, 0);
    assert.equal(s.p.data.answer_result, result);
  }
});
test("a missing or invalid current question and unloading prevent poster opening", () => {
  for (const id of [0, -1, "bad"]) {
    const s = page();
    s.p.data.current_question_id = id;
    s.p.openQuestionPoster();
    assert.equal(s.opens, 0);
  }
  const s = page();
  s.p._unloaded = true;
  s.p.openQuestionPoster();
  assert.equal(s.opens, 0);
});
test("completed question waits for its visible poster before automatic advance", () => {
  const s = page();
  s.p.data.answer_result = 1;
  s.p._posterOpen = true;
  let next = 0;
  s.p._startAnswer = () => {
    next++;
  };
  s.p.startAnswer();
  assert.equal(next, 0);
  assert.equal(s.p._advanceAfterPoster, true);
});
test("closing a completed-question poster resumes one pending advance only once", () => {
  const s = page();
  s.p.data.answer_result = 1;
  s.p._posterOpen = true;
  s.p._advanceAfterPoster = true;
  s.p._pageVisible = true;
  let next = 0;
  s.p.startAnswer = () => {
    next++;
  };
  s.p.onQuestionPosterClose({ detail: { reason: "user" } });
  s.p.onQuestionPosterClose({ detail: { reason: "user" } });
  assert.equal(next, 1);
  assert.equal(s.p._posterOpen, false);
});
test("leaving for native preview defers any advance until the page is visible again", () => {
  const s = page();
  s.p.data.answer_result = 1;
  s.p._advanceAfterPoster = true;
  s.p._posterOpen = true;
  let next = 0;
  s.p.startAnswer = () => {
    next++;
  };
  s.p.onQuestionPosterClose({ detail: { reason: "page-hide" } });
  assert.equal(next, 0);
  s.p.onShow();
  assert.equal(next, 1);
});
