# 百科知识挑战界面与功能实施计划

> **For agentic workers:** Execute inline with focused independent component/backend work; do not commit, push or deploy without a release request.

**Goal:** 完成用户已批准的蓝色 UI 及后续追加的反馈、题型、每日提醒、海报和独立说明页面。

**Architecture:** 原生 WXML/WXSS 页面与组件；复用原有答题计分及登录接口。新增后端每日题号、订阅记录和小程序码接口。

**Tech Stack:** 微信小程序、Node 内置测试；Spring Boot 2.7 / Java 8 / MySQL / Redis。

**Spec:** `design-demos/direction-approved.md`。最终交付说明：`docs/implementation-handoff.md`。

## Global Constraints

- 保留计分、计时、复活与原有币奖励规则，不把原型演示数据带入产品。
- 一次性订阅机会与偏好分离；真实码由服务端取得；源码中无微信密钥。
- UI 遵循自然高度+最大高度弹窗、关闭按钮和短屏可用性。

## Review Focus

- dataset/mark、题型确认和取消；请求失败/账号变更的异步反馈。
- 订阅接受与偏好保存的竞态，未知通知发送状态不重复投递。
- 海报与挑战自动切题协调，扫码题号真实性，长文本/图片/视频完整性。
- 小程序真实控件样式与浏览器差异，短屏和短/长弹窗布局。

## Completed Tasks

- [x] 全部 11 页与公共组件视觉、Logo、练习图标和带图空态。
- [x] 自定义 Toast/Loading，题型草稿确认/取消，独立帮助和关于。
- [x] 每日挑战菜单与真实后端提醒偏好/一次性接受接口。
- [x] 海报渲染、PNG/JPEG 真实码兼容、相册权限和生命周期隔离。
- [x] 后端每日固定题号、08:00 时区调度、持久额度与去重、海报码。
- [x] 修复独立审查发现的短屏按钮、失效题号、提醒竞态和海报切题问题并覆盖回归。
- [x] 全量 Node/Java/恢复测试、原生编译和开发者工具模拟接口验收。
- [x] 提供数据库迁移与配套发布说明，保持本地未提交。
