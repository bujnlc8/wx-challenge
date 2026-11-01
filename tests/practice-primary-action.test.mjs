import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
function practice(result) {
  let definition;
  const requests = [];
  let clicks = 0;
  vm.runInNewContext(
    fs
      .readFileSync(
        new URL("../pages/training/training.js", import.meta.url),
        "utf8",
      )
      .replace(/import[\s\S]*?from\s+["'][^"']+["'];?/g, ""),
    {
      Page: (value) => (definition = value),
      getApp: () => ({
        clickSound() {
          clicks++;
        },
        playSound() {},
      }),
      setInterval: () => 1,
      clearInterval() {},
      showToast() {},
      httpPOST(path, body) {
        return new Promise((resolve) => requests.push({ path, body, resolve }));
      },
    },
  );
  const page = {
    ...definition,
    data: {
      ...definition.data,
      questions: [
        { id: 1, content: "第一题", options: "甲|乙" },
        { id: 2, content: "第二题", options: "丙|丁" },
      ],
      current_index: 0,
      total_index: 1,
      current_question_id: 1,
      option_a: "甲",
      option_b: "乙",
      answer_result: result,
      selected_option: 2,
      answered_ids: result >= 0 ? [1] : [],
    },
    setData(patch) {
      Object.assign(this.data, patch);
    },
  };
  return { page, requests, clicks: () => clicks };
}
for (const result of [0, 1]) {
  test(`practice primary action after ${result ? "correct" : "wrong"} answer opens next question without another submission`, () => {
    const s = practice(result);
    s.page.primaryAction({ type: "tap" });
    assert.equal(s.page.data.current_question_id, 2);
    assert.equal(s.page.data.current_index, 1);
    assert.equal(s.page.data.total_index, 2);
    assert.equal(s.page.data.answer_result, -2);
    assert.equal(s.requests.length, 0);
    assert.equal(s.clicks(), 1);
  });
}
test("practice primary action for an unanswered question still submits its selected option", () => {
  const s = practice(-2);
  s.page.primaryAction({ type: "tap" });
  assert.equal(s.requests.length, 1);
  assert.equal(s.requests[0].path, "api/question/check-training-question");
  assert.equal(s.requests[0].body.question_id, 1);
  assert.equal(s.requests[0].body.answer, 2);
  assert.equal(s.page.data.current_index, 0);
});
