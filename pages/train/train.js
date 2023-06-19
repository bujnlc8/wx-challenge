const app = getApp();
import { shareGetCoin } from "../../utils/util";

Page({
  /**
   * 页面的初始数据
   */
  data: {},
  goToTrain: function () {
    app.clickSound();
    app.checkLogin(this.goToChallenge);
  },
  goToChallenge: function () {
    wx.navigateTo({
      url: "/pages/training/training",
    });
  },
  /**
   * 生命周期函数--监听页面加载
   */
  onLoad() {
    wx.setNavigationBarTitle({
      title: "练习",
    });
  },

  /**
   * 生命周期函数--监听页面初次渲染完成
   */
  onReady() {},

  /**
   * 生命周期函数--监听页面显示
   */
  onShow() {},

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
      title: "知识练了才会熟！",
      path: "pages/train/train",
      imageUrl: "../../images/share.png",
    };
  },
  onShareTimeline() {
    shareGetCoin();
    return {
      title: "有知识真的能为所欲为！和我一起变强大吧:)",
      imageUrl: "../../images/share.png",
    };
  },
  onTabItemTap: function () {
    app.clickSound();
  },
});
