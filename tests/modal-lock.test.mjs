import { runWithAuth } from "./helpers/auth-loader.mjs";
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
const strip = (source) =>
  source
    .replace(/import[\s\S]*?from\s+["'][^"']+["'];?/g, "")
    .replace(/export\s*\{[\s\S]*?\};?/g, "");
const path = (relative) => new URL("../" + relative, import.meta.url);
function locks() {
  assert.ok(
    fs.existsSync(path("utils/modal-lock.js")),
    "page-owned modal locks must exist",
  );
  const a = {
    data: {},
    setData(patch) {
      Object.assign(this.data, patch);
    },
  };
  const b = {
    data: {},
    setData(patch) {
      Object.assign(this.data, patch);
    },
  };
  let current = a;
  const context = vm.createContext({ getCurrentPages: () => [current] });
  vm.runInContext(
    strip(fs.readFileSync(path("utils/modal-lock.js"), "utf8")) +
      "\nthis.create=createModalLock;",
    context,
  );
  return {
    a,
    b,
    create: context.create,
    switchTo(page) {
      current = page;
    },
  };
}
test("two overlapping modals keep their owner page locked until both release", () => {
  const s = locks();
  const popup = s.create();
  const report = s.create();
  popup.set(true);
  report.set(true);
  assert.equal(s.a.data.modal_locked, true);
  popup.set(false);
  assert.equal(s.a.data.modal_locked, true);
  report.set(false);
  assert.equal(s.a.data.modal_locked, false);
});
test("captured owner survives navigation and unrelated pages remain independently locked", () => {
  const s = locks();
  const first = s.create();
  first.set(true);
  s.switchTo(s.b);
  const second = s.create();
  second.set(true);
  first.dispose();
  assert.equal(s.a.data.modal_locked, false);
  assert.equal(s.b.data.modal_locked, true);
  second.dispose();
  assert.equal(s.b.data.modal_locked, false);
});
test("hide releases active lock, show restores requested visibility and detach cannot relock", () => {
  const s = locks();
  const lock = s.create();
  lock.set(true);
  lock.hide();
  assert.equal(s.a.data.modal_locked, false);
  lock.show();
  assert.equal(s.a.data.modal_locked, true);
  lock.hide();
  lock.set(false);
  lock.show();
  assert.equal(s.a.data.modal_locked, false);
  lock.set(true);
  lock.dispose();
  lock.show();
  lock.set(true);
  assert.equal(s.a.data.modal_locked, false);
});
test("show_modal false keeps a full-screen popup hit barrier while preserving transparent appearance", () => {
  const template = fs.readFileSync(path("component/popup/popup.wxml"), "utf8");
  const rootClass = template.match(/^<view\s+class="([^"]*)"/)[1];
  const rendered = rootClass.replace(/\{\{([\s\S]*?)\}\}/g, (_, expression) =>
    new Function("show_modal", "return (" + expression + ")")(false),
  );
  assert.ok(
    rendered.split(/\s+/).includes("wx-popup"),
    "transparent popups must still cover the viewport",
  );
  assert.match(
    template,
    /class="popup-mask"[^>]*catchtap="catchtouchmove"[^>]*catchtouchmove="catchtouchmove"/,
  );
});
function component(name, initial = {}) {
  const s = locks();
  let definition;
  const source =
    strip(fs.readFileSync(path("utils/modal-lock.js"), "utf8")) +
    "\n" +
    strip(fs.readFileSync(path(`component/${name}/${name}.js`), "utf8"));
  runWithAuth(source, {
    getCurrentPages: () => [s.a],
    getApp: () => ({ clickSound() {} }),
    wx: { getStorageSync: (key) => (key === "uid" ? "u1" : "t1") },
    Component(value) {
      definition = value;
    },
    clearFeedback() {},
    setTimeout,
    clearTimeout,
  });
  const instance = {
    data: {
      ...Object.fromEntries(
        Object.entries(definition.properties || {}).map(([key, prop]) => [
          key,
          prop.value,
        ]),
      ),
      ...definition.data,
      ...initial,
    },
    ...definition.methods,
    setData(patch) {
      Object.assign(this.data, patch);
      for (const [fields, observer] of Object.entries(
        definition.observers || {},
      )) {
        const keys = fields.split(",").map((key) => key.trim());
        if (keys.some((key) => key in patch))
          observer.call(this, ...keys.map((key) => this.data[key]));
      }
    },
    triggerEvent() {},
  };
  definition.lifetimes.attached.call(instance);
  return { ...s, instance, definition };
}
test("report child close releases its actual visibility even if the parent property remains true", () => {
  const s = component("report", { show_feedback: true });
  assert.equal(s.a.data.modal_locked, true);
  const parent = { show_feedback: true };
  s.instance.closeFeedback();
  assert.equal(parent.show_feedback, true);
  assert.equal(s.instance.data.show_feedback, false);
  assert.equal(s.a.data.modal_locked, false);
});
test("only explicitly masked toast/loading feedback locks background scrolling", () => {
  const s = component("ui-feedback", {
    state: { toast: { title: "notice", mask: false }, loading: null },
  });
  assert.notEqual(s.a.data.modal_locked, true);
  s.instance.setData({
    state: { toast: null, loading: { title: "loading", mask: true } },
  });
  assert.equal(s.a.data.modal_locked, true);
  s.instance.setData({
    state: { toast: { mask: true }, loading: { mask: false } },
  });
  assert.equal(s.a.data.modal_locked, true);
  s.instance.setData({ state: { toast: null, loading: null } });
  assert.equal(s.a.data.modal_locked, false);
});

