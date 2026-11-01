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
function setup({ count = 37, category = 1 } = {}) {
  const file = new URL(
    "../component/home-question-settings/home-question-settings.js",
    import.meta.url,
  );
  assert.ok(
    fs.existsSync(file),
    "homepage needs its own direct custom settings sheet",
  );
  const storage = new Map([
    ["challenge_question_count", count],
    ["question_category", category],
  ]);
  const options = { writeError: false };
  const events = [];
  let sounds = 0,
    definition,
    pageDefinition;
  const app = {
    category,
    category_lables: ["不设置", "历史", "自然科学与生命科学中的复杂长名称类型"],
    categories: {
      0: "不设置",
      1: "历史",
      2: "自然科学与生命科学中的复杂长名称类型",
    },
    clickSound() {
      sounds++;
    },
  };
  let owner;
  const context = vm.createContext({
    getApp: () => app,
    getCurrentPages: () => [owner],
    Component(value) {
      definition = value;
    },
    Page(value) {
      pageDefinition = value;
    },
    wx: {
      getStorageSync: (key) => storage.get(key),
      setStorageSync(key, value) {
        if (options.writeError) throw Error("disk full");
        storage.set(key, value);
      },
      getWindowInfo: () => ({ windowHeight: 440 }),
    },
  });
  vm.runInContext(
    strip(read("utils/challenge-settings.js")) +
      "\n" +
      strip(read("utils/modal-lock.js")),
    context,
  );
  vm.runInContext(
    "(function(){" + strip(read("pages/index/index.js")) + "})()",
    context,
  );
  owner = {
    ...pageDefinition,
    data: structuredClone(pageDefinition.data),
    setData(patch) {
      Object.assign(this.data, patch);
    },
    selectComponent() {
      return instance;
    },
  };
  vm.runInContext(
    "(function(){" +
      strip(
        read("component/home-question-settings/home-question-settings.js"),
      ) +
      "})()",
    context,
  );
  const instance = {
    ...definition.methods,
    data: structuredClone(definition.data),
    setData(patch) {
      Object.assign(this.data, patch);
    },
    triggerEvent(name, detail) {
      events.push({ name, detail });
      owner.syncChallengeSettings();
    },
  };
  definition.lifetimes.attached.call(instance);
  return {
    page: owner,
    instance,
    definition,
    storage,
    app,
    options,
    events,
    get sounds() {
      return sounds;
    },
    navigateOwner(page) {
      owner = page;
    },
  };
}
const tap = (key, value) => ({ currentTarget: { dataset: { [key]: value } } });

test("homepage category/count taps open independent current drafts without navigation or persistence", () => {
  const s = setup();
  s.page.openChallengeCategory();
  assert.equal(s.instance.data.mode, "category");
  assert.equal(s.instance.data.category_draft, 1);
  assert.equal(s.instance.data.categories[0].label, "不设置");
  assert.equal(s.page.data.modal_locked, true);
  s.instance.chooseCategory(tap("index", 2));
  assert.equal(s.app.category, 1);
  s.page.openChallengeCount();
  assert.equal(s.instance.data.mode, "count");
  assert.equal(s.instance.data.count_draft, 37);
  assert.equal(s.storage.get("question_category"), 1);
  s.instance.cancel();
  assert.equal(s.instance.data.mode, "");
  assert.equal(s.page.data.modal_locked, false);
  assert.equal(s.events.length, 0);
});

test("category confirmation persists first, then updates the active filter and homepage exactly once", () => {
  const s = setup();
  s.page.openChallengeCategory();
  s.instance.chooseCategory(tap("index", "2"));
  s.instance.confirm();
  assert.equal(s.storage.get("question_category"), 2);
  assert.equal(s.app.category, 2);
  assert.equal(
    s.page.data.challenge_category,
    "自然科学与生命科学中的复杂长名称类型",
  );
  assert.equal(s.events.length, 1);
  assert.equal(s.events[0].name, "change");
  assert.equal(s.instance.data.mode, "");
  assert.equal(s.sounds, 3);
  s.page.syncChallengeSettings();
  assert.equal(s.sounds, 3);
  s.page.openChallengeCategory();
  s.instance.chooseCategory(tap("index", 0));
  s.instance.confirm();
  assert.equal(s.app.category, 0);
  assert.equal(s.page.data.challenge_category, "全部题型");
});

