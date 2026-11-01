import { getSessionIdentity, clearAuthSession } from "../../utils/auth-session";
import { httpGET } from "../../utils/util";
const app = getApp();

function practicePayload(response) {
  if (
    response &&
    (response.statusCode === 401 ||
      (response.data && Number(response.data.code) === 11111))
  ) {
    const error = new Error("登录已失效，请重新登录");
    error.authentication = true;
    throw error;
  }
  if (!response || !response.data || response.data.code !== 10000)
    throw new Error("今日进度暂时打不开");
  const progress = response.data.data;
  if (
    !progress ||
    !/^\d{4}-\d{2}-\d{2}$/.test(progress.date) ||
    !Number.isInteger(progress.answered_count) ||
    progress.answered_count < 0 ||
    !Number.isInteger(progress.target_count) ||
    progress.target_count <= 0 ||
    !Number.isInteger(progress.reward_coins) ||
    progress.reward_coins < 0 ||
    typeof progress.reward_received !== "boolean"
  )
    throw new Error("今日进度暂时打不开");
  return progress;
}

Page({
  /**
   * 页面的初始数据
   */
  data: {
    practice_progress_state: "loading",
    practice_progress: null,
    practice_progress_percent: 0,
    practice_reward_text: "",
  },
  isProgressCurrent(operation, owner) {
    return (
      !this._disposed &&
      this._visible !== false &&
      operation === this._progressOperation &&
      owner === getSessionIdentity()
    );
  },
  async loadPracticeProgress(event) {
    if (event && event.type === "tap") app.clickSound();
    const owner = getSessionIdentity();
    const operation = (this._progressOperation =
      (this._progressOperation || 0) + 1);
    this.setData({
      practice_progress_state: owner ? "loading" : "logged-out",
      practice_progress: null,
      practice_progress_percent: 0,
      practice_reward_text: "",
    });
    if (!owner) return;
    try {
      const progress = practicePayload(
        await httpGET("api/question/practice-progress", {}),
      );
      if (!this.isProgressCurrent(operation, owner)) return;
      this.setData({
        practice_progress_state: "ready",
        practice_progress: progress,
        practice_progress_percent: Math.min(
          100,
          (progress.answered_count / progress.target_count) * 100,
        ),
        practice_reward_text: progress.reward_received
          ? progress.reward_coins + "百科币已到账"
          : progress.answered_count >= progress.target_count
            ? "已达标，下次练习时自动发放奖励"
            : "练满" +
              progress.target_count +
              "道不同题目，得" +
              progress.reward_coins +
              "百科币",
      });
    } catch (error) {
      if (!this.isProgressCurrent(operation, owner)) return;
      if (error.authentication) clearAuthSession();
      this.setData({
        practice_progress_state: error.authentication ? "logged-out" : "error",
      });
    }
  },
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
  onShow() {
    this._disposed = false;
    this._visible = true;
    this.loadPracticeProgress();
    if (typeof wx.hideShareMenu === "function") {
      wx.hideShareMenu({ menus: ["shareAppMessage", "shareTimeline"] });
    }
  },

  /**
   * 生命周期函数--监听页面隐藏
   */
  onHide() {
    this._visible = false;
    this._progressOperation = (this._progressOperation || 0) + 1;
  },

  /**
   * 生命周期函数--监听页面卸载
   */
  onUnload() {
    this._disposed = true;
    this._progressOperation = (this._progressOperation || 0) + 1;
  },

  /**
   * 页面相关事件处理函数--监听用户下拉动作
   */
  onPullDownRefresh() {},

  /**
   * 页面上拉触底事件的处理函数
   */
  onReachBottom() {},

  onTabItemTap: function () {
    app.clickSound();
  },
});
