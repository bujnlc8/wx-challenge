// Offline design source. The Mini Program displays the finished PNG directly.
function drawAppPoster(ctx, layout, code, logo) {
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  ctx.fillStyle = "#edf2fa";
  ctx.fillRect(0, 0, layout.width, layout.height);
  roundedRect(ctx, 24, 24, 852, 1152, 40, "#ffffff");

  ctx.save();
  roundedRect(ctx, 24, 24, 852, 760, 40, "#2864eb");
  ctx.clip();
  roundedRect(ctx, 610, 194, 470, 470, 235, "#3972ed");
  roundedRect(ctx, 644, 228, 402, 402, 201, "#2864eb");
  roundedRect(ctx, 710, 294, 270, 270, 135, "#3972ed");
  roundedRect(ctx, 744, 328, 202, 202, 101, "#2864eb");
  ctx.restore();

  ctx.imageSmoothingEnabled = true;
  drawRoundedLogo(ctx, logo, 72, 72, 88, 24);
  ctx.fillStyle = "#ffffff";
  ctx.font = "600 38px sans-serif";
  ctx.fillText("百科知识挑战", 184, 76);
  ctx.fillStyle = "#dbe7ff";
  ctx.font = "24px sans-serif";
  ctx.fillText("每一份知识，都值得挑战", 184, 128);

  ctx.fillStyle = "#ffffff";
  ctx.font = "600 94px sans-serif";
  ctx.fillText("知识无界", 72, 242);
  ctx.fillText("挑战不停", 72, 362);
  roundedRect(ctx, 76, 494, 76, 7, 3, "#ffda63");
  ctx.fillStyle = "#e0ebff";
  ctx.font = "30px sans-serif";
  ctx.fillText("用你的知识储备，刷新自己的纪录", 76, 530);

  const features = [
    ["挑战", "刷新纪录"],
    ["练习", "巩固所学"],
    ["错题", "查漏补缺"],
  ];
  for (const [index, [title, description]] of features.entries()) {
    const x = 72 + index * 256;
    roundedRect(ctx, x, 630, 244, 110, 22, "#3972ed");
    ctx.fillStyle = "#ffffff";
    ctx.font = "600 30px sans-serif";
    ctx.fillText(title, x + 22, 649);
    ctx.fillStyle = "#dbe7ff";
    ctx.font = "23px sans-serif";
    ctx.fillText(description, x + 22, 693);
  }

  ctx.fillStyle = "#202b40";
  ctx.font = "600 34px sans-serif";
  ctx.fillText("扫码开启知识挑战", 72, 908);
  ctx.fillStyle = "#68758a";
  ctx.font = "26px sans-serif";
  ctx.fillText("长按识别小程序码", 72, 972);
  ctx.fillText("与朋友一起挑战", 72, 1014);
  ctx.fillStyle = "#98a3b6";
  ctx.font = "22px sans-serif";
  ctx.fillText("微信小程序", 72, 1118);
  // Preserve all 344×344 source pixels at 1:1, without any crop or overlay.
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(code, 492, 822, 344, 344);
  return layout;
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

export { drawAppPoster };
