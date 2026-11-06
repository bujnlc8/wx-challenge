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
  function layoutBlocks(
    blocks,
    x,
    width,
    top,
    fixedImageHeight,
    fontSize = 32,
  ) {
    let y = top;
    const items = blocks.map((block) => {
      const item = { ...block, x, y, width };
      if (block.type === "image") {
        const image = images[block.src];
        if (!image || !(image.width > 0 && image.height > 0))
          throw Error("题目图片未完整加载，请重试");
        const scale = fixedImageHeight
          ? Math.min(width / image.width, fixedImageHeight / image.height, 2)
          : Math.min(width / image.width, 2);
        item.width = image.width * scale;
        item.height = image.height * scale;
        item.x = x + (width - item.width) / 2;
        if (fixedImageHeight) {
          item.frame = { x, y, width, height: fixedImageHeight };
          item.y = y + (fixedImageHeight - item.height) / 2;
        }
      } else {
        const isVideo = block.type === "video";
        item.fontSize = isVideo ? 30 : fontSize;
        item.lineHeight = isVideo ? 44 : Math.round(fontSize * 1.45);
        ctx.font =
          (item.fontSize >= 38 ? "600 " : "") + item.fontSize + "px sans-serif";
        item.lines = wrapText(
          ctx,
          isVideo ? "本题含视频，扫码后查看完整视频" : block.text,
          isVideo ? width - 90 : width,
        );
        item.height = item.lines.length * item.lineHeight;
        if (isVideo) item.height = Math.max(100, item.height + 32);
      }
      y += (item.frame ? item.frame.height : item.height) + 12;
      return item;
    });
    return { items, bottom: items.length ? y - 12 : top };
  }
  let main = layoutBlocks(question.blocks, 72, 756, 210, 360);
  let y = main.bottom + 20;
  const optionGap = 16;
  const columnWidth = (784 - optionGap) / 2;
  ctx.font = "32px sans-serif";
  // Only concise text options share a row. Media and long text retain full width.
  const twoColumns =
    question.options.length >= 2 &&
    question.options.length <= 4 &&
    question.options.every(
      (option) =>
        option.blocks.length === 1 &&
        option.blocks[0].type === "text" &&
        wrapText(ctx, option.blocks[0].text, columnWidth - 104).length <= 2,
    );
  const options = [];
  const columns = twoColumns ? 2 : 1;
  for (let index = 0; index < question.options.length; index += columns) {
    let rowHeight = 0;
    for (
      let column = 0;
      column < columns && index + column < question.options.length;
      column++
    ) {
      const option = question.options[index + column];
      const width = twoColumns ? columnWidth : 784;
      const x = 58 + column * (width + optionGap);
      const body = layoutBlocks(
        option.blocks,
        x + 80,
        twoColumns ? width - 104 : 658,
        y + 14,
      );
      const height = Math.max(74, body.bottom - y + 14);
      options.push({
        label: option.label,
        x,
        y,
        width,
        height,
        blocks: body.items,
      });
      rowHeight = Math.max(rowHeight, height);
    }
    y += rowHeight + 12;
  }
  let contentBottom = (options.length ? y - 12 : main.bottom) + 16;
  const textOnly =
    question.blocks.every((block) => block.type === "text") &&
    question.options.every((option) =>
      option.blocks.every((block) => block.type === "text"),
    );
  // A short text question gets room to breathe. Media and long content keep
  // their compact, complete layout instead of inheriting this extra spacing.
  if (textOnly && twoColumns && contentBottom <= 640) {
    const enlarged = layoutBlocks(question.blocks, 72, 756, 0, 0, 40);
    const rowHeights = [];
    for (let index = 0; index < options.length; index += 2) {
      rowHeights.push(
        Math.max(
          132,
          ...options.slice(index, index + 2).map((option) => option.height),
        ),
      );
    }
    const groupHeight =
      enlarged.bottom +
      44 +
      rowHeights.reduce((sum, height) => sum + height, 0) +
      (rowHeights.length - 1) * 20;
    const areaTop = 230,
      areaBottom = 792;
    if (groupHeight <= areaBottom - areaTop) {
      const top = areaTop + (areaBottom - areaTop - groupHeight) / 2;
      for (const block of enlarged.items) block.y += top;
      enlarged.bottom += top;
      main = enlarged;
      let rowY = main.bottom + 44;
      for (let index = 0; index < options.length; index += 2) {
        const rowHeight = rowHeights[index / 2];
        for (const option of options.slice(index, index + 2)) {
          const offset = rowY - option.y + (rowHeight - option.height) / 2;
          for (const block of option.blocks) block.y += offset;
          option.y = rowY;
          option.height = rowHeight;
        }
        rowY += rowHeight + 20;
      }
      contentBottom = 816;
    }
  }
  const height = Math.max(1200, contentBottom + 376);
  if (height > MAX_POSTER_HEIGHT)
    throw Error("题目内容过长，暂时无法生成完整海报，请选择其他题目");
  return {
    width: POSTER_WIDTH,
    height,
    blocks: main.items,
    options,
    contentBottom,
    footerY: height - 360,
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
  ctx.fillStyle = "#f0f4fc";
  ctx.fillRect(0, 0, layout.width, layout.height);
  ctx.fillStyle = "#2864eb";
  ctx.fillRect(0, 0, layout.width, 270);
  // Keep all decoration in the header, away from question images and the code.
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.arcTo(900, 0, 900, 270, 0);
  ctx.arcTo(900, 270, 0, 270, 0);
  ctx.arcTo(0, 270, 0, 0, 0);
  ctx.closePath();
  ctx.clip();
  roundedRect(ctx, 710, -120, 380, 380, 190, "#3972ed");
  roundedRect(ctx, 738, -92, 324, 324, 162, "#2864eb");
  ctx.restore();
  if (logo) drawRoundedLogo(ctx, logo, 52, 30, 64, 18);
  ctx.fillStyle = "#ffffff";
  ctx.font = "600 32px sans-serif";
  ctx.fillText("百科知识挑战", logo ? 136 : 52, 30);
  ctx.fillStyle = "#dce8ff";
  ctx.font = "22px sans-serif";
  ctx.fillText("知识无界，挑战不停", logo ? 136 : 52, 74);
  ctx.fillStyle = "#ffffff";
  ctx.font = "600 50px sans-serif";
  ctx.fillText("这道题，你会吗？", 52, 120);
  const cardHeight = Math.max(layout.contentBottom, layout.footerY - 28) - 190;
  roundedRect(ctx, 36, 190, 828, cardHeight + 4, 28, "#dfe8f8");
  roundedRect(ctx, 36, 190, 828, cardHeight, 28, "#ffffff");
  function drawBlocks(blocks) {
    for (const block of blocks) {
      if (block.type === "image") {
        if (block.frame) {
          const frame = block.frame;
          roundedRect(
            ctx,
            frame.x,
            frame.y,
            frame.width,
            frame.height,
            12,
            "#f5f8ff",
          );
        }
        ctx.imageSmoothingEnabled = true;
        ctx.drawImage(
          images[block.src],
          block.x,
          block.y,
          block.width,
          block.height,
        );
      } else {
        const isVideo = block.type === "video";
        if (isVideo) {
          roundedRect(
            ctx,
            block.x,
            block.y,
            block.width,
            block.height,
            12,
            "#f5f8ff",
          );
          roundedRect(ctx, block.x + 16, block.y + 22, 52, 52, 14, "#e2ebff");
          ctx.fillStyle = "#2864eb";
          ctx.font = "30px sans-serif";
          ctx.fillText("▶", block.x + 31, block.y + 32);
        }
        ctx.fillStyle = isVideo ? "#2864eb" : "#202b40";
        ctx.font =
          (block.fontSize >= 38 ? "600 " : "") +
          block.fontSize +
          "px sans-serif";
        block.lines.forEach((line, index) =>
          ctx.fillText(
            line,
            block.x + (isVideo ? 82 : 0),
            block.y + (isVideo ? 22 : 0) + index * block.lineHeight,
          ),
        );
      }
    }
  }
  drawBlocks(layout.blocks);
  for (const option of layout.options) {
    roundedRect(
      ctx,
      option.x,
      option.y,
      option.width,
      option.height,
      20,
      "#f1f5fd",
    );
    const labelY = option.y + Math.min(44, (option.height - 46) / 2);
    roundedRect(ctx, option.x + 12, labelY, 52, 46, 14, "#e2ebff");
    ctx.fillStyle = "#2864eb";
    ctx.font = "600 30px sans-serif";
    ctx.fillText(option.label + ".", option.x + 20, labelY + 7);
    drawBlocks(option.blocks);
  }
  const footer = layout.footerY;
  roundedRect(ctx, 36, footer, 828, 336, 28, "#ffffff");
  roundedRect(ctx, 72, footer + 36, 48, 6, 3, "#ffcf57");
  ctx.fillStyle = "#202b40";
  ctx.font = "600 38px sans-serif";
  ctx.fillText("扫码直接作答", 72, footer + 76);
  ctx.fillStyle = "#68758a";
  ctx.font = "28px sans-serif";
  ctx.fillText("长按识别小程序码", 72, footer + 140);
  ctx.fillText("看看你能选对吗", 72, footer + 184);
  // Use the server's actual code pixels, in a dedicated white region.
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(code, 534, footer + 18, 300, 300);
  if (env !== "release") {
    ctx.fillStyle = "#916539";
    ctx.font = "24px sans-serif";
    ctx.fillText(
      env === "trial"
        ? "体验版 · 仅体验成员可识别"
        : "开发版 · 仅开发成员可识别",
      72,
      footer + 278,
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
  runtimeEnvironment,
  validateShareCode,
  createPosterSession,
};
