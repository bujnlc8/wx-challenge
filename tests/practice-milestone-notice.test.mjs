import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { runWithAuth } from "./helpers/auth-loader.mjs";

const message = "练习100题达标，10000百科币已到账";
const flush = async () => {
  for (let i = 0; i < 8; i++) await Promise.resolve();
};
function setup() {
  const storage = new Map([
    ["uid", 7],
    ["token", "token-7"],
  ]);
  const posts = [],
    gets = [],
    notices = [],
    sounds = [];
  let definition,
    nativeHooks,
    now = 1000000,
    top;
  const poster = {
    data: { visible: false },
    open() {
      this.data.visible = true;
    },
  };
  const app = {
    show_analysis: 1,
    clickSound() {},
    correctSound() {
      sounds.push("correct");
    },
    quickCorrectSound() {
      sounds.push("quick");
    },
    wrongSound() {
      sounds.push("wrong");
    },
    playSound(value) {
      sounds.push(value);
    },
  };
  class Clock extends Date {
    static now() {
      return now;
    }
  }
  runWithAuth(
    fs
      .readFileSync(
        new URL("../pages/training/training.js", import.meta.url),
        "utf8",
      )
      .replace(/import[\s\S]*?from\s+["'][^"']+["'];?/g, ""),
    {
      Date: Clock,
      wx: {
        getStorageSync: (key) => storage.get(key),
        setStorageSync: (key, value) => storage.set(key, value),
        removeStorageSync: (key) => storage.delete(key),
        hideShareMenu() {},
      },
      getApp: () => app,
      getCurrentPages: () => [top],
      Page(value) {
        definition = value;
      },
      showToast(value) {
        notices.push(value);
      },
      httpGET(path) {
        gets.push(path);
        return Promise.resolve({ data: { code: 10000 } });
      },
      httpPOST(path, body) {
        return new Promise((resolve, reject) =>
          posts.push({ path, body, resolve, reject }),
        );
      },
      setInterval: () => 3,
      clearInterval() {},
      createDailyReminder(hooks) {
        nativeHooks = hooks;
        return { refresh() {}, dispose() {} };
      },
    },
  );
  const page = {
    ...definition,
    data: {
      ...structuredClone(definition.data),
      current_question_id: 17,
      option_a: "甲",
      option_b: "乙",
      selected_option: 2,
      answer_result: -1,
      count_down: 7,
      count_down_stop: true,
      total_index: 100,
    },
    setData(patch, done) {
      Object.assign(this.data, patch);
      done?.();
    },
    selectComponent() {
      return poster;
    },
    report: { getCaptcha() {} },
  };
  page.popup = {
    hidePopup() {
      page.data.modal_locked = false;
    },
  };
  top = page;
  const reply = async (result = 1, ...values) => {
    const toast = values.length ? values[0] : message;
    posts
      .at(-1)
      .resolve({
        data: {
          code: 10000,
          data: { result, right_answer: 2, analysis: "解析", toast },
        },
      });
    await flush();
  };
  return {
    page,
    posts,
    gets,
    notices,
    sounds,
    storage,
    poster,
    reply,
    expire() {
      now += 300001;
    },
    native() {
      return nativeHooks;
    },
    navigate() {
      top = {};
    },
  };
}

for (const result of [0, 1]) {
  test(`backend milestone toast is shown for a ${result ? "correct" : "wrong"} answer without changing the answer flow`, async () => {
    const s = setup();
    s.page._submitAnswer();
    await s.reply(result);
    assert.equal(s.notices.length, 1);
    assert.equal(s.notices[0].title, message);
    assert.equal(s.notices[0].duration, 4000);
    assert.equal(s.notices[0].mask, false);
    assert.equal(s.page.data.answer_result, result);
    assert.equal(s.page.data.selected_option, 2);
    assert.equal(s.page.data.count_down, 7);
    assert.equal(s.page.data.count_down_stop, true);
    assert.equal(s.page.data.analysis, "解析");
    assert.deepEqual(s.sounds, [result ? "correct" : "wrong"]);
    assert.equal(s.posts.length, 1);
    assert.equal(s.posts[0].path, "api/question/check-training-question");
    assert.equal(s.posts[0].body.question_id, 17);
    assert.equal(s.gets.length, 0);
  });
}

test("an empty or absent server toast never invents a milestone from local question count", async () => {
  for (const toast of ["", undefined, null, "   "]) {
    const s = setup();
    s.page._submitAnswer();
    await s.reply(1, toast);
    assert.equal(s.notices.length, 0);
    assert.equal(s.posts.length, 1);
    assert.equal(s.gets.length, 0);
  }
});

test("feedback, poster and popup defer one notice until their close hook without duplication", async () => {
  for (const overlay of ["feedback", "poster", "popup", "popup-confirm"]) {
    const s = setup();
    if (overlay === "feedback") s.page.data.show_feedback = true;
    if (overlay === "poster") s.poster.data.visible = true;
    if (overlay === "popup" || overlay === "popup-confirm")
      s.page.data.modal_locked = true;
    s.page._submitAnswer();
    await s.reply(0);
    assert.equal(s.notices.length, 0, overlay);
    if (overlay === "feedback") s.page.onFeedbackClosed();
    if (overlay === "poster") {
      s.poster.data.visible = false;
      s.page.onQuestionPosterClose();
    }
    if (overlay === "popup") s.page.popupCancel();
    if (overlay === "popup-confirm") s.page.popupConfirm();
    assert.equal(
      s.notices.length,
      1,
      overlay + " closes at its own safe point",
    );
    s.page.onShow();
    s.page.onShow();
    assert.equal(s.notices.length, 1, overlay);
    assert.equal(s.notices[0].title, message);
  }
});

test("hidden and native subscription panels defer the notice until a safe visible point", async () => {
  const hidden = setup();
  hidden.page.onHide();
  hidden.page._submitAnswer();
  await hidden.reply();
  assert.equal(hidden.notices.length, 0);
  hidden.page.onShow();
  hidden.page.onShow();
  assert.equal(hidden.notices.length, 1);
  const native = setup();
  native.page.initializeDailyReminder();
  native.native().onNativeOpen();
  native.page._submitAnswer();
  await native.reply();
  assert.equal(native.notices.length, 0);
  native.native().onNativeSettled();
  native.native().onNativeSettled();
  assert.equal(native.notices.length, 1);
});

test("old-account and unloaded response bodies cannot update results or display a notice", async () => {
  for (const stop of ["account", "unload"]) {
    const s = setup();
    s.page._submitAnswer();
    if (stop === "account") {
      s.storage.set("uid", 8);
      s.storage.set("token", "token-8");
    } else s.page.onUnload();
    await s.reply();
    assert.equal(s.notices.length, 0, stop);
    assert.equal(s.page.data.answer_result, -1);
    assert.equal(s.page.data.analysis, "");
    assert.equal(s.sounds.length, 0);
  }
});

test("queued notices are discarded after account change, unload or five minutes in the background", async () => {
  for (const stop of ["account", "unload", "expire"]) {
    const s = setup();
    s.page.onHide();
    s.page._submitAnswer();
    await s.reply();
    if (stop === "account") {
      s.storage.set("uid", 8);
      s.storage.set("token", "token-8");
    }
    if (stop === "unload") s.page.onUnload();
    if (stop === "expire") s.expire();
    s.page.onShow();
    assert.equal(s.notices.length, 0, stop);
  }
});
