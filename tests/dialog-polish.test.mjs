import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { runWithAuth } from "./helpers/auth-loader.mjs";

const source = (name) =>
  fs.readFileSync(new URL("../" + name, import.meta.url), "utf8");
const strip = (text) =>
  text
    .replace(/import[\s\S]*?from\s+["'][^"']+["'];?/g, "")
    .replace(/export\s*\{[\s\S]*?\};?/g, "");
function component(name, initial = {}) {
  let definition;
  let clicks = 0;
  const events = [];
  const posts = [];
  const owner = {
    data: {},
    setData(patch) {
      Object.assign(this.data, patch);
    },
  };
  runWithAuth(
    strip(source("utils/modal-lock.js")) +
      "\n" +
      strip(source(`component/${name}/${name}.js`)),
    {
      Component(value) {
        definition = value;
      },
      getCurrentPages: () => [owner],
      getApp: () => ({
        clickSound() {
          clicks++;
        },
        playSound() {},
      }),
      wx: { getStorageSync: (key) => (key === "uid" ? "u1" : "t1") },
      showToast() {},
      httpGET: () => new Promise(() => {}),
      httpPOST(path, body) {
        posts.push({ path, body });
        return new Promise(() => {});
      },
    },
  );
  const instance = {
    ...definition.methods,
    data: {
      ...Object.fromEntries(
        Object.entries(definition.properties).map(([key, prop]) => [
          key,
          prop.value,
        ]),
      ),
      ...structuredClone(definition.data),
      ...initial,
    },
    setData(patch, callback) {
      Object.assign(this.data, patch);
      for (const [fields, callback] of Object.entries(
        definition.observers || {},
      )) {
        const names = fields.split(",").map((field) => field.trim());
        if (names.some((field) => field in patch))
          callback.call(this, ...names.map((field) => this.data[field]));
      }
      if (callback) callback();
    },
    triggerEvent(name) {
      events.push(name);
    },
  };
  definition.lifetimes.attached.call(instance);
  return { instance, definition, posts, events, owner, clicks: () => clicks };
}

test("confirmation display removes only line-ending full stops and preserves its original content", () => {
  const content =
    "确认跳过本题。\n记录将保留.  \n版本 1.1\n详情 https://example.com/a.b\n仍然继续？\n请再想想！";
  const { instance: popup } = component("popup", { content });
  assert.equal(
    popup.data.display_content,
    "确认跳过本题\n记录将保留  \n版本 1.1\n详情 https://example.com/a.b\n仍然继续？\n请再想想！",
  );
  assert.equal(popup.data.content, content);
  popup.setData({ content: "第一段。\r\n\r\n第二段.\r\n金额 1.25" });
  assert.equal(popup.data.display_content, "第一段\r\n\r\n第二段\r\n金额 1.25");
});

test("confirmation renders its normalized message and a visible default title", () => {
  const template = source("component/popup/popup.wxml");
  assert.match(template, /\{\{display_content\}\}/);
  assert.match(template, /\{\{title\s*\|\|\s*'确认操作'\}\}/);
});

test("custom correction choices retain native checkbox state and the complete backend bitmask", () => {
  const s = component("correction-form", { question_id: 16 });
  const r = s.instance;
  const template = source("component/correction-form/correction-form.wxml");
  assert.match(template, /checkbox-group\s+bindchange="feedbackChecked"/);
  assert.match(template, /<checkbox[^>]+checked="\{\{item.checked\}\}"/);
  r.feedbackChecked({ detail: { value: ["1", "4", "8", "16"] } });
  assert.deepEqual(
    Array.from(r.data.feedback_options, (item) => [item.value, item.checked]),
    [
      ["1", true],
      ["2", false],
      ["4", true],
      ["16", true],
      ["8", true],
    ],
  );
  r.feedbackChecked({ detail: { value: ["2", "16"] } });
  assert.deepEqual(
    Array.from(r.data.feedback_options, (item) => item.checked),
    [false, true, false, true, false],
  );
  r.setData({
    captcha_data: "123456",
    captcha_token: "token-captcha",
    feedback_remark: "选项有误",
  });
  r.feedbackSubmit();
  assert.deepEqual(JSON.parse(JSON.stringify(s.posts)), [
    {
      path: "api/common/feedback",
      body: {
        token: "token-captcha",
        question_id: 16,
        captcha: "123456",
        remark: "选项有误",
        type: 18,
      },
    },
  ]);
  r.feedbackChecked({ detail: { value: ["1"] } });
  assert.deepEqual(Array.from(r.data.feedback_checked_value), ["2", "16"]);
  r.closeFeedback();
  assert.ok(r.data.feedback_options.every((item) => !item.checked));
});

test("confirmation callbacks keep one click sound and programmatic hiding stays silent", () => {
  const s = component("popup");
  s.instance.showPopup();
  s.instance.popupConfirm();
  assert.deepEqual(s.events, ["success"]);
  assert.equal(s.clicks(), 1);
  s.instance.hidePopup();
  assert.equal(s.clicks(), 1);
  s.instance.popupCancel();
  assert.deepEqual(s.events, ["success", "error"]);
  assert.equal(s.clicks(), 2);
});
