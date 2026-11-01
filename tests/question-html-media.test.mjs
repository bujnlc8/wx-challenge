import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const source = readFileSync(new URL("../utils/util.wxs", import.meta.url), "utf8");
const scope = vm.createContext({ module: { exports: {} }, getRegExp: (pattern, flags) => new RegExp(pattern, flags) });
vm.runInContext(source, scope);
const format = value => scope.module.exports.questionHtml(value);

test("question HTML without image elements is preserved byte for byte", () => {
  for (const html of ["", "普通题干", '<p><strong>保留题意</strong><br>第二行</p><table><tr><td>甲 &amp; 乙</td></tr></table>', '<p title="<img src=not-an-image>">保留属性</p>', '<!-- <img src="comment.png"> --><p>说明</p>', '<script>"<img src=script.png>"</script><style>/* <img src=style.png> */</style>', '<video src="movie.mp4"></video>']) {
    assert.equal(format(html), html);
  }
});

test("each real question image gets its own fixed frame while surrounding HTML stays intact", () => {
  const html = '<p><b>看图</b><img src="first.png" alt="大于 > 小于"/>与<img src=second.png alt=乙></p><table><tr><td>题意</td></tr></table>';
  const output = format(html);
  assert.equal((output.match(/<span style="display:inline-block;width:100%;height:200px;/g) || []).length, 2);
  assert.match(output, /^<p><b>看图<\/b>/);
  assert.match(output, /alt="大于 > 小于"/);
  assert.match(output, /src=second.png alt=乙/);
  assert.ok(output.endsWith('</p><table><tr><td>题意</td></tr></table>'));
  assert.equal((output.match(/width:auto!important;height:auto!important;max-width:100%!important;max-height:200px!important/g) || []).length, 2);
});

test("quoted style and size attributes cannot stretch or crop an image", () => {
  const html = `<p>前<img SRC='portrait.png' alt='A > B' WIDTH=900 height="2000" style='width:900px!important;height:2000px!important;object-fit:cover;background:url("x>y")' />后</p>`;
  const output = format(html);
  assert.match(output, /SRC='portrait.png' alt='A > B'/);
  assert.match(output, /background:url\(&quot;x>y&quot;\)/);
  assert.match(output, /object-fit:contain!important/);
  assert.match(output, /width:auto!important;height:auto!important/);
  assert.doesNotMatch(output, /\sWIDTH=|\sheight="2000"/);
  assert.ok(output.endsWith('</span>后</p>'));
});

test("tag boundaries, comments and raw text cannot create accidental image frames", () => {
  const html = '<!-- <img src="comment.png"> --><image src="native.png"></image><script>"<img src=script.png>"</script><textarea><img src=literal.png></textarea><IMG\nSRC="real.png">';
  const output = format(html);
  assert.ok(output.startsWith(html.slice(0, html.indexOf('<IMG'))));
  assert.equal((output.match(/height:200px;line-height:200px/g) || []).length, 1);
  assert.match(output, /SRC="real.png"/);
  assert.match(format('<img\fsrc="form-feed.png">'), /^<span style=/);
});

test("unfinished markup remains readable and unchanged instead of losing the rest of a question", () => {
  const html = '<p>题干<img src="unfinished > text';
  assert.equal(format(html), html);
});

test("comparison signs in question text do not hide a later image", () => {
  const output = format('若 1 < 2，则比较<img src="compare.png">');
  assert.ok(output.startsWith('若 1 < 2，则比较<span style='));
});

test("standalone image tags select rich rendering without mistaking comparison text for HTML", () => {
  assert.equal(scope.module.exports.isRichQuestion('<img src="single.png">'), true);
  assert.equal(scope.module.exports.isRichQuestion('<IMG SRC="upper.png">'), true);
  assert.equal(scope.module.exports.isRichQuestion('<p>题干</p>'), true);
  assert.equal(scope.module.exports.isRichQuestion('若 1 < 2，则继续比较'), false);
  assert.equal(scope.module.exports.isRichQuestion('普通题目'), false);
});
