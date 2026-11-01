import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

function renderer() {
  const source = readFileSync(
    new URL("../utils/question-poster-render.js", import.meta.url),
    "utf8",
  ).replace(/export\s*\{[\s\S]*?\};?\s*$/, "");
  const scope = vm.createContext({});
  vm.runInContext(
    source + "\nthis.api={normalizeQuestion,layoutPoster,drawPoster};",
    scope,
  );
  return scope.api;
}
function context() {
  const draws = [],
    texts = [];
  return {
    draws,
    texts,
    font: "32px sans-serif",
    measureText(text) {
      const size = Number(this.font.match(/(\d+)px/)[1]);
      return {
        width: Array.from(text).reduce(
          (sum, char) => sum + size * (/[\x00-\x7f]/.test(char) ? 0.55 : 1),
          0,
        ),
      };
    },
    fillRect() {},
    beginPath() {},
    moveTo() {},
    arcTo() {},
    closePath() {},
    fill() {},
    save() {},
    restore() {},
    clip() {},
    drawImage(...args) {
      draws.push(args);
    },
    fillText(text, x, y) {
      texts.push({ text, x, y, font: this.font });
    },
  };
}

for (const count of [3, 4]) {
  test(`${count} short text options use a 3:4 canvas in left-to-right reading order`, () => {
    const api = renderer(),
      ctx = context();
    const layout = api.layoutPoster(
      ctx,
      api.normalizeQuestion({
        id: 1,
        content: "太阳系中，体积最大的行星是哪一颗？",
        options: ["地球", "木星", "土星", "海王星"].slice(0, count),
      }),
      {},
    );
    assert.equal(layout.width, 900);
    assert.equal(layout.height, 1200);
    assert.equal(layout.options[0].y, layout.options[1].y);
    assert.ok(layout.options[0].x < layout.options[1].x);
    assert.ok(layout.options[2].y > layout.options[1].y);
    assert.equal(layout.options[0].x, layout.options[2].x);
    assert.ok(
      layout.options.every((option) =>
        option.blocks.every((block) => block.fontSize >= 30),
      ),
    );
  });
}

test("one 360px question image and four short options still fit 3:4 without cropping", () => {
  const api = renderer(),
    ctx = context();
  const src = "https://example.test/question.png";
  const images = { [src]: { width: 1600, height: 800 } };
  const layout = api.layoutPoster(
    ctx,
    api.normalizeQuestion({
      id: 1,
      content: "下图属于哪一类？",
      question_image: src,
      options: ["自然", "历史", "科技", "地理"],
    }),
    images,
  );
  assert.equal(layout.height, 1200);
  const block = layout.blocks.find((block) => block.type === "image");
  assert.equal(block.frame.height, 360);
  assert.equal(block.width / block.height, 2);
  assert.ok(
    block.width <= block.frame.width && block.height <= block.frame.height,
  );
  assert.ok(layout.contentBottom + 16 <= layout.footerY);
});

test("long options keep a full-width layout and all question and option characters", () => {
  const api = renderer(),
    ctx = context();
  const content = "完整题干，".repeat(90);
  const option = "这是不能删减的详细选项。".repeat(25);
  const layout = api.layoutPoster(
    ctx,
    api.normalizeQuestion({
      id: 1,
      content,
      options: [option, "另一个选项", "第三项", "最后一项"],
    }),
    {},
  );
  assert.ok(layout.height > 1200);
  assert.equal(
    layout.blocks.map((block) => block.lines.join("")).join(""),
    content,
  );
  assert.equal(
    layout.options[0].blocks.map((block) => block.lines.join("")).join(""),
    option,
  );
  assert.ok(layout.options[1].y > layout.options[0].y);
  assert.ok(layout.options.every((option) => option.width === 784));
  assert.ok(
    layout.footerY > layout.options.at(-1).y + layout.options.at(-1).height,
  );
});

test("option images keep their aspect ratio and video remains an explicit scan prompt", () => {
  const api = renderer(),
    ctx = context();
  const src = "https://example.test/option.png";
  const layout = api.layoutPoster(
    ctx,
    api.normalizeQuestion({
      id: 1,
      content: "请选择",
      option_type: 1,
      options: [src, "https://example.test/video.mp4"],
    }),
    { [src]: { width: 300, height: 900 } },
  );
  const image = layout.options[0].blocks[0];
  assert.equal(image.width / image.height, 1 / 3);
  assert.equal(image.frame, undefined);
  assert.ok(layout.options[1].y > layout.options[0].y);
  const video = layout.options[1].blocks[0];
  assert.match(video.lines.join(""), /扫码.*完整视频/);
  assert.ok(video.fontSize >= 30);
});

test("drawing contains every option, actual 300px code and environment label inside the canvas", () => {
  const api = renderer(),
    ctx = context();
  const question = api.normalizeQuestion({
    id: 1,
    content: "你会选哪个？",
    options: ["甲", "乙", "丙", "丁"],
  });
  const layout = api.layoutPoster(ctx, question, {});
  const code = { actualCode: true };
  api.drawPoster(ctx, layout, question, {}, code, null, "trial");
  const codeDraw = ctx.draws.find((args) => args[0] === code);
  assert.equal(codeDraw[3], 300);
  assert.equal(codeDraw[4], 300);
  assert.ok(codeDraw[1] >= 0 && codeDraw[2] >= layout.contentBottom);
  assert.ok(codeDraw[1] + codeDraw[3] <= layout.width);
  assert.ok(codeDraw[2] + codeDraw[4] <= layout.height);
  assert.deepEqual(
    ctx.texts
      .filter((item) => /^[A-D]\.$/.test(item.text))
      .map((item) => item.text),
    ["A.", "B.", "C.", "D."],
  );
  assert.ok(ctx.texts.some((item) => /体验版/.test(item.text)));
  assert.ok(
    ctx.texts.every(
      (item) =>
        item.y >= 0 &&
        item.y + Number(item.font.match(/(\d+)px/)[1]) <= layout.height,
    ),
  );
  for (const option of layout.options) {
    const text = ctx.texts.find((item) => item.text === option.label + ".");
    assert.ok(text.x >= option.x && text.x < option.x + option.width);
  }
});
