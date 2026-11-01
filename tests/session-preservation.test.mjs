import { runWithAuth } from "./helpers/auth-loader.mjs";
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

for (const [mode, method, endpoint] of [
  ["answer", "getChallengeQuestions", "api/question/start-challenge"],
  ["training", "getTrainingQuestions", "api/question/training-question"],
  ["mine", "getUserMine", "api/user/mine"],
]) {
  test(`${mode} session expiry removes authentication and profile without resetting reminder caps or preferences`, async () => {
    const reminderKey = "daily-reminder:u1:template:release:2026-11-01";
    const stored = new Map([
      ["uid", "u1"],
      ["token", "expired-token"],
      ["mine_cache", { nickname: "旧资料" }],
      ["auth_session", { uid: "u1", token: "expired-token", refresh_token: "refresh-secret" }],
      ["auth_client_session_id", { uid: "u1", token: "expired-token", id: "epoch" }],
      [reminderKey, true],
      ["question_category", 3],
      ["sound_close", 1],
      ["close_show_correct_answer", 1],
      ["close_show_analysis", 1],
    ]);
    const preserved = new Map(
      [...stored].filter(
        ([key]) => !["uid", "token", "mine_cache", "auth_session", "auth_client_session_id"].includes(key),
      ),
    );
    let definition;
    const calls = [];
    const loading = { page: mode, token: 1 };
    const hidden = [];
    const request = async (path) => {
      calls.push(path);
      return { data: { code: 11111, message: "登录已失效" } };
    };
    const source = fs
      .readFileSync(
        new URL(`../pages/${mode}/${mode}.js`, import.meta.url),
        "utf8",
      )
      .replace(/import[\s\S]*?from\s+["'][^"']+["'];?/g, "");
    runWithAuth(source, {
      Page(value) {
        definition = value;
      },
      getApp: () => ({}),
      httpGET: request,
      httpPOST: request,
      showToast() {},
      showLoading: () => loading,
      hideLoading: (handle) => hidden.push(handle),
      wx: {
        getStorageSync: (key) => stored.get(key),
        setStorageSync: (key, value) => stored.set(key, value),
        clearStorageSync: () => stored.clear(),
        removeStorageSync: (key) => stored.delete(key),
      },
    });
    const page = {
      ...definition,
      data: { ...definition.data, logined: 1 },
      setData(patch) {
        Object.assign(this.data, patch);
      },
    };
    page[method]();
    await new Promise((resolve) => setImmediate(resolve));
    assert.deepEqual(calls, [endpoint]);
    assert.equal(page.data.logined, 0);
    for (const key of ["uid", "token", "mine_cache", "auth_session", "auth_client_session_id"])
      assert.equal(stored.has(key), false, `${key} must expire`);
    for (const [key, value] of preserved)
      assert.equal(stored.get(key), value, `${key} must survive expiry`);
    if (mode !== "mine") assert.deepEqual(hidden, [loading]);
  });
}
