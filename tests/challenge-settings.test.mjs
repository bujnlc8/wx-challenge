import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const read = (path) =>
  fs.readFileSync(new URL("../" + path, import.meta.url), "utf8");
const strip = (source) =>
  source
    .replace(/import[\s\S]*?from\s+["'][^"']+["'];?/g, "")
    .replace(/export\s*\{[\s\S]*?\};?/g, "");

function load(stored, options = {}) {
  const storage = new Map(
    stored === undefined ? [] : [["challenge_question_count", stored]],
  );
  const notices = [];
  let definition;
  const platform = {
    getStorageSync(key) {
      if (options.readError) throw new Error("unavailable storage");
      return storage.get(key);
    },
    setStorageSync(key, value) {
      if (options.writeError) throw new Error("storage full");
      storage.set(key, value);
    },
    setNavigationBarTitle() {},
  };
  const context = vm.createContext({
    wx: platform,
    getApp: () => ({ clickSound() {}, is_ios: false, show_analysis: 1 }),
    Page(value) {
      definition = value;
    },
    showToast(value) {
      notices.push(value);
    },
  });
  assert.ok(
    fs.existsSync(new URL("../utils/challenge-settings.js", import.meta.url)),
    "challenge preferences must be available to new challenges",
  );
  vm.runInContext(
    strip(read("utils/challenge-settings.js")) +
      "\nthis.readCount = getChallengeQuestionCount;",
    context,
  );
  vm.runInContext(strip(read("utils/modal-lock.js")), context);
  vm.runInContext(strip(read("pages/setting/setting.js")), context);
  const page = {
    ...definition,
    data: { ...definition.data },
    setData(patch) {
      Object.assign(this.data, patch);
    },
  };
  return {
    page,
    storage,
    notices,
    readCount: () => context.readCount(platform),
  };
}

test("new challenges read a legal whole-number preference or default to fifty", () => {
  for (const [stored, expected] of [
    [undefined, 50],
    [1, 1],
    [10, 10],
    [100, 100],
    [101, 101],
    [500, 500],
    [37, 37],
    ["23", 23],
    [0, 50],
    [501, 50],
    [1.5, 50],
    ["1.5", 50],
    ["", 50],
    [" ", 50],
    [null, 50],
    [true, 50],
    [{}, 50],
    [NaN, 50],
  ]) {
    assert.equal(
      load(stored).readCount(),
      expected,
      `stored ${String(stored)}`,
    );
  }
  assert.equal(load(37, { readError: true }).readCount(), 50);
});

test("cancel discards the draft and confirmation persists a custom count", () => {
  const s = load(23);
  s.page.onLoad();
  assert.equal(s.page.data.challenge_question_count, 23);
  s.page.openQuestionCountSheet();
  s.page.chooseQuestionCount({ currentTarget: { dataset: { count: 50 } } });
  assert.equal(s.page.data.question_count_draft, "50");
  assert.equal(s.storage.get("challenge_question_count"), 23);
  s.page.cancelQuestionCountSheet();
  s.page.openQuestionCountSheet();
  assert.equal(s.page.data.question_count_draft, "23");
  s.page.inputQuestionCount({ detail: { value: "37" } });
  s.page.confirmQuestionCountSheet();
  assert.equal(s.storage.get("challenge_question_count"), 37);
  assert.equal(s.page.data.challenge_question_count, 37);
  assert.equal(s.page.data.question_count_sheet_visible, false);
  s.page.confirmQuestionCountSheet();
  assert.equal(s.storage.get("challenge_question_count"), 37);
});

test("empty, fractional and out-of-range drafts cannot overwrite saved settings", () => {
  const s = load(20);
  s.page.onLoad();
  s.page.openQuestionCountSheet();
  for (const value of ["", " ", "0", "1.5", "1e1", "0x10", "no", "-1"]) {
    s.page.inputQuestionCount({ detail: { value } });
    s.page.confirmQuestionCountSheet();
    assert.equal(s.storage.get("challenge_question_count"), 20, value);
    assert.equal(s.page.data.question_count_sheet_visible, true, value);
    assert.ok(s.page.data.question_count_error, value);
  }
  s.page.inputQuestionCount({ detail: { value: "1" } });
  s.page.confirmQuestionCountSheet();
  assert.equal(s.storage.get("challenge_question_count"), 1);
});

