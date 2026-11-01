import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

test("help opens one answer at a time, closes it on repeat tap and ignores unknown entries", () => {
  let definition;
  vm.runInNewContext(
    fs.readFileSync(new URL("../pages/help/help.js", import.meta.url), "utf8"),
    { Page: (value) => (definition = value), getApp: () => ({ clickSound() {} }) },
  );
  const page = {
    ...definition,
    data: { ...definition.data },
    setData(patch) {
      Object.assign(this.data, patch);
    },
  };
  assert.equal(page.data.active_section, "");
  const tap = (id) =>
    page.toggleSection({ currentTarget: { dataset: { id } } });
  const [first, second] = page.data.sections;
  tap(first.id);
  assert.equal(page.data.active_section, first.id);
  tap(second.id);
  assert.equal(page.data.active_section, second.id);
  tap("missing");
  assert.equal(page.data.active_section, second.id);
  tap(second.id);
  assert.equal(page.data.active_section, "");
});
