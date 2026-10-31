import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
function parser() {
  const s = fs
    .readFileSync(
      new URL("../utils/question-entry.js", import.meta.url),
      "utf8",
    )
    .replace(/export\s*\{[\s\S]*?\};?/g, "");
  const c = vm.createContext({ Number, decodeURIComponent });
  vm.runInContext(s + "\nthis.parse=parseQuestionEntry;", c);
  return c.parse;
}
test("ordinary challenge has no fixed question", () => {
  const parse = parser();
  assert.equal(parse(), 0);
  assert.equal(parse({}), 0);
});
test("shared URLs and WeChat encoded scenes target the exact positive question", () => {
  const parse = parser();
  assert.equal(parse({ question_id: "42" }), 42);
  assert.equal(parse({ scene: "%34%32" }), 42);
  assert.equal(parse({ question_id: "7", scene: "42" }), 7);
});
test("malformed and unsafe explicit entries never silently become random challenges", () => {
  const parse = parser();
  for (const options of [
    { question_id: "" },
    { scene: "" },
    { question_id: 0 },
    { question_id: "-1" },
    { question_id: "0" },
    { scene: "%zz" },
    { scene: "a42" },
    { scene: "9007199254740993" },
    { question_id: "42&x=1" },
  ])
    assert.equal(parse(options), null);
});
