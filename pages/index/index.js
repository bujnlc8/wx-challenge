const app = getApp();
import { httpGET, shareGetCoin, showToast } from "../../utils/util";
Page({
  data: {
    week_rank_list: [],
    total_rank_list: [],
    current_rank_list: [],
    reset_seconds: 0,
    reset_day: 0,
    reset_hour: 0,
    reset_minute: 0,
    t: 0,
    show_tip: 0,
    my_rank: 999,
    logined: 0,
    mine: null,
    is_show_help_tip: 0,
  },
  startChallenge: function () {
    app.clickSound();
    app.checkLogin(this.goToChallenge);
  },
  goToChallenge: function () {
    wx.navigateTo({
      url: "/pages/answer/answer",
    });
  },
  onLoad: function () {
    wx.setNavigationBarTitle({
      title: "挑战",
    });
    if (!wx.getStorageSync("uid")) {
      this.setData({
        logined: 0,
      });
    } else {
      this.setData({
        logined: 1,
      });
    }
    this.getCurrentWeekRanking();
    this.getTotalRanking();
    wx.getStorage({
      key: "is_show_help_tip",
      fail: () => {
        this.setData({
          is_show_help_tip: 1,
        });
      },
    });
  },
  closeHelpTip: function () {
    app.clickSound();
    wx.setStorageSync("is_show_help_tip", 1);
    this.setData({
      is_show_help_tip: 0,
    });
    if (app.show_help_tip) {
      app.show_help_tip = 0;
      wx.switchTab({
        url: "/pages/mine/mine",
      });
    }
  },
  getCurrentWeekRanking: function () {
    wx.showLoading({
      title: "加载中...",
    });
    httpGET("api/question/ranking-list", {
      type: 0,
    })
      .then((res) => {
        wx.hideLoading();
        wx.stopPullDownRefresh();
        if (res.data.code == 10000) {
          this.setData({
            week_rank_list: res.data.data.list,
            reset_seconds: res.data.data.reset_seconds,
          });
          if (this.data.t == 0) {
            var h = parseInt(res.data.data.reset_seconds / 3600);
            var d = parseInt(h / 24);
            h = h - d * 24;
            var m = parseInt((res.data.data.reset_seconds % 3600) / 60);
            this.setData({
              current_rank_list: res.data.data.list,
              reset_hour: h,
              reset_minute: m,
              reset_day: d,
              my_rank: res.data.data.rank,
              mine: res.data.data.mine,
            });
          }
        } else {
          showToast(res.data.message);
        }
      })
      .catch(() => {
        showToast("网络异常");
        wx.stopPullDownRefresh();
      });
  },
  getTotalRanking: function () {
    httpGET("api/question/ranking-list", {
      type: 1,
    })
      .then((res) => {
        wx.stopPullDownRefresh();
        if (res.data.code == 10000) {
          this.setData({
            total_rank_list: res.data.data.list,
            reset_seconds: res.data.data.reset_seconds,
          });
          if (this.data.t == 1) {
            this.setData({
              current_rank_list: res.data.data.list,
              my_rank: res.data.data.rank,
              mine: res.data.data.mine,
            });
          }
        } else {
          showToast(res.data.message);
        }
      })
      .catch(() => {
        showToast("网络异常");
      });
  },
  updateData: function (t) {
    var that = this;
    if (!that) {
      var pages = getCurrentPages();
      that = pages[pages.length - 1];
    }
    if (t == undefined) {
      t = that.data.t;
      that.setData({
        logined: 1,
      });
    }
    if (t == 0) {
      that.getCurrentWeekRanking();
      var data = that.data.week_rank_list;
    } else {
      that.getTotalRanking();
      var data = that.data.total_rank_list;
    }
    that.setData({
      t: t,
      current_rank_list: data,
    });
  },
  changeTab: function (e) {
    app.clickSound();
    this.updateData(e.target.dataset.t);
  },
  closeTip: function () {
    app.clickSound();
    this.setData({
      show_tip: 0,
    });
  },
  openTip: function () {
    app.clickSound();
    this.setData({
      show_tip: 1,
    });
  },
  onShareAppMessage() {
    shareGetCoin();
    return {
      title: "百科知识挑战，挑战你的百科知识！",
      imageUrl: "../../images/share.png",
    };
  },
  onShareTimeline() {
    shareGetCoin();
    return {
      title: "看看谁才是答题界最靓的仔...",
      imageUrl: "../../images/share.png",
    };
  },
  onReady: function () {},
  onTabItemTap: function () {
    app.clickSound();
  },
  onPullDownRefresh: function () {
    this.updateData(this.data.t);
  },
  onShow() {
    var t = this.data.logined;
    if (!wx.getStorageSync("uid")) {
      this.setData({
        logined: 0,
      });
      if (t == 1) {
        this.updateData(this.data.t);
      }
    } else {
      this.setData({
        logined: 1,
      });
      if (t == 0) {
        this.updateData(this.data.t);
      }
    }
    if (app.show_help_tip) {
      this.setData({
        is_show_help_tip: 1,
      });
    }
  },
  goToLogin: function () {
    app.clickSound();
    app.checkLogin(this.updateData);
  },
  goToClassIntro: function () {
    app.clickSound();
    app.show_class_tip = 1;
    wx.switchTab({
      url: "/pages/mine/mine",
    });
  },
  catchtouchmove: function () {},
});
