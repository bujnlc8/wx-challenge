# 运行包资源审计

执行 `node scripts/audit-package.mjs` 可统计当前待上传源文件，并检查本地运行引用；执行 `node --test tests/package-assets.test.mjs` 验证审计逻辑及项目资源完整性。

统计以 Git 已跟踪文件和新增的未忽略文件为候选，去掉 `project.config.json`、`project.private.config.json` 这两个开发工具输入及 `packOptions.ignore` 命中的文件。它是**本地未编译上传源文件**的字节统计，不代表微信开发者工具最终编译包大小。已经排除的设计稿、截图、文档、测试不计入优化前包体。未关闭 source map，也未把仓库总体积减少当作上传包收益。

## Logo

`images/ui-about-logo.png` 从 1254×1254 的 1,228,810 字节 PNG 缩为 512×512，再由 oxipng 无损压缩到 185,429 字节，减少 1,043,381 字节。512 像素可覆盖当前最大 116 像素绘制的三倍采样需求。图形、比例和配色保持原样，已目视检查轮廓；仍使用 PNG，以保留现有 Canvas 路径的格式兼容性。

原始图片保留在 `design-demos/brand-assets/ui-about-logo-original.png`，该目录不上传。只做1254像素原图的无损压缩仍需834,574字节，因此采用符合当前实际用途的512像素版本。

## 清理与保留

依据 app/tabBar、页面、组件、脚本 import/require、WXML、WXSS、WXS、Canvas 图片路径的引用扫描，移除18张没有运行引用的旧别名图片，共47,408字节：

- `challenge.png`、`challenge_active.png`、`train.png`、`train_active.png`
- `mine.png`、`mine_active.png`
- `grade.png`、`grade0.png`–`grade6.png`、`no-grade.png`
- `coin.png`、`star.png`、`star-fill.png`

相应设计矢量源保留在 `design-demos/vector-assets/`。运行中的 `ui-grade-0.png`–`ui-grade-6.png` 全部保留；审计会展开动态等级引用，缺任一等级都会失败。`libs/cos-wx-sdk-v5.min.js` 是头像上传实际依赖，保留。`images/ui-empty-question.svg` 仍由题目海报组件引用，保留。

打包配置显式排除设计与截图目录、文档、测试、审计脚本、说明文件、Git与编辑器目录、本机配置。JS/WXML/WXSS已有压缩设置保持启用。

## 基线

2026-11-01 优化开始时，按上述相同口径统计为1,877,527字节/134文件，其中运行图片1,372,729字节/50文件。最终结果请运行审计命令获取，避免并行修改页面后使用过期数字。

## 最终整合复核

最新包含登录刷新和音效的运行源为788017字节，约0.75MiB，相对同口径1877527字节基线减少约58.0%。旧原生分享已移除，share.png也已删除。此为本地未编译运行源统计，不冒称微信最终包体积。
