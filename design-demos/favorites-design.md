# 收藏夹与收藏按钮

- 我的菜单在错题集后加入“收藏夹”，复用 `.menu-label`，保持同一菜单组和现有字号。
- 收藏按钮为透明背景线描星标。默认文字“收藏 / 已收藏”，14px 字、16px 图标、至少36px触达高度。`compact="{{true}}"` 隐藏文字，保持至少32 × 36px触达及收藏/取消收藏的无障碍标签。组件启用 `virtualHost`，可直接放入 flex 操作行。
- 收藏夹提供题干预览、题目图片/视频，右上角透明星标改为44 × 44px取消入口；点击先弹自定义确认，标题“取消收藏”，文案“要将这道题移出收藏夹吗？”，按钮“保留收藏 / 取消收藏”，关闭等同保留。右下“去答题”保持；空态复用现有 `ui-empty-question.png`。不显示答案或解析，不自动提交作答。
- 原左下取消文字改为真实收藏时间“收藏于 yyyy-MM-dd HH:mm:ss”；从后端 `created_at` 直接提取本地日期时间，不做时区转换，省略秒时补00，缺失/异常显示“—”，不使用当前时间。
- 确认意图绑定题号、owner和页面generation；hide、unload、刷新使旧意图失效。只有确认才POST，取消不请求，快点确认仍只写一次。星标由页面播放一次点击声，确认/取消复用popup自身声音，写入helper保持无声。
- 图标为原生 SVG 线条，`design-demos/vector-assets/ui-{favorite,favorite-active,menu-favorite}.svg` 为源文件，运行时对应96 × 96透明PNG；使用 rsvg-convert 导出。

## 接口与状态

- `GET api/question/favorite {question_id}` 读取布尔收藏状态。
- `POST api/question/favorite {question_id,favorite}` 使用现有 `httpPOST` 的表单请求，明确设置幂等目标。
- `GET api/question/favorites {page,size}` 获取最近收藏顺序列表，默认每页12条。
- 接口均要求统一 `code=10000`；复用现有鉴权与刷新机制。
- 内存 store 以 `getSessionIdentity()` 稳定登录身份隔离，token 自动刷新保持该身份；身份变化丢弃缓存与迟到响应。
- 同题多个组件共用请求和订阅。成功后才更新状态；初次读取时禁用按钮。读取失败点击仅重试GET；写入失败标记未知，下一次先GET校准。并发同目标只保留一个POST。
- 页面显示时按60秒TTL读取状态；隐藏或卸载的组件解除订阅，异步操作不更新隐藏UI或发出迟到toast。程序加载不发点击音。
- 列表按题号去重；分页失败保留已有记录并在相同页重试。取消成功重置page1，防止删除导致offset向前移动后漏题。返回收藏夹时刷新，列表GET前先等待本owner已有写操作完成，等待后复核owner和页面generation，避免取消操作尚未完成时读回旧列表。列表GET开始时捕获单调写revision；响应不会覆盖开始后已确认的POST状态，发生此类过期快照时重取page1。
- “去答题”导航至 `/pages/single/single?question_id=<id>&from=favorite`。本模块不调用作答或奖励接口。

## 验证范围

`node --test tests/favorites.test.mjs`：19条通过，覆盖双实例同步、并发写、错误重试、owner隔离、hide保护、TTL、取消与查询竞争、分页和真实auth刷新链路、迟到列表与已确认写入冲突、取消后离开/返回的在途写竞争，以及复用真实popup的确认/取消、重复确认、旧意图失效和收藏时间格式。首次关键用例已观察RED，compact属性和取消竞争也各自观察RED后修复。

`node scripts/audit-package.mjs` 检查无缺失运行时资源、无未使用图片；`sips` 验证三张PNG均96 × 96且包含Alpha通道。

Node行为测试不证明微信原生界面的布局、触摸或真机视觉。原生编译、后端联调及设备验收由统一集成阶段完成。