test("popup visibility and page lifecycle release and restore its scroll lock", () => {
  const s = component("popup");
  assert.notEqual(s.a.data.modal_locked, true);
  s.instance.showPopup();
  assert.equal(s.a.data.modal_locked, true);
  s.definition.pageLifetimes.hide.call(s.instance);
  assert.equal(s.a.data.modal_locked, false);
  s.definition.pageLifetimes.show.call(s.instance);
  assert.equal(s.a.data.modal_locked, true);
  s.instance.hidePopup();
  assert.equal(s.a.data.modal_locked, false);
  s.instance.showPopup();
  s.definition.lifetimes.detached.call(s.instance);
  assert.equal(s.a.data.modal_locked, false);
});

test("closing an already closed popup stays closed and never acquires a scroll lock", () => {
  const s = component("popup");
  s.instance.hidePopup();
  s.instance.hidePopup();
  assert.equal(s.instance.data.flag, true);
  assert.notEqual(s.a.data.modal_locked, true);
  s.instance.showPopup();
  s.instance.hidePopup();
  s.instance.hidePopup();
  assert.equal(s.instance.data.flag, true);
  assert.equal(s.a.data.modal_locked, false);
});

test("showing an already open popup preserves its visible confirmation and lock", () => {
  const s = component("popup");
  s.instance.showPopup();
  s.instance.showPopup();
  assert.equal(s.instance.data.flag, false);
  assert.equal(s.a.data.modal_locked, true);
  s.instance.hidePopup();
  s.definition.pageLifetimes.hide.call(s.instance);
  s.definition.pageLifetimes.show.call(s.instance);
  assert.equal(s.instance.data.flag, true);
  assert.equal(s.a.data.modal_locked, false);
});
test("page-meta binds real modal conditions and never mistakes answer preferences for a modal", () => {
  const config = JSON.parse(fs.readFileSync(path("app.json"), "utf8"));
  for (const page of config.pages) {
    const template = fs.readFileSync(path(page + ".wxml"), "utf8");
    assert.match(
      template,
      /^<page-meta /,
      page + " must expose the native scroll lock",
    );
    const expression = template.match(
      /^<page-meta[^>]*page-style="\{\{([\s\S]*?)\}\}"/,
    )[1];
    const render = (state) =>
      new Function(
        "modal_locked",
        "show_tip",
        "category_sheet_visible",
        "show_analysis",
        "return (" + expression + ")",
      )(!!state.locked, !!state.tip, !!state.category, !!state.analysis);
    assert.equal(render({ locked: true }), "overflow: hidden;");
    assert.equal(render({}), "");
    if (/pages\/(answer|training)\//.test(page))
      assert.equal(render({ analysis: true }), "");
    if (page === "pages/index/index")
      assert.equal(render({ tip: true }), "overflow: hidden;");
    if (page === "pages/mine/mine")
      assert.equal(render({ category: true }), "overflow: hidden;");
    if (page === "pages/wrong/wrong")
      assert.equal(render({ analysis: true }), "overflow: hidden;");
  }
});
