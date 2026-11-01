const app = getApp();
Page({
  data: {
    active_section: "",
    sections: [
      {
        id: "challenge",
        title: "普通挑战怎么设置题数？",
        paragraphs: [
          "在“答题设置”中选择每轮1–100题，默认10题，下一轮生效。跳过也计入题数，达到数量后结束本轮。",
          "计分、百科币和跳过规则可在挑战页查看。",
        ],
      },
      {
        id: "practice",
        title: "练习和单题怎么答？",
        paragraphs: [
          "练习不限时、不计分，每日练习满100道不同题目奖励10000百科币，每天限领一次。每日一题和分享题只答当前一道，提交后停留结果。",
          "单题从取题完成开始计时，提交时停止。后台时间计入，网络等待和重试不计入；不限时，用时不影响得分。",
        ],
      },
      {
        id: "rewards",
        title: "分数和百科币有什么区别？",
        paragraphs: [
          "分数是答题成绩，普通挑战用来排名，单题只记录本题成绩。百科币是累计余额，用于等级和复活。",
          "单题答对得1000分，同时奖励1000百科币，每人每题只奖励一次。答错得0分，不获得百科币。",
        ],
      },
      {
        id: "reminder",
        title: "怎么订阅每日提醒？",
        paragraphs: [
          "在“我的 → 每日挑战”开启08:00提醒。每次授权可收到一条通知；答题时每天最多自动询问一次，也可手动订阅。",
        ],
      },
      {
        id: "mine",
        title: "错题和个人设置在哪里？",
        paragraphs: [
          "在“我的 → 错题集”点击题干看答案，长按删除记录。点击“纠错”可反馈题目问题。",
          "头像、昵称可直接修改；题型、答案解析和音效在“我的”菜单调整，百科币明细和等级说明也在这里查看。",
        ],
      },
      {
        id: "share",
        title: "怎么分享一道题？",
        paragraphs: [
          "点击底部“分享”生成海报，可预览、保存或长按分享。朋友扫码后只答这一题；练习和错题页也支持生成海报。",
        ],
      },
    ],
  },
  toggleSection(event) {
    const id = event.currentTarget.dataset.id;
    if (!this.data.sections.some((section) => section.id === id)) return;
    app.clickSound();
    this.setData({ active_section: this.data.active_section === id ? "" : id });
  },
  onShow() {
    if (typeof wx.hideShareMenu === "function") {
      wx.hideShareMenu({ menus: ["shareAppMessage", "shareTimeline"] });
    }
    wx.setStorageSync("is_show_help_tip", 1);
  },
});
