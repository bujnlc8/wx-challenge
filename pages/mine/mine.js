// pages/mine/mine.js
const app = getApp();
import {
  httpPOST,
  httpGET,
  uploadImage,
  shareGetCoin,
  showToast,
} from "../../utils/util";
Page({
  data: {
    user_info: {},
    logined: 0,
    correct_rate: 100,
    show_tip: 0,
    category: 0,
    category_lables: app.category_lables,
    categories: app.categories,
    show_about_me: 0,
    is_ios: app.is_ios,
  },

  /**
   * 生命周期函数--监听页面加载
   */
  onLoad() {
    wx.setNavigationBarTitle({
      title: "我的",
    });
    this.setData({
      category: app.category,
      show_tip: app.show_class_tip,
    });
    this.setUserInfoFromCache();
  },
  getUserMine: function () {
    httpGET("api/user/mine")
      .then((res) => {
        if (res.data.code == 10000) {
          var correct_rate = 100;
          if (res.data.data.total_question > 0) {
            correct_rate = Math.ceil(
              (1 -
                res.data.data.wrong_question / res.data.data.total_question) *
                100
            );
          }
          this.setData({
            user_info: res.data.data,
            logined: 1,
            correct_rate: correct_rate,
          });
          wx.setStorageSync("mine_cache", res.data.data);
        } else {
          if (res.data.code == 11111) {
            wx.clearStorageSync("uid");
            this.setData({
              logined: 0,
            });
          } else {
            showToast(res.data.message);
          }
        }
      })
      .catch(() => {
        showToast("网络异常");
      });
  },
  login: function () {
    app.clickSound();
    app.checkLogin(this.getUserMine);
  },
  logout: function () {
    app.clickSound();
    wx.clearStorageSync("uid");
    wx.clearStorageSync("mine_cache");
    this.setData({
      logined: 0,
      user_info: {},
    });
  },
  chooseAvatar: function (e) {
    uploadImage(e.detail.avatarUrl, this.uploadAvatarCb);
  },
  uploadAvatarCb: function (err, data) {
    if (err) {
      showToast(err);
      return;
    }
    var avatar = data.Location;
    if (!avatar.startsWith("http")) {
      avatar = "https://" + avatar;
    }
    httpPOST("api/user/update-nickname-avatar", {
      avatar: avatar,
    })
      .then((res) => {
        if (res.data.code != 10000) {
          showToast(res.data.message);
          return;
        } else {
          wx.showToast({
            title: "头像更新成功",
            icon: "success",
            duration: 2000,
          });
          var user_info = this.data.user_info;
          user_info.avatar = avatar;
          this.setData({
            user_info: user_info,
          });
        }
      })
      .catch(() => {
        showToast("网络异常");
      });
  },
  updateNickname: function () {
    httpPOST("api/user/update-nickname-avatar", {
      nickname: this.data.user_info.nickname,
    })
      .then((res) => {
        if (res.data.code != 10000) {
          showToast(res.data.message);
          return;
        } else {
          wx.showToast({
            title: "昵称更新成功",
            icon: "success",
            duration: 2000,
          });
        }
      })
      .catch(() => {
        showToast("网络异常");
      });
  },
  inputNickname: function (e) {
    var user_info = this.data.user_info;
    user_info.nickname = e.detail.value;
    this.setData({
      user_info: user_info,
    });
  },
  goToWrongQuestion: function () {
    app.clickSound();
    if (this.data.user_info.wrong_question == 0) {
      return;
    }
    wx.navigateTo({
      url: "/pages/wrong/wrong",
    });
  },
  goToSetting: function () {
    app.clickSound();
    wx.navigateTo({
      url: "/pages/setting/setting",
    });
  },
  goToCoin: function () {
    app.clickSound();
    wx.navigateTo({
      url: "/pages/coin/coin",
    });
  },
  tapCorrectRate: function () {
    app.playSound("good");
    showToast("棒棒哒👍");
  },
  tapMaxScore: function () {
    app.playSound("do_better_again");
    showToast("再接再厉💪");
  },
  tapQuestionNum: function () {
    app.playSound("your_expert");
    showToast("答题小能手✌️");
  },
  tapWrongQuestion: function () {
    app.playSound("faith_is_mother_of_success");
    showToast("失败是成功之母💗");
  },
  selectQuestionType: function (e) {
    var category = e.detail.value;
    this.setData({
      category: category,
    });
    if (category >= 1) {
      showToast("将只作答" + this.data.categories[category] + "类题目");
    }
    app.category = category;
    wx.setStorageSync("question_category", app.category);
  },
  /**
   * 生命周期函数--监听页面初次渲染完成
   */
  onReady() {},
  setUserInfoFromCache: function () {
    var that = this;
    wx.getStorage({
      key: "mine_cache",
      success(res) {
        that.setData({
          user_info: res.data,
          logined: 1,
        });
      },
    });
  },
  /**
   * 生命周期函数--监听页面显示
   */
  onShow() {
    if (wx.getStorageSync("uid")) {
      this.setUserInfoFromCache();
      this.getUserMine();
    } else {
      showToast("请点击头像登录");
    }
    this.setData({
      category: app.category,
      show_tip: app.show_class_tip,
    });
  },

  /**
   * 生命周期函数--监听页面隐藏
   */
  onHide() {},

  /**
   * 生命周期函数--监听页面卸载
   */
  onUnload() {},

  /**
   * 页面相关事件处理函数--监听用户下拉动作
   */
  onPullDownRefresh() {},

  /**
   * 页面上拉触底事件的处理函数
   */
  onReachBottom() {},

  /**
   * 用户点击右上角分享
   */
  onShareAppMessage() {
    shareGetCoin();
    return {
      title: "快来给你的知识探探底吧～",
      path: "pages/index/index",
      imageUrl: "../../images/share.png",
    };
  },
  onTabItemTap: function () {
    app.clickSound();
  },
  openTip: function () {
    app.clickSound();
    this.setData({
      show_tip: 1,
    });
  },
  closeTip: function () {
    app.clickSound();
    var needBack = app.show_class_tip == 1 ? true : false;
    app.show_class_tip = 0;
    this.setData({
      show_tip: 0,
    });
    if (needBack) {
      wx.switchTab({
        url: "/pages/index/index",
      });
    }
  },
  showHelp: function () {
    app.clickSound();
    app.show_help_tip = 1;
    wx.switchTab({
      url: "/pages/index/index",
    });
  },
  closeAbdoutMe: function () {
    app.clickSound();
    this.setData({
      show_about_me: 0,
    });
  },
  aboutMe: function () {
    app.clickSound();
    this.setData({
      show_about_me: 1,
    });
  },
  catchtouchmove: function () {},
  copyUrl: function () {
    wx.setClipboardData({
      data: "https://igsc.admin.haihui.site",
      success: function () {
        wx.showToast({
          title: "链接已复制",
          icon: "none",
        });
      },
    });
  },
});
