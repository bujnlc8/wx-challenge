import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import vm from "node:vm";
const file = new URL("../utils/question-poster-render.js", import.meta.url);
function api() {
  assert.ok(existsSync(file), "poster renderer must exist");
  const source = readFileSync(file, "utf8").replace(
    /export\s*\{[\s\S]*?\};?\s*$/,
    "",
  );
  const scope = vm.createContext({});
  vm.runInContext(
    source +
      "\nthis.api={normalizeText,normalizeQuestion,wrapText,layoutPoster,drawPoster,drawAppPoster:typeof drawAppPoster==='function'?drawAppPoster:undefined,runtimeEnvironment,validateShareCode,validateAppShareCode:typeof validateAppShareCode==='function'?validateAppShareCode:undefined,createPosterSession};",
    scope,
  );
  return scope.api;
}
const ctx = {
  font: "",
  measureText(text) {
    return { width: Array.from(text).length * 20 };
  },
};
test("normalization preserves rich text, line breaks and decoded entities without executable markup", () => {
  const { normalizeText } = api();
  assert.equal(
    normalizeText(
      "<p>第一行 &amp; &#x4e2d;</p><p>第二行<br>3 &lt; 4</p><script>ignored()</script>",
    ),
    "第一行 & 中\n第二行\n3 < 4",
  );
  assert.equal(
    normalizeText("hello\nworld &unknown;"),
    "hello\nworld &unknown;",
  );
});
test("question normalization preserves every option and media without answer fields", () => {
  const question = api().normalizeQuestion({
    id: 5,
    content: '图片题<img src="https://a.test/a.png">',
    question_image: "https://a.test/q.mp4?key=1",
    option_type: 1,
    options: ["https://a.test/a.png", "https://a.test/b.mp4"],
    answer: 2,
    analysis: "secret",
  });
  assert.equal(question.blocks[0].text, "图片题");
  assert.equal(question.blocks[1].type, "image");
  assert.equal(question.blocks[2].type, "video");
  assert.equal(question.options.length, 2);
  assert.equal(question.options[0].label, "A");
  assert.equal(question.options[1].blocks[0].type, "video");
  assert.equal(JSON.stringify(question).includes("secret"), false);
  assert.equal(Object.hasOwn(question, "answer"), false);
});
test("wrap retains all punctuation, Unicode and explicit newlines", () => {
  const lines = api().wrapText(ctx, "甲乙，😀\n最后。", 40);
  assert.deepEqual(Array.from(lines), ["甲乙", "，😀", "最后", "。"]);
  assert.equal(lines.join(""), "甲乙，😀最后。");
});
test("layout grows to include long questions and all options, or reports an explicit capacity error", () => {
  const { normalizeQuestion, layoutPoster } = api();
  const short = layoutPoster(
    ctx,
    normalizeQuestion({ id: 1, content: "短题", options: ["a", "b"] }),
    {},
  );
  const long = layoutPoster(
    ctx,
    normalizeQuestion({
      id: 1,
      content: "甲".repeat(700),
      options: ["尾".repeat(130), "b", "c", "最后一项"],
    }),
    {},
  );
  assert.ok(long.height > short.height);
  assert.equal(long.options.length, 4);
  assert.equal(long.options[3].blocks[0].lines.join(""), "最后一项");
  assert.ok(long.footerY > long.options[3].y + long.options[3].height);
  assert.throws(
    () =>
      layoutPoster(
        ctx,
        normalizeQuestion({ id: 1, content: "甲".repeat(20000), options: [] }),
        {},
      ),
    /过长/,
  );
});
test("image layout keeps aspect ratio and video has an honest scan instruction", () => {
  const { normalizeQuestion, layoutPoster } = api();
  const question = normalizeQuestion({
    id: 1,
    content: "看图",
    question_image: "https://a/q.png",
    option_type: 1,
    options: ["https://a/v.mp4"],
  });
  const layout = layoutPoster(ctx, question, {
    "https://a/q.png": { width: 1200, height: 600 },
  });
  const image = layout.blocks.find((b) => b.type === "image");
  assert.equal(image.width / image.height, 2);
  assert.match(layout.options[0].blocks[0].lines.join(""), /扫码.*视频/);
});
test("runtime version allowlist and share-code identity reject unavailable or wrong codes", () => {
  const { runtimeEnvironment, validateShareCode } = api();
  assert.equal(
    runtimeEnvironment({
      getAccountInfoSync: () => ({ miniProgram: { envVersion: "trial" } }),
    }),
    "trial",
  );
  assert.throws(
    () =>
      runtimeEnvironment({
        getAccountInfoSync: () => ({ miniProgram: { envVersion: "unknown" } }),
      }),
    /版本/,
  );
  const code = {
    question_id: 9,
    env_version: "trial",
    mime_type: "image/png",
    image_base64: "iVBORw0KGgoAAA==",
  };
  assert.doesNotThrow(() => validateShareCode(code, 9, "trial"));
  assert.throws(() => validateShareCode(code, 10, "trial"), /小程序码/);
  assert.throws(
    () => validateShareCode({ ...code, env_version: "release" }, 9, "trial"),
    /小程序码/,
  );
  assert.throws(
    () => validateShareCode({ ...code, image_base64: "" }, 9, "trial"),
    /小程序码/,
  );
});
test("session guards invalidate close, newer question and account changes", () => {
  let identity = "user-a:token";
  const session = api().createPosterSession(() => identity);
  const first = session.begin();
  assert.equal(first(), true);
  const second = session.begin();
  assert.equal(first(), false);
  assert.equal(second(), true);
  session.cancel();
  assert.equal(second(), false);
  const third = session.begin();
  identity = "user-b:token";
  assert.equal(third(), false);
});