test("step controls stop at the count bounds and do not save a draft", () => {
  const s = load(1);
  s.page.onLoad();
  s.page.openQuestionCountSheet();
  s.page.stepQuestionCount({ currentTarget: { dataset: { step: -1 } } });
  assert.equal(s.page.data.question_count_draft, "1");
  s.page.stepQuestionCount({ currentTarget: { dataset: { step: 1 } } });
  assert.equal(s.page.data.question_count_draft, "2");
  s.page.inputQuestionCount({ detail: { value: "500" } });
  s.page.stepQuestionCount({ currentTarget: { dataset: { step: 1 } } });
  assert.equal(s.page.data.question_count_draft, "500");
  assert.equal(s.storage.get("challenge_question_count"), 1);
});

test("failed storage keeps the old value visible and allows retry", () => {
  const options = { writeError: true };
  const s = load(20, options);
  s.page.onLoad();
  s.page.openQuestionCountSheet();
  s.page.chooseQuestionCount({ currentTarget: { dataset: { count: 50 } } });
  s.page.confirmQuestionCountSheet();
  assert.equal(s.storage.get("challenge_question_count"), 20);
  assert.equal(s.page.data.challenge_question_count, 20);
  assert.equal(s.page.data.question_count_sheet_visible, true);
  assert.ok(s.page.data.question_count_error);
  assert.equal(s.notices.length, 0);
  options.writeError = false;
  s.page.confirmQuestionCountSheet();
  assert.equal(s.storage.get("challenge_question_count"), 50);
  assert.equal(s.page.data.challenge_question_count, 50);
});

test("the custom sheet releases its page lock when hidden, restores on return and disposes on unload", () => {
  const s = load(10);
  s.page.onLoad();
  s.page.openQuestionCountSheet();
  assert.equal(s.page.data.modal_locked, true);
  s.page.onHide();
  assert.equal(s.page.data.modal_locked, false);
  s.page.onShow();
  assert.equal(s.page.data.modal_locked, true);
  s.page.cancelQuestionCountSheet();
  assert.equal(s.page.data.modal_locked, false);
  s.page.openQuestionCountSheet();
  s.page.onUnload();
  assert.equal(s.page.data.modal_locked, false);
  s.page.onShow();
  assert.equal(s.page.data.modal_locked, false);
});

test("settings exposes the requested eight quick counts and caps typed overflow before confirmation", () => {
  const s = load(20);
  s.page.onLoad();
  s.page.openQuestionCountSheet();
  assert.deepEqual(
    Array.from(s.page.data.question_count_options),
    [10, 20, 50, 100, 150, 200, 300, 500],
  );
  for (const value of ["501", "1000", "9999", "500.5"]) {
    assert.equal(s.page.inputQuestionCount({ detail: { value } }), "500");
    assert.equal(s.page.data.question_count_draft, "500");
    assert.equal(s.storage.get("challenge_question_count"), 20);
  }
  s.page.confirmQuestionCountSheet();
  assert.equal(s.storage.get("challenge_question_count"), 500);
});


test("both count controls keep plus enabled at 100 and disable it at 500", () => {
  for (const [path, field] of [
    ["pages/setting/setting.wxml", "question_count_draft"],
    ["component/home-question-settings/home-question-settings.wxml", "count_draft"],
  ]) {
    const button = read(path).match(/<button[^>]*data-step="1"[^>]*>/)[0];
    const expression = button.match(/disabled="\{\{([^}]+)\}\}"/)[1];
    const disabled = new Function(field, "return (" + expression + ")");
    assert.equal(disabled(100), false, path);
    assert.equal(disabled(500), true, path);
  }
});
