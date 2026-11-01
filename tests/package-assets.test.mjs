import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { auditPackage, isIgnored, summarizeFiles } from "../scripts/audit-package.mjs";

function fixture(t, contents) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "miniapp-assets-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  for (const [file, content] of Object.entries(contents)) {
    fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    fs.writeFileSync(path.join(root, file), content);
  }
  return { root, files: Object.keys(contents) };
}

test("current package has no missing or excluded runtime dependencies", () => {
  const root = fileURLToPath(new URL("../", import.meta.url));
  const result = auditPackage({ root });
  assert.deepEqual(result.errors, []);
  assert.deepEqual(result.unusedImages, []);
});

test("auditor resolves require extension, WXML, Canvas and WXSS assets", (t) => {
  const project = fixture(t, {
    "project.config.json": "{}",
    "app.js": 'const sdk = require("./libs/sdk.min"); const logo = "/images/logo.png";',
    "libs/sdk.min.js": "module.exports = {};",
    "app.json": JSON.stringify({ pages: ["pages/home/home"], tabBar: { list: [{ iconPath: "images/tab.png" }] } }),
    "pages/home/home.js": "Page({});",
    "pages/home/home.wxml": '<image src="/images/photo.png" /><wxs src="./helpers.wxs" module="helper"/>',
    "pages/home/helpers.wxs": "module.exports = {};",
    "app.wxss": '@import "./styles/common.wxss";',
    "styles/common.wxss": 'view { background: url("/images/background.png"); }',
    "images/photo.png": "photo",
    "images/tab.png": "tab",
    "images/logo.png": "logo",
    "images/background.png": "background",
  });
  const result = auditPackage(project);
  assert.deepEqual(result.errors, []);
  assert.deepEqual(result.unusedImages, []);
  assert.equal(result.references, 9);
});

test("auditor rejects missing and excluded files referenced from runtime", (t) => {
  const project = fixture(t, {
    "project.config.json": JSON.stringify({ packOptions: { ignore: [{ type: "folder", value: "libs" }] } }),
    "app.js": 'require("./libs/sdk.min"); const logo = "/images/missing.png";',
    "libs/sdk.min.js": "module.exports = {};",
  });
  const result = auditPackage(project);
  assert.ok(result.errors.some((error) => error.includes("referenced file excluded from upload: libs/sdk.min.js")));
  assert.ok(result.errors.some((error) => error.includes("missing local reference /images/missing.png")));
});

test("dynamic rank references require every rank, including unranked", (t) => {
  const contents = {
    "project.config.json": "{}",
    "app.wxml": '<image src="/images/ui-grade-{{user.grade || 0}}.png" />',
  };
  for (let rank = 0; rank <= 6; rank++) contents[`images/ui-grade-${rank}.png`] = String(rank);
  const project = fixture(t, contents);
  assert.deepEqual(auditPackage(project).errors, []);
  project.files = project.files.filter((file) => file !== "images/ui-grade-4.png");
  assert.ok(auditPackage(project).errors.some((error) => error.includes("missing local reference /images/ui-grade-4.png")));
});

test("pack rules use directory boundaries and actual upload-file byte totals", () => {
  const rules = [{ type: "folder", value: "docs" }, { type: "file", value: "README.md" }, { type: "prefix", value: ".git" }];
  assert.equal(isIgnored("docs/a.png", rules), true);
  assert.equal(isIgnored("docs-runtime/a.png", rules), false);
  assert.equal(isIgnored(".gitignore", rules), true);
  const result = summarizeFiles({ "docs/a.png": 1000, "README.md": 500, "images/a.png": 25, "utils/a.js": 10, "project.private.config.json": 50 }, rules);
  assert.equal(result.bytes, 35);
  assert.equal(result.files, 2);
});