function componentHarness() {
  let definition;
  let uid = "user-a";
  const requests = [];
  const methods = api();
  const source = readFileSync(
    new URL("../component/question-poster/question-poster.js", import.meta.url),
    "utf8",
  ).replace(/import\s*\{[\s\S]*?\}\s*from\s*["'][^"']+["'];?/g, "");
  const platform = {
    getStorageSync(key) {
      return key === "uid" ? uid : "token";
    },
    getAccountInfoSync() {
      return { miniProgram: { envVersion: "release" } };
    },
  };
  const toasts = [];
  const modalSource = readFileSync(
    new URL("../utils/modal-lock.js", import.meta.url),
    "utf8",
  ).replace(/export\s*\{[\s\S]*?\};?/g, "");
  const ownerPage = {
    data: {},
    setData(patch) {
      Object.assign(this.data, patch);
    },
  };
  vm.runInNewContext(modalSource + "\n" + source, {
    getCurrentPages() {
      return [ownerPage];
    },
    ...methods,
    wx: platform,
    httpPOST(path, body) {
      return new Promise((resolve) => requests.push({ path, body, resolve }));
    },
    showToast(...args) {
      toasts.push(args);
    },
    setTimeout,
    clearTimeout,
    Component(value) {
      definition = value;
    },
  });
  const instance = {
    triggerEvent() {},
    data: { ...definition.data },
    setData(patch) {
      Object.assign(this.data, patch);
    },
    ...definition.methods,
  };
  definition.lifetimes.attached.call(instance);
  return {
    instance,
    requests,
    definition,
    platform,
    toasts,
    changeAccount() {
      uid = "user-b";
    },
  };
}
test("closing a pending component prevents late responses from changing its state", async () => {
  assert.ok(
    existsSync(
      new URL(
        "../component/question-poster/question-poster.js",
        import.meta.url,
      ),
    ),
    "poster component must exist",
  );
  const { instance, requests } = componentHarness();
  const task = instance.open({ id: 4, content: "题目", options: ["a"] });
  assert.equal(requests[0].path, "api/question/share-code");
  assert.equal(requests[0].body.question_id, 4);
  assert.equal(instance.data.loading, true);
  instance.close();
  requests[0].resolve({ data: { code: 10001, message: "late error" } });
  await task;
  assert.equal(instance.data.visible, false);
  assert.equal(instance.data.error, "");
  assert.equal(instance.data.imagepath, "");
});
test("older request cannot overwrite a reopened question and account changes dismiss pending UI", async () => {
  const { instance, requests, changeAccount } = componentHarness();
  const first = instance.open({ id: 4, content: "first", options: ["a"] });
  const second = instance.open({ id: 5, content: "second", options: ["b"] });
  requests[0].resolve({ data: { code: 10001, message: "old error" } });
  await first;
  assert.equal(instance.data.error, "");
  assert.equal(instance.data.loading, true);
  changeAccount();
  requests[1].resolve({ data: { code: 10001, message: "wrong account" } });
  await second;
  assert.equal(instance.data.visible, false);
  assert.equal(instance.data.imagepath, "");
});

