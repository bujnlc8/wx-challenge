# 独立纠错页 Implementation Plan

> 按顺序在当前已隔离功能分支执行；保留用户的project配置变更，不派生子代理。

**Goal:** 原生页面表单可靠输入并保持四种纠错入口的原业务契约。
**Architecture:** report导航桥 + correction页面 + correction-form业务表单；EventChannel返回，不引入后端修改。
**Tech Stack:** Native WeChat WXML/WXSS/JS, Node tests, WeChat CLI.
**Spec:** docs/superpowers/specs/2026-11-01-correction-page-design.md

- [x] 为导航桥去重/失败/返回隔离、新页面生命周期写失败测试；原验证码提交测试迁移到表单组件
- [x] 分离导航与表单，注册页面和四个入口，补错题集关闭回调
- [x] 普通流表单设计与验证码/备注输入，移除原键盘布局控制与相关过期测试
- [x] 全量测试、官方编译、资源引用与布局检查；冻结精确源码
- [x] 同AppID开发版上传及哈希核验，记录真实键盘验收边界
