const POSTER_WIDTH = 900;
const MAX_POSTER_HEIGHT = 8192;
const ENTITIES = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  times: "×",
  divide: "÷",
  plusmn: "±",
  minus: "−",
  deg: "°",
  middot: "·",
  le: "≤",
  ge: "≥",
  ne: "≠",
  infin: "∞",
  pi: "π",
  alpha: "α",
  beta: "β",
  gamma: "γ",
  delta: "δ",
  theta: "θ",
  sigma: "σ",
  mu: "μ",
  sum: "∑",
  radic: "√",
  ldquo: "“",
  rdquo: "”",
  lsquo: "‘",
  rsquo: "’",
  ndash: "–",
  mdash: "—",
  hellip: "…",
};
function decodeEntities(value) {
  return value.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, entity) => {
    if (entity[0] !== "#")
      return ENTITIES[entity] === undefined ? whole : ENTITIES[entity];
    const point =
      entity[1].toLowerCase() === "x"
        ? parseInt(entity.slice(2), 16)
        : parseInt(entity.slice(1), 10);
    return point > 0 &&
      point <= 0x10ffff &&
      !(point >= 0xd800 && point <= 0xdfff)
      ? String.fromCodePoint(point)
      : whole;
  });
}
function normalizeText(value) {
  return decodeEntities(
    String(value == null ? "" : value)
      .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, "")
      .replace(/<!--[^]*?-->/g, "")
      .replace(/<br\b[^>]*\/?>/gi, "\n")
      .replace(/<\/(p|div|li|tr|h[1-6])\s*>/gi, "\n")
      .replace(/<\/?(?:td|th)\b[^>]*>/gi, " ")
      .replace(/<\/?[a-z][^>]*>/gi, ""),
  )
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t\u00a0]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
function mediaType(src) {
  return /\.(mp4|mov|webm|m3u8)(?:[?#]|$)/i.test(src) ? "video" : "image";
}
function mediaBlock(src) {
  src = decodeEntities(String(src || "").trim());
  if (!/^(https?:\/\/|wxfile:\/\/|\/)/i.test(src))
    throw Error("题目图片地址无效，暂时无法生成完整海报");
  return { type: mediaType(src), src };
}
function contentBlocks(value) {
  const source = String(value == null ? "" : value).replace(
    /<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>/gi,
    "",
  );
  const blocks = [];
  const media =
    /<(img|video)\b[^>]*\bsrc\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))[^>]*>/gi;
  let match;
  let position = 0;
  while ((match = media.exec(source))) {
    const text = normalizeText(source.slice(position, match.index));
    if (text) blocks.push({ type: "text", text });
    const block = mediaBlock(match[2] || match[3] || match[4]);
    if (match[1].toLowerCase() === "video") block.type = "video";
    blocks.push(block);
    position = media.lastIndex;
  }
  const text = normalizeText(source.slice(position));
  if (text) blocks.push({ type: "text", text });
  return blocks;
}
function normalizeQuestion(question) {
  const blocks = contentBlocks(question.content);
  if (question.question_image) blocks.push(mediaBlock(question.question_image));
  const options = Array.isArray(question.options)
    ? question.options
    : String(question.options || "").split("|");
  const normalized = options.map((option, index) => ({
    label: index < 26 ? String.fromCharCode(65 + index) : String(index + 1),
    blocks:
      Number(question.option_type) === 1 && option
        ? [mediaBlock(option)]
        : contentBlocks(option),
  }));
  if (!blocks.length) throw Error("题目内容为空，暂时无法生成海报");
  return { id: Number(question.id), blocks, options: normalized };
}
function wrapText(ctx, text, maxWidth) {
  const lines = [];
  for (const paragraph of String(text).split("\n")) {
    let line = "";
    for (const character of paragraph) {
      if (ctx.measureText(character).width > maxWidth)
        throw Error("海报文字尺寸异常，请重试");
      if (line && ctx.measureText(line + character).width > maxWidth) {
        lines.push(line);
        line = "";
      }
      line += character;
    }
    lines.push(line);
  }
  return lines;
}
function layoutPoster(ctx, question, images) {
  let y = 258;
  function layoutBlocks(blocks, x, width) {
    return blocks.map((block) => {
      const item = { ...block, x, y, width };
      if (block.type === "image") {
        const image = images[block.src];
        if (!image || !(image.width > 0 && image.height > 0))
          throw Error("题目图片未完整加载，请重试");
        const scale = Math.min(width / image.width, 2);
        item.width = image.width * scale;
        item.height = image.height * scale;
        item.x = x + (width - item.width) / 2;
      } else {
        ctx.font =
          block.type === "video" ? "28px sans-serif" : "32px sans-serif";
        item.lines = wrapText(
          ctx,
          block.type === "video"
            ? "本题含视频，扫码后查看完整视频"
            : block.text,
          width,
        );
        item.fontSize = block.type === "video" ? 28 : 32;
        item.lineHeight = block.type === "video" ? 43 : 50;
        item.height = item.lines.length * item.lineHeight;
      }
      y += item.height + 20;
      return item;
    });
  }
  const blocks = layoutBlocks(question.blocks, 72, 756);
  y += 12;
  const options = question.options.map((option) => {
    const top = y;
    y += 22;
    const blocks = layoutBlocks(option.blocks, 138, 658);
    y = Math.max(y, top + 70) + 2;
    const height = y - top;
    y += 16;
    return { label: option.label, y: top, height, blocks };
  });
  const contentBottom = y + 20;
  const height = Math.max(1200, contentBottom + 436);
  if (height > MAX_POSTER_HEIGHT)
    throw Error("题目内容过长，暂时无法生成完整海报，请选择其他题目");
  return {
    width: POSTER_WIDTH,
    height,
    blocks,
    options,
    contentBottom,
    footerY: height - 400,
  };
}
function roundedRect(ctx, x, y, width, height, radius, color) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + width, y, x + width, y + height, radius);
  ctx.arcTo(x + width, y + height, x, y + height, radius);
  ctx.arcTo(x, y + height, x, y, radius);
  ctx.arcTo(x, y, x + width, y, radius);
  ctx.closePath();
  ctx.fill();
}
function drawRoundedLogo(ctx, logo, x, y, size, radius) {
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + size, y, x + size, y + size, radius);
  ctx.arcTo(x + size, y + size, x, y + size, radius);
  ctx.arcTo(x, y + size, x, y, radius);
  ctx.arcTo(x, y, x + size, y, radius);
  ctx.closePath();
  ctx.clip();
  ctx.drawImage(logo, x, y, size, size);
  ctx.restore();
}
function drawPoster(ctx, layout, question, images, code, logo, env) {
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  ctx.fillStyle = "#edf3ff";
  ctx.fillRect(0, 0, layout.width, layout.height);
  if (logo) drawRoundedLogo(ctx, logo, 52, 40, 76, 18);
  ctx.fillStyle = "#2864eb";
  ctx.font = "600 39px sans-serif";
  ctx.fillText("百科知识挑战", logo ? 148 : 52, 54);
  ctx.fillStyle = "#202b40";
  ctx.font = "600 52px sans-serif";
  ctx.fillText("这道题，你会吗？", 52, 152);
  roundedRect(ctx, 36, 236, 828, layout.contentBottom - 236, 24, "#ffffff");
  function drawBlocks(blocks) {
    for (const block of blocks) {
      if (block.type === "image") {
        ctx.imageSmoothingEnabled = true;
        ctx.drawImage(
          images[block.src],
          block.x,
          block.y,
          block.width,
          block.height,
        );
      } else {
        ctx.fillStyle = block.type === "video" ? "#2864eb" : "#202b40";
        ctx.font = block.fontSize + "px sans-serif";
        block.lines.forEach((line, index) =>
          ctx.fillText(line, block.x, block.y + index * block.lineHeight),
        );
      }
    }
  }
  drawBlocks(layout.blocks);
  for (const option of layout.options) {
    roundedRect(ctx, 58, option.y, 784, option.height, 16, "#f5f7fb");
    ctx.fillStyle = "#2864eb";
    ctx.font = "600 30px sans-serif";
    ctx.fillText(option.label + ".", 82, option.y + 24);
    drawBlocks(option.blocks);
  }
  const footer = layout.footerY;
  roundedRect(ctx, 36, footer, 828, 364, 24, "#ffffff");
  ctx.fillStyle = "#202b40";
  ctx.font = "600 35px sans-serif";
  ctx.fillText("扫码直接作答", 72, footer + 92);
  ctx.fillStyle = "#68758a";
  ctx.font = "25px sans-serif";
  ctx.fillText("长按识别小程序码", 72, footer + 156);
  ctx.fillText("看看你能选对吗", 72, footer + 197);
  // Use the server's actual code pixels, in a dedicated white region.
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(code, 534, footer + 28, 300, 300);
  if (env !== "release") {
    ctx.fillStyle = "#916539";
    ctx.font = "21px sans-serif";
    ctx.fillText(
      env === "trial"
        ? "体验版 · 仅体验成员可识别"
        : "开发版 · 仅开发成员可识别",
      72,
      footer + 312,
    );
  }
  return layout;
}
function drawAppPoster(ctx, layout, code, logo, env) {
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  ctx.fillStyle = "#edf3ff";
  ctx.fillRect(0, 0, layout.width, layout.height);
  roundedRect(ctx, 36, 36, 828, 1128, 32, "#ffffff");
  roundedRect(ctx, 308, 114, 284, 284, 60, "#edf3ff");
  ctx.imageSmoothingEnabled = true;
  drawRoundedLogo(ctx, logo, 332, 138, 236, 52);
  ctx.fillStyle = "#202b40";
  ctx.font = "600 64px sans-serif";
  ctx.fillText("百科知识挑战", 450, 448);
  ctx.fillStyle = "#68758a";
  ctx.font = "30px sans-serif";
  ctx.fillText("在挑战中探索，在练习中积累", 450, 548);
  for (const [index, title] of ["挑战", "练习", "错题"].entries()) {
    const x = 124 + index * 238;
    roundedRect(ctx, x, 632, 176, 64, 20, "#edf3ff");
    ctx.fillStyle = "#2864eb";
    ctx.font = "500 29px sans-serif";
    ctx.fillText(title, x + 88, 648);
  }
  ctx.fillStyle = "#2864eb";
  ctx.font = "600 34px sans-serif";
  ctx.fillText("扫码开启知识挑战", 450, 752);
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(code, 320, 810, 260, 260);
  ctx.fillStyle = "#68758a";
  ctx.font = "25px sans-serif";
  ctx.fillText("长按识别小程序码，与朋友一起挑战", 450, 1092);
  if (env !== "release") {
    ctx.fillStyle = "#916539";
    ctx.font = "20px sans-serif";
    ctx.fillText(
      env === "trial"
        ? "体验版 · 仅体验成员可识别"
        : "开发版 · 仅开发成员可识别",
      450,
      1134,
    );
  }
  return layout;
}
function runtimeEnvironment(platform) {
  let env;
  try {
    env = platform.getAccountInfoSync().miniProgram.envVersion;
  } catch (error) {
    /* Report unsupported runtime below. */
  }
  if (!["develop", "trial", "release"].includes(env))
    throw Error("无法识别当前小程序版本，请重新进入后重试");
  return env;
}
function validCodeImage(code) {
  const matchingImageType =
    code &&
    ((code.mime_type === "image/png" &&
      /^iVBORw0KGgo/.test(code.image_base64)) ||
      (code.mime_type === "image/jpeg" && /^\/9j\//.test(code.image_base64)));
  if (
    !code ||
    !matchingImageType ||
    typeof code.image_base64 !== "string" ||
    code.image_base64.length > 8 * 1024 * 1024 ||
    !/^[A-Za-z0-9+/]+={0,2}$/.test(code.image_base64) ||
    /\s/.test(code.image_base64)
  )
    return false;
  return true;
}
function validateShareCode(code, questionId, env) {
  if (
    !validCodeImage(code) ||
    Number(code.question_id) !== questionId ||
    code.env_version !== env
  )
    throw Error("本题小程序码暂时不可用，请重试");
}
function validateAppShareCode(code, env) {
  if (
    !validCodeImage(code) ||
    code.page !== "pages/index/index" ||
    code.env_version !== env
  )
    throw Error("小程序码暂时不可用，请重试");
}
function createPosterSession(getIdentity) {
  let sequence = 0;
  return {
    begin() {
      const token = ++sequence;
      const identity = getIdentity();
      return () => sequence === token && getIdentity() === identity;
    },
    cancel() {
      sequence++;
    },
  };
}
export {
  POSTER_WIDTH,
  MAX_POSTER_HEIGHT,
  normalizeText,
  normalizeQuestion,
  wrapText,
  layoutPoster,
  drawPoster,
  drawAppPoster,
  runtimeEnvironment,
  validateShareCode,
  validateAppShareCode,
  createPosterSession,
};
