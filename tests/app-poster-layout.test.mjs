import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

function render(env) {
  const source = readFileSync(
    new URL("../design-demos/app-poster-render.js", import.meta.url),
    "utf8",
  ).replace(/export\s*\{[\s\S]*?\};?\s*$/, "");
  const scope = vm.createContext({});
  vm.runInContext(source + "\nthis.draw = drawAppPoster;", scope);
  const images = [];
  const text = [];
  const fills = [];
  const stack = [];
  let clipDepth = 0;
  const ctx = {
    beginPath() {},
    moveTo() {},
    arcTo() {},
    closePath() {},
    fill() {},
    save() {
      stack.push(clipDepth);
    },
    restore() {
      clipDepth = stack.pop();
    },
    clip() {
      clipDepth++;
    },
    fillRect(...bounds) {
      fills.push({ bounds, color: this.fillStyle });
    },
    fillText(value) {
      text.push(value);
    },
    drawImage(image, ...bounds) {
      images.push({ image, bounds, clipDepth });
    },
  };
  const layout = { width: 900, height: 1200 };
  const code = {};
  const logo = {};
  assert.equal(scope.draw(ctx, layout, code, logo, env), layout);
  return { images, text, fills, code, logo, clipDepth, stack };
}

test("app poster keeps the 3:4 canvas and full unclipped code with a rounded logo", () => {
  const result = render("release");
  assert.deepEqual(result.fills[0].bounds, [0, 0, 900, 1200]);
  assert.equal(900 / 1200, 3 / 4);
  const code = result.images.find((draw) => draw.image === result.code);
  const logo = result.images.find((draw) => draw.image === result.logo);
  assert.equal(result.images.length, 2);
  assert.equal(
    code.bounds.length,
    4,
    "use the full image, without source crops",
  );
  assert.equal(
    code.clipDepth,
    0,
    "the code must not inherit the brand clipping",
  );
  const [x, y, width, height] = code.bounds;
  assert.equal(width, height);
  assert.equal(width, 344, "preserve the provided code at its original size");
  assert.ok(x >= 32 && y >= 32);
  assert.ok(x + width <= 900 - 32 && y + height <= 1200 - 32);
  assert.equal(logo.clipDepth, 1, "retain the real logo's rounded clipping");
  assert.equal(logo.bounds.length, 4, "do not crop the logo's information");
  assert.equal(result.clipDepth, 0);
  assert.equal(result.stack.length, 0);
  for (const fill of result.fills.slice(1)) {
    const [fx, fy, fw, fh] = fill.bounds;
    assert.ok(
      fx + fw <= x || fx >= x + width || fy + fh <= y || fy >= y + height,
      "no decoration may paint over the real code",
    );
  }
});

test("the fixed app poster uses the exact slogan and the same provided code for all runtimes", () => {
  for (const env of ["release", "trial", "develop"]) {
    const { text } = render(env);
    assert.ok(text.join("").includes("知识无界挑战不停"));
    assert.ok(text.includes("百科知识挑战"));
    assert.ok(text.includes("扫码开启知识挑战"));
    for (const label of ["挑战", "练习", "错题"])
      assert.ok(text.includes(label));
    const restrictions = text.filter((value) => value.includes("仅"));
    assert.deepEqual(restrictions, []);
  }
});
