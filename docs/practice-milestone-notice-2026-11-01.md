# 练习每日达标到账提醒

练习页只消费既有 `api/question/check-training-question` 成功响应业务数据中的非空字符串 `toast`，不以 `total_index` 或本地累计数判断达标，不增加进度查询、发币操作或答题请求。后端发奖成功时提供“练习100题达标，10000百科币已到账”；正确和错误答案均可以携带该提示。

显示使用现有自定义 `showToast({ title: message, duration: 4000, mask: false })`，不弹模态、不新增声音，保留原正确/错误音效、选项、结果、主按钮和计时。提交前捕获稳定账号 identity，旧账号或卸载后的响应不会覆盖答题结果或触发提示。

单条待提示队列在隐藏、纠错、真实海报可见、本地 modal lock、微信订阅面板期间等待。纠错关闭、海报 close、弹窗取消/确认、onShow、原生订阅 settled 都会尝试显示；消费前清空队列，重复安全点不会重播。账号变更、卸载或排队满 5 分钟会丢弃，未使用持久存储、长定时器或轮询。

新增 `tests/practice-milestone-notice.test.mjs` 7 项行为测试先 RED 后 GREEN；旧 `practice-primary-action` fixture 仅改用真实 auth-loader。与现有下一题、每日订阅、纠错、滚动测试合计 50 项局部测试通过。官方 WCC 编译练习页、`utils/util.wxs` 和 popup/report/ui-feedback/question-poster 依赖通过，`git diff --check` 通过。测试覆盖正确/错误达标、空提示不猜测、所有遮挡关闭只消费一次、后台恢复、切号/卸载/过期丢弃，以及不增加 GET/答题 POST、不改变选项和时钟、不新增奖励音效。

Node 验证响应/队列/调用契约；原生订阅、纠错导航及海报关闭后的可视提示仍需开发者工具/真机验收。本次前端变更未 stage、commit 或上传，后台钱包发奖契约由配套后端验证。
