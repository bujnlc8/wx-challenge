import { runWithAuth } from "./helpers/auth-loader.mjs";
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
function page(result, mode = "answer") {
  const ticks = [];
  let def;
  const s = fs
    .readFileSync(new URL(`../pages/${mode}/${mode}.js`, import.meta.url), "utf8")
    .replace(/import[\s\S]*?from\s+["'][^"']+["'];?/g, "");
  let calls = 0;
  let clears = 0;
  runWithAuth(s, {
    Page: (d) => (def = d),
    getApp: () => new Proxy({}, { get: () => () => {} }),
    showToast: () => {},
    clearInterval: () => { clears++; },
    setTimeout: () => {},
    setInterval: (tick) => { ticks.push(tick); return 9; },
  });
  return {
    p: {
      ...def,
      data: { ...def.data, answer_result: result, current_question_id: 42, interval_handle: 9 },
      setData(d) {
        Object.assign(this.data, d);
      },
      selectComponent() { return { open() {} }; },
      report: {
        getCaptcha() {
          calls++;
        },
      },
    },
    tick() { ticks.at(-1)(); },
    get clears() { return clears; },
    get calls() {
      return calls;
    },
  };
}
test("completed challenge opens feedback through the actual report getCaptcha API", () => {
  const s = page(1);
  s.p.doFeedback();
  assert.equal(s.calls, 1);
  assert.equal(s.p.data.show_feedback, true);
});
for (const mode of ["answer", "training"]) {
  for (const result of [-2, -1]) {
    test(`${mode} opens correction before or during submission without stopping its clock (${result})`, () => {
      const s = page(result, mode);
      s.p.doFeedback();
      assert.equal(s.calls, 1);
      assert.equal(s.p.data.show_feedback, true);
      assert.equal(s.clears, 0);
      assert.equal(s.p.data.answer_result, result);
    });
  }
  test(`${mode} ignores correction without a current question or after unloading`, () => {
    for (const id of [0, -1, "bad"]) {
      const s = page(-2, mode);
      s.p.data.current_question_id = id;
      s.p.doFeedback();
      assert.equal(s.calls, 0);
    }
    const s = page(-2, mode);
    s.p._unloaded = true;
    s.p.doFeedback();
    assert.equal(s.calls, 0);
  });
  test(`${mode} closes its parent correction flag before resuming`, () => {
    const s = page(1, mode);
    s.p.data.show_feedback = true;
    s.p.queueNextQuestion = () => assert.equal(s.p.data.show_feedback, false);
    if (mode === "answer") s.p.nextQuestionAfterCloseFeedback();
    else s.p.onFeedbackClosed();
    assert.equal(s.p.data.show_feedback, false);
  });
  test(`${mode} nested option clicks use currentTarget and validate the option position`, () => {
    const s = page(-2, mode);
    Object.assign(s.p.data, { option_a: "甲", option_b: "", option_c: "丙", option_d: "丁" });
    s.p.tapOption({ currentTarget: { dataset: { i: "3" } }, target: { dataset: { i: 1 } } });
    assert.equal(s.p.data.selected_option, 3);
    for (const value of [0, 2, 5, "bad", 1.5]) {
      s.p.tapOption({ currentTarget: { dataset: { i: value } }, target: { dataset: { i: 1 } } });
      assert.equal(s.p.data.selected_option, 3);
    }
    s.p.tapOption({ target: { dataset: { i: "1" } } });
    assert.equal(s.p.data.selected_option, 1);
  });
}

for (const mode of ["answer", "training"]) {
  test(`${mode} correction and poster leave the existing unanswered clock running`, () => {
    const s = page(-2, mode);
    s.p.startCountDown();
    const before = s.p.data.count_down;
    s.p.doFeedback();
    s.p.openQuestionPoster();
    s.tick();
    assert.equal(s.p.data.count_down, before + (mode === "answer" ? -1 : 1));
    assert.equal(s.clears, 0);
  });
}