test("HTML media extraction preserves text between an image and a later video", () => {
  const question = api().normalizeQuestion({
    id: 1,
    content:
      '开始<img src="https://a/q.png">中间文字<video src="https://a/q.mp4"></video>结束',
    options: [],
  });
  assert.equal(
    question.blocks
      .filter((b) => b.type === "text")
      .map((b) => b.text)
      .join(""),
    "开始中间文字结束",
  );
  assert.equal(question.blocks.filter((b) => b.type === "image").length, 1);
  assert.equal(question.blocks.filter((b) => b.type === "video").length, 1);
  assert.equal(api().normalizeText("3 < 4 且 5 > 2"), "3 < 4 且 5 > 2");
});

function installCanvas(harness, exportHandler) {
  const draws = [];
  const removed = [];
  const writes = [];
  const text = [];
  const context = {
    measureText(text) {
      return { width: Array.from(text).length * 20 };
    },
    fillRect() {},
    beginPath() {},
    moveTo() {},
    arcTo() {},
    save() {},
    restore() {},
    clip() {},
    closePath() {},
    fill() {},
    fillText(value) {
      text.push(value);
    },
    drawImage(image) {
      draws.push(image.src);
    },
  };
  const canvas = {
    getContext() {
      return context;
    },
    createImage() {
      return {
        width: 300,
        height: 300,
        set src(value) {
          this._src = value;
          queueMicrotask(() => this.onload());
        },
        get src() {
          return this._src;
        },
      };
    },
  };
  harness.instance.createSelectorQuery = () => ({
    select() {
      return this;
    },
    fields() {
      return this;
    },
    exec(callback) {
      callback([{ node: canvas }]);
    },
  });
  Object.assign(harness.platform, {
    env: { USER_DATA_PATH: "/tmp/poster-test" },
    getFileSystemManager() {
      return {
        writeFile(options) {
          assert.equal(options.encoding, "base64");
          writes.push({
            filePath: options.filePath,
            data: options.data,
            encoding: options.encoding,
          });
          options.success();
        },
        unlink({ filePath }) {
          removed.push(filePath);
        },
      };
    },
    canvasToTempFilePath(options) {
      assert.equal(options.fileType, "png");
      assert.equal(options.destWidth, 900);
      assert.ok(options.destHeight >= 1200);
      if (exportHandler) exportHandler(options);
      else options.success({ tempFilePath: "/tmp/generated-poster.png" });
    },
  });
  return { draws, removed, writes, text };
}
function validCode(id) {
  return {
    data: {
      code: 10000,
      data: {
        question_id: id,
        env_version: "release",
        mime_type: "image/png",
        image_base64: "iVBORw0KGgoAAA==",
      },
    },
  };
}
test("successful generation draws genuine server-code image and exports a complete poster", async () => {
  const harness = componentHarness();
  const { draws, removed } = installCanvas(harness);
  const task = harness.instance.open({
    id: 6,
    content: "完整题干",
    question_image: "https://a/question.png",
    options: ["甲", "乙"],
  });
  harness.requests[0].resolve(validCode(6));
  await task;
  assert.equal(harness.instance.data.loading, false);
  assert.equal(harness.instance.data.error, "");
  assert.equal(harness.instance.data.imagepath, "/tmp/generated-poster.png");
  assert.ok(draws.includes("https://a/question.png"));
  assert.ok(draws.includes("data:image/png;base64,iVBORw0KGgoAAA=="));
  assert.ok(draws.includes("/images/ui-about-logo.png"));
  assert.equal(removed.length, 0);
});
test("album denial explains permission and delayed save callbacks cannot affect a closed modal", async () => {
  const harness = componentHarness();
  installCanvas(harness);
  const task = harness.instance.open({
    id: 6,
    content: "题干",
    options: ["甲"],
  });
  harness.requests[0].resolve(validCode(6));
  await task;
  let save;
  harness.platform.saveImageToPhotosAlbum = (options) => {
    save = options;
  };
  harness.instance.save();
  save.fail({ errMsg: "saveImageToPhotosAlbum:fail auth deny" });
  assert.equal(harness.instance.data.albumDenied, true);
  assert.match(harness.instance.data.saveMessage, /相册权限/);
  harness.platform.openSetting = (options) =>
    options.success({ authSetting: { "scope.writePhotosAlbum": true } });
  harness.instance.openAlbumSettings();
  assert.equal(harness.instance.data.albumDenied, false);
  harness.instance.save();
  harness.instance.close();
  save.success();
  assert.equal(harness.toasts.length, 0);
  assert.equal(harness.instance.data.visible, false);
});
test("closing during export discards the old file and leaves a reopened poster intact", async () => {
  const harness = componentHarness();
  const exports = [];
  const { removed } = installCanvas(harness, (options) =>
    exports.push(options),
  );
  const first = harness.instance.open({
    id: 6,
    content: "first",
    options: ["甲"],
  });
  harness.requests[0].resolve(validCode(6));
  for (let i = 0; i < 20 && !exports.length; i++) await Promise.resolve();
  assert.equal(exports.length, 1);
  harness.instance.close();
  const second = harness.instance.open({
    id: 7,
    content: "second",
    options: ["乙"],
  });
  harness.requests[1].resolve(validCode(7));
  exports[0].success({ tempFilePath: "/tmp/stale-poster.png" });
  await first;
  for (let i = 0; i < 20 && exports.length < 2; i++) await Promise.resolve();
  assert.equal(exports.length, 2);
  exports[1].success({ tempFilePath: "/tmp/current-poster.png" });
  await second;
  assert.equal(harness.instance.data.imagepath, "/tmp/current-poster.png");
  assert.ok(removed.includes("/tmp/stale-poster.png"));
});
test("poster emits one close event with a reason so completed challenges can resume safely", () => {
  const h = componentHarness();
  const events = [];
  h.instance.triggerEvent = (name, detail) => events.push({ name, detail });
  h.instance.data.visible = true;
  h.instance.close();
  h.instance.close();
  assert.equal(events.length, 1);
  assert.equal(events[0].name, "close");
  assert.equal(events[0].detail.reason, "user");
  h.instance.data.visible = true;
  h.definition.pageLifetimes.hide.call(h.instance);
  assert.equal(events[1].detail.reason, "page-hide");
});

