import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
function page() {
  let definition,
    opens = 0;
  const notices = [];
  const app = new Proxy({}, { get: () => () => {} });
  const s = fs
    .readFileSync(new URL("../pages/answer/answer.js", import.meta.url), "utf8")
    .replace(/import[\s\S]*?from\s+["'][^"']+["'];?/g, "");
  vm.runInNewContext(s, {
    Page: (d) => (definition = d),
    getApp: () => app,
    showToast: (t) => notices.push(t),
    clearInterval: () => {},
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
          open() {
            opens++;
          },
          close() {},
        };
      },
    },
    get opens() {
      return opens;
    },
    notices,
  };
}
test("active or submitting challenges cannot be obscured by a poster", () => {
  const s = page();
  s.p.data.answer_result = -2;
  s.p.openQuestionPoster();
  assert.equal(s.opens, 0);
  assert.equal(s.notices.length, 1);
  s.p.data.answer_result = -1;
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
