import { runWithAuth } from "./helpers/auth-loader.mjs";
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
const strip = (source) =>
  source
    .replace(/import[\s\S]*?from\s+["'][^"']+["'];?/g, "")
    .replace(/export\s*\{[\s\S]*?\};?/g, "");
function report() {
  let definition;
  let uid = "u1";
  let token = "t1";
  const gets = [];
  const posts = [];
  const notices = [];
  const events = [];
  const ownerPage = {
    data: {},
    setData(patch) {
      Object.assign(this.data, patch);
    },
  };
  const source =
    strip(
      fs.readFileSync(
        new URL("../utils/modal-lock.js", import.meta.url),
        "utf8",
      ),
    ) +
    "\n" +
    strip(
      fs.readFileSync(
        new URL(
          "../component/correction-form/correction-form.js",
          import.meta.url,
        ),
        "utf8",
      ),
    );
  runWithAuth(source, {
    Component(value) {
      definition = value;
    },
    getCurrentPages: () => [ownerPage],
    getApp: () => ({ clickSound() {}, playSound() {} }),
    wx: { getStorageSync: (key) => (key === "uid" ? uid : token) },
    showToast: (...args) => notices.push(args),
    httpGET(path) {
      return new Promise((resolve, reject) =>
        gets.push({ path, resolve, reject }),
      );
    },
    httpPOST(path, body) {
      return new Promise((resolve, reject) =>
        posts.push({ path, body, resolve, reject }),
      );
    },
  });
  const c = {
    ...definition.methods,
    data: {
      ...Object.fromEntries(
        Object.entries(definition.properties).map(([name, prop]) => [
          name,
          prop.value,
        ]),
      ),
      ...definition.data,
      show_feedback: true,
      question_id: 10,
    },
    setData(patch) {
      Object.assign(this.data, patch);
      for (const [fields, observer] of Object.entries(
        definition.observers || {},
      )) {
        const names = fields.split(",").map((s) => s.trim());
        if (names.some((name) => name in patch))
          observer.call(this, ...names.map((name) => this.data[name]));
      }
    },
    triggerEvent(name) {
      events.push(name);
    },
  };
  definition.lifetimes.attached.call(c);
  const draft = (text) =>
    c.setData({
      feedback_remark: text,
      captcha_data: "123456",
      captcha_token: "captcha-token",
    });
  return {
    c,
    gets,
    posts,
    notices,
    events,
    ownerPage,
    definition,
    draft,
    switchAccount() {
      uid = "u2";
      token = "t2";
    },
  };
}
async function flush() {
  await new Promise((resolve) => setImmediate(resolve));
}
const success = (data) => ({ data: { code: 10000, data } });
test("saved feedback A cannot close or erase reopened B and new B can submit while A is pending", async () => {
  const s = report();
  s.draft("draft A");
  s.c.feedbackSubmit();
  assert.equal(s.posts.length, 1);
  s.c.closeFeedback();
  s.c.setData({ question_id: 20, show_feedback: true });
  s.draft("draft B");
  s.c.feedbackSubmit();
  assert.equal(s.posts.length, 2);
  s.posts[0].resolve(success({}));
  await flush();
  assert.equal(s.c.data.feedback_remark, "draft B");
  assert.equal(s.c.data.show_feedback, true);
  assert.equal(s.notices.length, 0);
  assert.deepEqual(s.events, ["nextQuestion"]);
  s.posts[1].resolve(success({}));
  await flush();
  assert.equal(s.c.data.show_feedback, false);
  assert.equal(s.events.length, 2);
});
test("captcha uses latest request and visible session instead of accepting stale images or errors", async () => {
  const s = report();
  s.c.getCaptcha();
  s.c.getCaptcha();
  s.gets[1].resolve(success({ token: "new", image_data: "new-image" }));
  await flush();
  s.gets[0].resolve(success({ token: "old", image_data: "old-image" }));
  await flush();
  assert.equal(s.c.data.captcha_token, "new");
  s.c.getCaptcha();
  s.c.closeFeedback();
  s.c.setData({ show_feedback: true, question_id: 20 });
  s.draft("fresh");
  s.gets[2].reject(Error("old failure"));
  await flush();
  assert.equal(s.notices.length, 0);
  assert.equal(s.c.data.feedback_remark, "fresh");
});
test("duplicate current submits and duplicate close callbacks emit only one request and close event", async () => {
  const s = report();
  s.draft("current");
  s.c.feedbackSubmit();
  s.c.feedbackSubmit();
  assert.equal(s.posts.length, 1);
  s.posts[0].resolve(success({}));
  await flush();
  s.c.closeFeedback();
  assert.deepEqual(s.events, ["nextQuestion"]);
});
test("hide, detach and account changes invalidate pending feedback without stale toasts or navigation", async () => {
  for (const boundary of ["hide", "detach", "account"]) {
    const s = report();
    s.draft("old");
    s.c.feedbackSubmit();
    if (boundary === "hide") s.definition.pageLifetimes.hide.call(s.c);
    else if (boundary === "detach") s.definition.lifetimes.detached.call(s.c);
    else s.switchAccount();
    s.posts[0].resolve(success({}));
    await flush();
    assert.equal(s.notices.length, 0);
    assert.equal(s.events.length, 0);
  }
});
test("wrong-book navigation uses active records even when cumulative challenge mistakes are zero", () => {
  let definition;
  const navigation = [];
  runWithAuth(
    strip(
      fs.readFileSync(
        new URL("../pages/mine/mine.js", import.meta.url),
        "utf8",
      ),
    ),
    {
      Page(value) {
        definition = value;
      },
      getApp: () => ({ clickSound() {} }),
      wx: {
        navigateTo(o) {
          navigation.push(o.url);
        },
      },
    },
  );
  definition.goToWrongQuestion.call({
    data: { user_info: { wrong_question: 0, wrong_valid_question: 1 } },
  });
  assert.deepEqual(navigation, ["/pages/wrong/wrong"]);
});

