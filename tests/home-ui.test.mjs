import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { runWithAuth } from "./helpers/auth-loader.mjs";

const read = (path) =>
  fs.readFileSync(new URL("../" + path, import.meta.url), "utf8");
const strip = (source) =>
  source
    .replace(/import[\s\S]*?from\s+["'][^"']+["'];?/g, "")
    .replace(/export\s*\{[\s\S]*?\};?/g, "");
const flush = async () => {
  for (let i = 0; i < 8; i++) await Promise.resolve();
};

function setup({ uid = 7, count = 10 } = {}) {
  const storage = new Map([["challenge_question_count", count]]);
  if (uid) {
    storage.set("uid", uid);
    storage.set("token", "token-" + uid);
  }
  const requests = [];
  const navigations = [];
  let definition;
  let overlays = 0;
  let stopped = 0;
  const app = {
    category: 2,
    categories: { 0: "不设置", 2: "交通安全与道路通行规则" },
    clickSound() {},
    checkLogin(callback) {
      callback();
    },
  };
  runWithAuth(
    strip(read("utils/challenge-settings.js")) +
      "\n" +
      strip(read("pages/index/index.js")),
    {
      wx: {
        getStorageSync: (key) => storage.get(key),
        setStorageSync: (key, value) => storage.set(key, value),
        removeStorageSync: (key) => storage.delete(key),
        setNavigationBarTitle() {},
        hideShareMenu() {},
        getStorage({ fail }) {
          fail();
        },
        navigateTo(options) {
          navigations.push(options.url);
          options.complete?.();
        },
        stopPullDownRefresh() {
          stopped++;
        },
      },
      getApp: () => app,
      getCurrentPages: () => [page],
      Page(value) {
        definition = value;
      },
      showLoading() {
        overlays++;
      },
      hideLoading() {},
      showToast() {},
      httpGET(url, data) {
        assert.equal(url, "api/question/ranking-list");
        return new Promise((resolve, reject) =>
          requests.push({ type: data.type, resolve, reject }),
        );
      },
    },
  );
  const page = {
    ...definition,
    data: structuredClone(definition.data),
    setData(patch) {
      Object.assign(this.data, patch);
    },
  };
  return {
    page,
    storage,
    app,
    requests,
    navigations,
    get overlays() {
      return overlays;
    },
    get stopped() {
      return stopped;
    },
  };
}
const success = (list = [], mine = null, rank = 999) => ({
  statusCode: 200,
  data: { code: 10000, data: { list, mine, rank, reset_seconds: 90061 } },
});
const person = (score = 3200) => ({
  uid: 7,
  nickname: "小百科",
  avatar_url: "/images/default_avatar.png",
  grade: 1,
  total_score: score,
  total_question: 12,
});

// Removing onShow synchronization would leave settings stale after returning from Mine/Settings.
test("homepage shows current category and validates challenge count again on every return", () => {
  const s = setup({ count: 1 });
  s.page.onLoad();
  s.page.onShow();
  assert.equal(s.page.data.challenge_category, "交通安全与道路通行规则");
  assert.equal(s.page.data.challenge_question_count, 1);
  s.storage.set("challenge_question_count", 100);
  s.app.category = 0;
  s.page.onShow();
  assert.equal(s.page.data.challenge_category, "全部题型");
  assert.equal(s.page.data.challenge_question_count, 100);
  s.storage.set("challenge_question_count", 101);
  s.page.onShow();
  assert.equal(s.page.data.challenge_question_count, 10);
  assert.deepEqual(s.navigations, ["/pages/help/help"]);
});

// Empty results must not be rendered until a successful response; failures remain retryable.
test("initial request uses an inline loading state, reports failure and retries into a true empty state", async () => {
  const s = setup();
  s.page.onLoad();
  assert.equal(s.page.data.ranking_loading, true);
  assert.equal(s.page.data.ranking_loaded, false);
  assert.equal(s.overlays, 0);
  s.requests[0].reject(new Error("offline"));
  await flush();
  assert.equal(s.page.data.ranking_loading, false);
  assert.equal(s.page.data.ranking_loaded, false);
  assert.ok(s.page.data.ranking_error);
  s.page.retryRanking();
  assert.equal(s.requests.length, 3);
  s.requests[2].resolve(success());
  await flush();
  assert.equal(s.page.data.ranking_loaded, true);
  assert.equal(s.page.data.ranking_error, "");
  assert.deepEqual(Array.from(s.page.data.current_rank_list), []);
  assert.ok(s.stopped > 0);
});

