import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

function load(accountInfo) {
  let definition;
  const strip = (source) =>
    source
      .replace(/import[\s\S]*?from\s+["'][^"']+["'];?/g, "")
      .replace(/export\s*\{[\s\S]*?\};?/g, "");
  const path = (relative) => new URL("../" + relative, import.meta.url);
  assert.ok(
    fs.existsSync(path("utils/version.js")),
    "about needs a packaged version fallback",
  );
  const context = vm.createContext({
    getApp: () => ({ clickSound() {} }),
    Page(value) {
      definition = value;
    },
    wx: {
      getAccountInfoSync() {
        if (accountInfo instanceof Error) throw accountInfo;
        return accountInfo;
      },
    },
  });
  vm.runInContext(
    strip(fs.readFileSync(path("utils/version.js"), "utf8")),
    context,
  );
  vm.runInContext(
    strip(fs.readFileSync(path("pages/about/about.js"), "utf8")),
    context,
  );
  const page = {
    ...definition,
    data: { ...definition.data },
    setData(value) {
      Object.assign(this.data, value);
    },
  };
  return page;
}

test("about displays a packaged version in development and when account information is unavailable", () => {
  for (const info of [
    { miniProgram: { version: "" } },
    { miniProgram: { version: "  " } },
    { miniProgram: { version: 123 } },
    {},
    null,
    new Error("unavailable"),
  ]) {
    const page = load(info);
    assert.equal(page.data.version, "2026.11.07.1");
    page.onLoad();
    assert.equal(page.data.version, "2026.11.07.1");
  }
});

test("about prefers the nonempty platform version over the packaged fallback", () => {
  const page = load({ miniProgram: { version: "1.8.3" } });
  page.onLoad();
  assert.equal(page.data.version, "1.8.3");
});
