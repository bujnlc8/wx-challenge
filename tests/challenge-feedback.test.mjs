import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
function page(result) {
  let def;
  const s = fs
    .readFileSync(new URL("../pages/answer/answer.js", import.meta.url), "utf8")
    .replace(/import[\s\S]*?from\s+["'][^"']+["'];?/g, "");
  let calls = 0;
  vm.runInNewContext(s, {
    Page: (d) => (def = d),
    getApp: () => new Proxy({}, { get: () => () => {} }),
    showToast: () => {},
  });
  return {
    p: {
      ...def,
      data: { ...def.data, answer_result: result, current_question_id: 42 },
      setData(d) {
        Object.assign(this.data, d);
      },
      report: {
        getCaptcha() {
          calls++;
        },
      },
    },
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
test("unanswered challenge does not open a feedback request", () => {
  const s = page(-2);
  s.p.doFeedback();
  assert.equal(s.calls, 0);
  assert.equal(s.p.data.show_feedback, false);
});
