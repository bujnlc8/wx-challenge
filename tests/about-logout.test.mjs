import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
function load(name) {
  let definition;
  const storage = new Map([
    ["uid", "user"],
    ["token", "session"],
    ["mine_cache", { nickname: "name" }],
    ["question_category", 2],
  ]);
  const app = {
    category: 2,
    show_class_tip: 0,
    category_lables: [],
    categories: {},
  };
  let src = fs
    .readFileSync(
      new URL("../pages/" + name + "/" + name + ".js", import.meta.url),
      "utf8",
    )
    .replace(/import[\s\S]*?from\s+["'][^"']+["'];?/g, "");
  if (name === "about") {
    src =
      fs
        .readFileSync(new URL("../utils/version.js", import.meta.url), "utf8")
        .replace(/export\s*\{[\s\S]*?\};?/g, "") +
      "\n" +
      src;
  }
  vm.runInNewContext(src, {
    Page: (d) => (definition = d),
    getApp: () => app,
    showToast: () => {},
    wx: {
      getStorageSync: (k) => storage.get(k),
      removeStorageSync: (k) => storage.delete(k),
      getAccountInfoSync: () => ({ miniProgram: { version: "" } }),
    },
  });
  const page = {
    ...definition,
    data: { ...definition.data },
    setData(d) {
      Object.assign(this.data, d);
    },
  };
  return { page, storage };
}
test("about shows logout only for an authenticated account and clears credentials without clearing preferences", () => {
  const { page, storage } = load("about");
  page.onShow();
  assert.equal(page.data.logined, true);
  page.logout();
  assert.equal(page.data.logined, false);
  for (const k of ["uid", "token", "mine_cache"])
    assert.equal(storage.has(k), false);
  assert.equal(storage.get("question_category"), 2);
});
test("returning to mine after logout clears stale personal information", () => {
  const { page, storage } = load("mine");
  storage.delete("uid");
  page.data.logined = 1;
  page.data.user_info = { nickname: "old-account" };
  page.onShow();
  assert.equal(page.data.logined, 0);
  assert.equal(Object.keys(page.data.user_info).length, 0);
});
