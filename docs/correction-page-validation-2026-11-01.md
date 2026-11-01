# 独立纠错页验证

用户选择独立纠错页以解决iPhone补充说明仍无法聚焦的问题。原report组件只保留零视图导航桥；新correction页面承载correction-form普通表单。输入祖先不再有fixed/transform/overflow裁切/内部scroll-view；键盘由微信原生页面处理，删除原有高度事件、人工滚动定位及测量逻辑。

保留4个入口的getCaptcha/nextQuestion契约、答题计时与选项状态、验证码新旧请求和账号/题目会话隔离、提交互斥、完整位掩码和500字备注。错题集补全关闭回调；账号或题目变更后返回仅清理纠错状态，不恢复旧题自动推进。URL仅带question_id，EventChannel返回一次关闭事件，不携带凭据。

286项Node测试通过，新增导航去重、导航失败重试、晚返回隔离、账号变化、组件属性异步、页面关闭、非法题号和普通流结构保护；原HTTP生命周期及按钮声音测试迁入表单组件继续执行。全量官方19个WXML/WXS与20个WXSS编译、包体引用审计通过。

微信原生开发者工具实际打开pages/correction/correction?question_id=42，组件挂载与目标questionId通过App.callFunction读取确认，截图本地保存。Element查询自动化超时，因此没有声称已完成原生点击/输入验收；未提交真实反馈或答案。验证码接口需登录，未把无凭据401当成功。真实iPhone输入仍需用户更新后复验。

无后端修改。设计、计划和测试均排除运行包。开发版上传结果见release-2026-11-01.md。