test("a question change while visible invalidates old captcha and feedback before the new draft", async () => {
  const s = report();
  s.c.getCaptcha();
  s.draft("A");
  s.c.feedbackSubmit();
  s.c.setData({ question_id: 20 });
  s.draft("B");
  s.gets[0].resolve(success({ token: "A-token", image_data: "A-image" }));
  s.posts[0].resolve(success({}));
  await flush();
  assert.equal(s.c.data.question_id, 20);
  assert.equal(s.c.data.feedback_remark, "B");
  assert.equal(s.c.data.captcha_token, "captcha-token");
  assert.equal(s.c.data.show_feedback, true);
  assert.equal(s.events.length, 0);
  assert.equal(s.notices.length, 0);
});
test("captcha requested just before the parent opens is loaded only for the newly visible session", async () => {
  const s = report();
  s.c.closeFeedback();
  s.c.getCaptcha();
  assert.equal(s.gets.length, 0);
  s.c.setData({ question_id: 20, show_feedback: true });
  assert.equal(s.gets.length, 1);
  s.gets[0].resolve(success({ token: "B-token", image_data: "B-image" }));
  await flush();
  assert.equal(s.c.data.captcha_token, "B-token");
});

test("returning to an open feedback dialog refreshes its invalidated captcha once", async () => {
  const s = report();
  s.c.getCaptcha();
  s.definition.pageLifetimes.hide.call(s.c);
  s.gets[0].resolve(success({ token: "old-token", image_data: "old-image" }));
  await flush();
  assert.equal(s.c.data.captcha_token, "");
  s.definition.pageLifetimes.show.call(s.c);
  assert.equal(s.gets.length, 2);
  s.definition.pageLifetimes.show.call(s.c);
  assert.equal(s.gets.length, 2);
  s.gets[1].resolve(
    success({ token: "fresh-token", image_data: "fresh-image" }),
  );
  await flush();
  assert.equal(s.c.data.captcha_token, "fresh-token");
  assert.equal(s.c.data.show_feedback, true);
  assert.notEqual(s.ownerPage.data.modal_locked, true);
});
