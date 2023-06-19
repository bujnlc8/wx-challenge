const app = getApp();
import { showToast } from "../../utils/util";

Page({
  data: {
    sound_close: 0,
    show_correct_answer: 1,
    is_ios: app.is_ios,
    show_analysis: app.show_analysis,
  },

  /**
   * 生命周期函数--监听页面加载
   */
  onLoad() {
    wx.setNavigationBarTitle({
      title: "设置",
    });
    if (wx.getStorageSync("sound_close")) {
      this.setData({
        sound_close: 1,
      });
    }
    if (wx.getStorageSync("close_show_correct_answer")) {
      this.setData({
        show_correct_answer: 0,
      });
    }
  },
  operateSound: function () {
    app.clickSound();
    if (this.data.sound_close) {
      app.sound_close = 0;
      wx.removeStorageSync("sound_close");
      this.setData({
        sound_close: 0,
      });
      if (app.is_ios) {
        showToast("将为您播放音效提示");
      } else {
        showToast("将为您播放背景音乐及音效");
      }
    } else {
      wx.setStorageSync("sound_close", 1);
      app.sound_close = 1;
      this.setData({
        sound_close: 1,
      });
      if (app.is_ios) {
        showToast("将为您关闭音效提示");
      } else {
        showToast("将为您关闭背景音乐及音效");
      }
    }
  },
  operateShowCorrectAnswer: function () {
    app.clickSound();
    if (this.data.show_correct_answer == 0) {
      app.show_correct_answer = 1;
      wx.removeStorageSync("close_show_correct_answer");
      this.setData({
        show_correct_answer: 1,
      });
      showToast("答错后将显示正确答案");
    } else {
      wx.setStorageSync("close_show_correct_answer", 1);
      app.show_correct_answer = 0;
      this.setData({
        show_correct_answer: 0,
      });
      showToast("答错后将不再显示正确答案");
    }
  },
  operateShowAnalysis: function () {
    app.clickSound();
    if (this.data.show_analysis == 0) {
      app.show_analysis = 1;
      wx.removeStorageSync("close_show_analysis");
      this.setData({
        show_analysis: 1,
      });
      showToast("作答之后将显示答案解析（如果有解析）");
    } else {
      wx.setStorageSync("close_show_analysis", 1);
      app.show_analysis = 0;
      this.setData({
        show_analysis: 0,
      });
      showToast("作答之后将不显示答案解析");
    }
  },
  /**
   * 生命周期函数--监听页面初次渲染完成
   */
  onReady() {},

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
  onShareAppMessage() {},
  onTabItemTap: function () {
    app.clickSound();
  },
});