// Tab cache must carry personal ranking with public rows; a refresh failure must retain both.
test("switching tabs preserves each list and personal rank during background refresh and failure", async () => {
  const s = setup();
  s.page.onLoad();
  s.requests[0].resolve(success([person()], person(), 3));
  s.requests[1].resolve(success([person(5000)], person(5000), 8));
  await flush();
  s.page.changeTab({ currentTarget: { dataset: { t: "1" } } });
  assert.equal(s.page.data.my_rank_label, "8");
  assert.equal(s.page.data.current_rank_list[0].total_score, 5000);
  assert.equal(s.page.data.ranking_loading, true);
  assert.equal(s.page.data.ranking_loaded, true);
  s.requests[2].reject(new Error("offline"));
  await flush();
  assert.equal(s.page.data.current_rank_list[0].total_score, 5000);
  assert.equal(s.page.data.my_rank_label, "8");
  assert.ok(s.page.data.ranking_error);
  s.page.changeTab({ currentTarget: { dataset: { t: 0 } } });
  assert.equal(s.page.data.my_rank_label, "3");
  assert.equal(s.page.data.current_rank_list[0].total_score, 3200);
});

// A real rank 999 is valid: backend uses both count-derived ranks and a 999 fallback.
test("personal status distinguishes guests, no record, historical threshold and valid ranks including 999", async () => {
  const guest = setup({ uid: 0 });
  guest.page.onLoad();
  guest.requests[0].resolve(success([], person(-1), 999));
  await flush();
  assert.equal(guest.page.data.my_rank_state, "guest");
  assert.equal(guest.page.data.my_rank_label, "未登录");
  for (const [type, score, rank, state, label] of [
    [0, -1, 999, "empty", "暂无记录"],
    [1, 1999, 1, "unranked", "未上榜"],
    [1, 2000, 999, "ranked", "999"],
    [0, 0, 101, "ranked", "101"],
    [0, 3200, 999, "ranked", "999"],
  ]) {
    const s = setup();
    s.page.onLoad();
    s.requests[type].resolve(success([], person(score), rank));
    await flush();
    if (type) s.page.changeTab({ currentTarget: { dataset: { t: type } } });
    assert.equal(s.page.data.my_rank_state, state, `${type}/${score}/${rank}`);
    assert.equal(s.page.data.my_rank_label, label);
  }
});

// onLoad + onShow + repeated taps share pending requests, but account changes start fresh ownership.
test("deduplicates pending requests and ignores old account responses after switching users", async () => {
  const s = setup();
  s.page.onLoad();
  s.page.onShow();
  s.page.onPullDownRefresh();
  s.page.changeTab({ currentTarget: { dataset: { t: 0 } } });
  assert.equal(s.requests.length, 2);
  s.storage.set("uid", 8);
  s.storage.set("token", "token-8");
  s.page.onShow();
  assert.equal(s.requests.length, 3);
  assert.equal(s.page.data.mine, null);
  s.requests[0].resolve(success([person()], person(), 1));
  await flush();
  assert.equal(s.page.data.mine, null);
  assert.equal(s.page.data.ranking_loading, true);
  const next = { ...person(), uid: 8, nickname: "新账号" };
  s.requests[2].resolve(success([next], next, 6));
  await flush();
  assert.equal(s.page.data.mine.nickname, "新账号");
  assert.equal(s.page.data.my_rank_label, "6");
  s.storage.delete("uid");
  s.storage.delete("token");
  s.page.onShow();
  assert.equal(s.page.data.mine, null);
  assert.equal(s.page.data.my_rank_state, "guest");
});

// Async completions after unloading must never update the destroyed page.
test("unload drops late ranking results without modifying page data", async () => {
  const s = setup();
  s.page.onLoad();
  s.page.onUnload();
  const before = JSON.stringify(s.page.data);
  s.requests[0].resolve(success([person()], person(), 1));
  await flush();
  assert.equal(JSON.stringify(s.page.data), before);
});