test("share code accepts matching JPEG and rejects MIME mismatches, invalid payloads and wrong identity", () => {
  const { validateShareCode } = api();
  const jpeg = {
    question_id: 9,
    env_version: "trial",
    mime_type: "image/jpeg",
    image_base64: "/9j/4AAQSkZJRg==",
  };
  assert.doesNotThrow(() => validateShareCode(jpeg, 9, "trial"));
  for (const invalid of [
    { ...jpeg, mime_type: "image/png" },
    { ...jpeg, image_base64: "iVBORw0KGgoAAA==" },
    { ...jpeg, mime_type: "image/gif" },
    { ...jpeg, image_base64: "eyJlcnJjb2RlIjo0MDAxM30=" },
    { ...jpeg, image_base64: "/9j/invalid_" },
    { ...jpeg, image_base64: "/9j/invalid\n" },
    { ...jpeg, image_base64: "/9j/" + "A".repeat(8 * 1024 * 1024) },
    { ...jpeg, question_id: 10 },
    { ...jpeg, env_version: "release" },
  ]) {
    assert.throws(() => validateShareCode(invalid, 9, "trial"), /小程序码/);
  }
});

test("JPEG server code is decoded from its original in-memory payload, drawn and exported", async () => {
  const harness = componentHarness();
  const { draws, removed, writes } = installCanvas(harness);
  const response = validCode(6);
  response.data.data.mime_type = "image/jpeg";
  response.data.data.image_base64 = "/9j/4AAQSkZJRg==";
  const task = harness.instance.open({
    id: 6,
    content: "题干",
    options: ["甲", "乙"],
  });
  harness.requests[0].resolve(response);
  await task;
  assert.equal(harness.instance.data.error, "");
  assert.equal(harness.instance.data.imagepath, "/tmp/generated-poster.png");
  assert.ok(
    draws.includes("data:image/jpeg;base64," + response.data.data.image_base64),
  );
  assert.equal(writes.length, 0);
  assert.equal(removed.length, 0);
});