test("custom input saves 37 and both 1/100 bounds for the next ordinary challenge", () => {
  const s = setup();
  for (const value of [1, 100, 37]) {
    s.page.openChallengeCount();
    s.instance.inputCount({ detail: { value: String(value) } });
    assert.equal(
      s.storage.get("challenge_question_count"),
      value === 1 ? 37 : value === 100 ? 1 : 100,
    );
    s.instance.confirm();
    assert.equal(s.storage.get("challenge_question_count"), value);
    assert.equal(s.page.data.challenge_question_count, value);
  }
});

test("step controls respect 1/100 bounds and reject invalid input without saving", () => {
  const s = setup({ count: 1 });
  s.page.openChallengeCount();
  s.instance.stepCount(tap("step", -1));
  assert.equal(Number(s.instance.data.count_draft), 1);
  s.instance.stepCount(tap("step", 1));
  assert.equal(Number(s.instance.data.count_draft), 2);
  s.instance.inputCount({ detail: { value: "100" } });
  s.instance.stepCount(tap("step", 1));
  assert.equal(Number(s.instance.data.count_draft), 100);
  for (const value of ["", " ", "0", "101", "1.5", "1e1", "no"]) {
    s.instance.inputCount({ detail: { value } });
    s.instance.confirm();
    assert.equal(s.storage.get("challenge_question_count"), 1);
    assert.equal(s.instance.data.mode, "count");
    assert.ok(s.instance.data.error);
  }
  s.instance.stepCount(tap("step", 1));
  assert.ok(s.instance.data.error);
  s.instance.cancel();
  assert.equal(s.storage.get("challenge_question_count"), 1);
  s.page.openChallengeCount();
  assert.equal(Number(s.instance.data.count_draft), 1);
});

test("illegal and stale datasets cannot change either draft or persist settings", () => {
  const s = setup();
  s.page.openChallengeCategory();
  for (const value of [-1, 3, 1.5, "", null, true, {}, "no"])
    s.instance.chooseCategory(tap("index", value));
  assert.equal(s.instance.data.category_draft, 1);
  s.instance.chooseCount(tap("count", 100));
  s.page.openChallengeCount();
  for (const value of [0, 101, 1.5, "", null, true, {}, "no"])
    s.instance.chooseCount(tap("count", value));
  assert.equal(s.instance.data.count_draft, 37);
  s.instance.cancel();
  s.instance.chooseCount(tap("count", 100));
  s.instance.confirm();
  assert.equal(s.storage.get("challenge_question_count"), 37);
  assert.equal(s.events.length, 0);
});

test("storage failures retain the sheet and old active values with inline retryable errors", () => {
  for (const mode of ["category", "count"]) {
    const s = setup();
    if (mode === "category") {
      s.page.openChallengeCategory();
      s.instance.chooseCategory(tap("index", 2));
    } else {
      s.page.openChallengeCount();
      s.instance.chooseCount(tap("count", 100));
    }
    s.options.writeError = true;
    s.instance.confirm();
    assert.equal(s.instance.data.mode, mode);
    assert.ok(s.instance.data.error);
    assert.equal(s.app.category, 1);
    assert.equal(s.storage.get("challenge_question_count"), 37);
    assert.equal(s.events.length, 0);
    s.options.writeError = false;
    s.instance.confirm();
    assert.equal(s.instance.data.mode, "");
    assert.equal(s.events.length, 1);
  }
});

test("hide and detach silently discard drafts and release only the captured homepage lock", () => {
  const s = setup();
  s.page.openChallengeCount();
  s.instance.chooseCount(tap("count", 100));
  const sounds = s.sounds;
  s.definition.pageLifetimes.hide.call(s.instance);
  assert.equal(s.instance.data.mode, "");
  assert.equal(s.page.data.modal_locked, false);
  assert.equal(s.sounds, sounds);
  s.definition.pageLifetimes.show.call(s.instance);
  s.page.openChallengeCount();
  assert.equal(s.instance.data.count_draft, 37);
  const nextPage = {
    data: {},
    setData(patch) {
      Object.assign(this.data, patch);
    },
  };
  s.navigateOwner(nextPage);
  s.definition.lifetimes.detached.call(s.instance);
  assert.equal(s.page.data.modal_locked, false);
  assert.equal(nextPage.data.modal_locked, undefined);
  s.instance.open("category");
  s.instance.chooseCount(tap("count", 1));
  s.instance.confirm();
  assert.equal(s.storage.get("challenge_question_count"), 37);
});
