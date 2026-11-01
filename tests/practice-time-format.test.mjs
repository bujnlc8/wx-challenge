import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
test("practice time has stable minute-second width and readable hour transitions", () => {
  const scope = {
    module: { exports: {} },
    getRegExp: (value, flags) => new RegExp(value, flags),
  };
  vm.runInNewContext(
    fs.readFileSync(new URL("../utils/util.wxs", import.meta.url), "utf8"),
    scope,
  );
  for (const [input, want] of [
    [0, "00:00"],
    [9, "00:09"],
    [10, "00:10"],
    [59, "00:59"],
    [60, "01:00"],
    [3599, "59:59"],
    [3600, "1:00:00"],
    [3661, "1:01:01"],
    [-1, "00:00"],
    [undefined, "00:00"],
    [Infinity, "00:00"],
  ])
    assert.equal(scope.module.exports.elapsedTime(input), want);
});
