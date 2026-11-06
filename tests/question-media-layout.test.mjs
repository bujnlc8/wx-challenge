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
    source + "\nthis.api = {normalizeQuestion, layoutPoster, drawPoster};",
    scope,
  );
  return scope.api;
}
function canvas() {
  const images = [],
    texts = [];
  return {
    images,
    texts,
    measureText: (text) => ({ width: Array.from(text).length * 20 }),
    beginPath() {},
    moveTo() {},
    arcTo() {},
    closePath() {},
    fill() {},
    save() {},
    restore() {},
    clip() {},
    fillRect() {},
    fillText(text, x, y) {
      texts.push({ text, x, y });
    },
    drawImage(image, ...bounds) {
      images.push({ image, bounds });
    },
  };
}
for (const [label, width, height] of [
  ["landscape", 1200, 600],
  ["portrait", 600, 1800],
  ["large", 8000, 6000],
  ["small", 80, 40],
]) {
  test(`stem ${label} image reserves a fixed frame and draws all image pixels without stretching`, () => {
    const api = renderer(),
      ctx = canvas();
    const src = "https://example.test/stem.png",
      image = { width, height };
    const question = api.normalizeQuestion({
      id: 42,
      content: `<img src="${src}"><p>图后题干</p>`,
      options: ["第一项", "最后一项"],
    });
    const layout = api.layoutPoster(ctx, question, { [src]: image });
    const frame = layout.blocks[0].frame;
    assert.equal(frame.height, 360);
    assert.equal(
      layout.blocks[1].y,
      frame.y + frame.height + 12,
      "next text follows the full 360px media region and compact gap",
    );
    api.drawPoster(
      ctx,
      layout,
      question,
      { [src]: image },
      {},
      null,
      "release",
    );
    const draw = ctx.images.find((item) => item.image === image);
    assert.equal(
      draw.bounds.length,
      4,
      "draw complete source instead of source-cropping",
    );
    const [x, y, w, h] = draw.bounds;
    assert.ok(Math.abs(w / h - width / height) < 0.000001);
    assert.ok(
      x >= frame.x &&
        x + w <= frame.x + frame.width &&
        y >= frame.y &&
        y + h <= frame.y + frame.height,
    );
    assert.equal(x + w / 2, 450);
    assert.equal(y + h / 2, frame.y + frame.height / 2);
    assert.equal(layout.options[1].blocks[0].lines.join(""), "最后一项");
  });
}
test("image options retain their original readable proportions and complete source", () => {
  const api = renderer(),
    ctx = canvas();
  const src = "https://example.test/option.png",
    image = { width: 600, height: 1200 };
  const question = api.normalizeQuestion({
    id: 42,
    content: "选择正确的图",
    option_type: 1,
    options: [src, src],
  });
  const layout = api.layoutPoster(ctx, question, { [src]: image });
  api.drawPoster(ctx, layout, question, { [src]: image }, {}, null, "release");
  const draws = ctx.images.filter((item) => item.image === image);
  assert.equal(draws.length, 2);
  for (const draw of draws) {
    assert.equal(draw.bounds.length, 4);
    assert.equal(draw.bounds[2], 658);
    assert.equal(draw.bounds[3], 1316);
  }
  assert.ok(layout.footerY > layout.options[1].y + layout.options[1].height);
});
test("video poster renders a play marker and truthful scan instruction without loading video pixels", () => {
  const api = renderer(),
    ctx = canvas(),
    code = {};
  const question = api.normalizeQuestion({
    id: 42,
    content: "观看视频后作答",
    question_image: "https://example.test/stem.mp4?token=public",
    options: ["甲", "乙"],
  });
  assert.equal(question.id, 42);
  const layout = api.layoutPoster(ctx, question, {});
  api.drawPoster(ctx, layout, question, {}, code, null, "release");
  assert.ok(
    ctx.texts.some((item) => /[▶▷]/.test(item.text)),
    "static poster has a visible play marker",
  );
  assert.match(ctx.texts.map((item) => item.text).join(""), /扫码.*视频/);
  assert.equal(
    ctx.images.length,
    1,
    "only the genuine share code is drawn, no invented video thumbnail",
  );
  assert.equal(ctx.images[0].image, code);
  assert.deepEqual(ctx.images[0].bounds, [534, layout.footerY + 18, 300, 300]);
});