function appCode() {
  return {
    data: {
      code: 10000,
      data: {
        page: "pages/index/index",
        env_version: "release",
        mime_type: "image/png",
        image_base64: "iVBORw0KGgoAAA==",
      },
    },
  };
}
test("app share code requires the exact home page, runtime and matching image signature", () => {
  const { validateAppShareCode } = api();
  const code = appCode().data.data;
  assert.equal(
    typeof validateAppShareCode,
    "function",
    "app share-code validation must exist",
  );
  assert.doesNotThrow(() => validateAppShareCode(code, "release"));
  assert.doesNotThrow(() =>
    validateAppShareCode(
      { ...code, mime_type: "image/jpeg", image_base64: "/9j/4AAQSkZJRg==" },
      "release",
    ),
  );
  for (const invalid of [
    { ...code, page: "pages/answer/answer" },
    { ...code, env_version: "trial" },
    { ...code, image_base64: "eyJlcnJjb2RlIjo0MDAxM30=" },
    { ...code, mime_type: "image/jpeg" },
  ])
    assert.throws(() => validateAppShareCode(invalid, "release"), /小程序码/);
});
test("logged-out app share requests only the public home code and exports an app poster", async () => {
  const harness = componentHarness();
  harness.platform.getStorageSync = () => "";
  const { draws, text } = installCanvas(harness);
  assert.equal(harness.requests.length, 0);
  assert.equal(
    typeof harness.instance.openApp,
    "function",
    "app poster entry point must exist",
  );
  const task = harness.instance.openApp();
  assert.equal(harness.instance.data.appMode, true);
  assert.equal(harness.requests[0].path, "api/common/share-code");
  assert.deepEqual(Object.keys(harness.requests[0].body), ["env_version"]);
  harness.requests[0].resolve(appCode());
  await task;
  assert.equal(harness.instance.data.imagepath, "/tmp/generated-poster.png");
  assert.equal(harness.instance.data.error, "");
  assert.ok(text.includes("百科知识挑战"));
  assert.ok(text.includes("扫码开启知识挑战"));
  assert.ok(
    text.includes("挑战") && text.includes("练习") && text.includes("错题"),
  );
  assert.ok(!text.includes("这道题，你会吗？"));
  assert.ok(draws.includes("/images/ui-about-logo.png"));
});
test("app share retries its public endpoint and never overwrites a newer question or closed modal", async () => {
  const harness = componentHarness();
  installCanvas(harness);
  assert.equal(
    typeof harness.instance.openApp,
    "function",
    "app poster entry point must exist",
  );
  const first = harness.instance.openApp();
  harness.requests[0].resolve({ data: { code: 10001, message: "稍后重试" } });
  await first;
  assert.equal(harness.instance.data.error, "稍后重试");
  const retry = harness.instance.retry();
  assert.equal(harness.requests[1].path, "api/common/share-code");
  const question = harness.instance.open({
    id: 4,
    content: "题目",
    options: ["甲"],
  });
  harness.requests[1].resolve(appCode());
  await retry;
  assert.equal(harness.instance.data.appMode, false);
  assert.equal(harness.instance.data.imagepath, "");
  harness.requests[2].resolve(validCode(4));
  await question;
  assert.equal(harness.instance.data.imagepath, "/tmp/generated-poster.png");
  const closed = harness.instance.openApp();
  harness.instance.close();
  harness.requests[3].resolve(appCode());
  await closed;
  assert.equal(harness.instance.data.visible, false);
  assert.equal(harness.instance.data.imagepath, "");
});

for (const [mime, base64] of [
  ["image/png", "iVBORw0KGgoAAA=="],
  ["image/jpeg", "/9j/4AAQSkZJRg=="],
]) {
  test(`poster renders ${mime} even when persistent file storage refuses every write`, async () => {
    const harness = componentHarness();
    const { draws } = installCanvas(harness);
    harness.platform.getFileSystemManager = () => ({
      writeFile(options) {
        options.fail({
          errMsg:
            "writeFile:fail the maximum size of the file storage limit is exceeded",
        });
      },
      unlink() {},
    });
    const task = harness.instance.open({
      id: 6,
      content: "存储受限题目",
      options: ["甲", "乙"],
    });
    const response = validCode(6);
    response.data.data.mime_type = mime;
    response.data.data.image_base64 = base64;
    harness.requests[0].resolve(response);
    await task;
    assert.equal(harness.instance.data.error, "");
    assert.equal(harness.instance.data.imagepath, "/tmp/generated-poster.png");
    assert.ok(draws.includes(`data:${mime};base64,${base64}`));
  });
}
