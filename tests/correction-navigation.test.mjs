import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { runWithAuth } from "./helpers/auth-loader.mjs";
const source = (p) =>
  fs.readFileSync(new URL("../" + p, import.meta.url), "utf8");
const strip = (s) =>
  s
    .replace(/import[\s\S]*?from\s+["'][^"']+["'];?/g, "")
    .replace(/export\s*\{[\s\S]*?\};?/g, "");
function bridge() {
  let def;
  const navigations = [],
    events = [],
    notices = [];
  const storage = new Map([
    ["uid", "u1"],
    ["token", "t1"],
  ]);
  const owner = { setData() {} };
  runWithAuth(
    strip(source("utils/modal-lock.js")) +
      "\n" +
      strip(source("component/report/report.js")),
    {
      Component: (d) => (def = d),
      getApp: () => ({ clickSound() {} }),
      getCurrentPages: () => [owner],
      wx: {
        getStorageSync: (k) => storage.get(k),
        setStorageSync: (k, v) => storage.set(k, v),
        navigateTo: (o) => navigations.push(o),
      },
      showToast: (s) => notices.push(s),
      httpGET: () => new Promise(() => {}),
    },
  );
  const c = {
    ...def.methods,
    data: {
      ...Object.fromEntries(
        Object.entries(def.properties).map(([k, v]) => [k, v.value]),
      ),
      ...structuredClone(def.data),
      show_feedback: true,
      question_id: 42,
    },
    setData(p) {
      Object.assign(this.data, p);
      for (const [fields, fn] of Object.entries(def.observers || {})) {
        const names = fields.split(",").map((x) => x.trim());
        if (names.some((k) => k in p))
          fn.call(this, ...names.map((k) => this.data[k]));
      }
    },
    triggerEvent: (name, detail) => events.push({ name, detail }),
  };
  def.lifetimes.attached.call(c);
  return { c, def, navigations, events, notices, storage };
}
test("correction bridge opens one native page and notifies return exactly once", () => {
  const s = bridge();
  s.c.getCaptcha();
  s.c.getCaptcha();
  assert.equal(s.navigations.length, 1);
  assert.equal(
    s.navigations[0].url,
    "/pages/correction/correction?question_id=42",
  );
  s.def.pageLifetimes.hide.call(s.c);
  s.navigations[0].events.correctionClosed();
  s.navigations[0].events.correctionClosed();
  assert.equal(s.c.data.show_feedback, false);
  assert.equal(s.events.length, 1);
  assert.equal(s.events[0].name, "nextQuestion");
});
test("failed page navigation clears the parent guard and supports retry", () => {
  const s = bridge();
  s.c.getCaptcha();
  assert.equal(s.navigations.length, 1);
  s.navigations[0].fail();
  assert.equal(s.c.data.show_feedback, false);
  assert.equal(s.events.length, 1);
  assert.equal(s.notices.length, 1);
  s.c.setData({ show_feedback: true });
  s.c.getCaptcha();
  assert.equal(s.navigations.length, 2);
});
test("late return cannot close a new correction navigation or an unloaded parent", () => {
  const s = bridge();
  s.c.getCaptcha();
  assert.equal(s.navigations.length, 1);
  const old = s.navigations[0].events.correctionClosed;
  old();
  s.c.setData({ show_feedback: true });
  s.c.getCaptcha();
  old();
  assert.equal(s.c.data.show_feedback, true);
  assert.equal(s.events.length, 1);
  s.def.lifetimes.detached.call(s.c);
  s.navigations[1].events.correctionClosed();
  assert.equal(s.events.length, 1);
});
test("page form uses native keyboard avoidance without fixed or clipping input ancestors", () => {
  const p = new URL(
    "../component/correction-form/correction-form.wxml",
    import.meta.url,
  );
  assert.equal(fs.existsSync(p), true);
  const wxml = fs.readFileSync(p, "utf8"),
    css = source("component/correction-form/correction-form.wxss");
  assert.match(wxml, /<textarea[^>]+adjust-position="\{\{true\}\}"/);
  assert.match(wxml, /<input[^>]+adjust-position="\{\{true\}\}"/);
  assert.doesNotMatch(
    wxml,
    /scroll-view|keyboardheightchange|fixed="\{\{true\}\}"/,
  );
  assert.doesNotMatch(css, /position:\s*fixed|overflow:\s*hidden|translate\(/);
  const app = JSON.parse(source("app.json"));
  assert.ok(app.pages.includes("pages/correction/correction"));
});

test("return after an account change clears the guard without claiming the original answer context", () => {
  const s = bridge();
  s.c.getCaptcha();
  s.storage.set("uid", "u2");
  s.storage.set("token", "t2");
  s.navigations[0].events.correctionClosed();
  assert.equal(s.events[0].detail.reason, "account-change");
  assert.equal(s.c.data.show_feedback, false);
});
test("a request issued before the visible property arrives opens only its new target", () => {
  const s = bridge();
  s.c.setData({ show_feedback: false });
  s.c.getCaptcha();
  assert.equal(s.navigations.length, 0);
  s.c.setData({ question_id: 91, show_feedback: true });
  assert.equal(s.navigations.length, 1);
  assert.equal(
    s.navigations[0].url,
    "/pages/correction/correction?question_id=91",
  );
});
function correctionPage() {
  let def;
  const backs = [],
    notices = [],
    emits = [];
  let captcha = 0;
  runWithAuth(strip(source("pages/correction/correction.js")), {
    Page: (d) => (def = d),
    showToast: (s) => notices.push(s),
    wx: {
      hideShareMenu() {},
      navigateBack: (o) => backs.push(o),
      switchTab() {},
    },
  });
  const p = {
    ...def,
    data: { ...def.data },
    setData(v) {
      Object.assign(this.data, v);
    },
    selectComponent() {
      return this.data.invalid
        ? null
        : {
            getCaptcha() {
              captcha++;
            },
          };
    },
    getOpenerEventChannel: () => ({ emit: (e) => emits.push(e) }),
  };
  return { p, backs, notices, emits, captcha: () => captcha };
}
test("correction page loads its own captcha and closes once without submitting an answer", () => {
  const s = correctionPage();
  s.p.onLoad({ question_id: "42" });
  s.p.onReady();
  assert.equal(s.captcha(), 1);
  s.p.onFormClosed({ detail: { submitted: true } });
  s.p.onFormClosed({ detail: { submitted: true } });
  assert.equal(s.backs.length, 1);
  assert.equal(s.notices.length, 0);
  s.backs[0].success();
  assert.equal(s.notices.length, 1);
  s.p.onUnload();
  assert.deepEqual(s.emits, ["correctionClosed"]);
});
test("invalid question routes never mount or request a captcha", () => {
  for (const question_id of [
    undefined,
    "0",
    "-1",
    "1.5",
    "42abc",
    "9007199254740992",
  ]) {
    const s = correctionPage();
    s.p.onLoad({ question_id });
    s.p.onReady();
    assert.equal(s.p.data.invalid, true);
    assert.equal(s.captcha(), 0);
  }
});
