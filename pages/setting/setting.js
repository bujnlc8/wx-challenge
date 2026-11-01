const app = getApp();
import { showToast } from "../../utils/util";
import {
  DEFAULT_CHALLENGE_QUESTION_COUNT,
  MAX_CHALLENGE_QUESTION_COUNT,
  clampChallengeQuestionCountInput,
  getChallengeQuestionCount,
  parseChallengeQuestionCount,
  setChallengeQuestionCount,
} from "../../utils/challenge-settings";
import { createModalLock } from "../../utils/modal-lock";

Page({
  data: {
    sound_close: 0,
    show_correct_answer: 1,
    is_ios: app.is_ios,
    show_analysis: app.show_analysis,
    challenge_question_count: DEFAULT_CHALLENGE_QUESTION_COUNT,
    question_count_sheet_visible: false,
    question_count_draft: "",
    question_count_error: "",
    question_count_options: [10, 20, 50, 100, 150, 200, 300, 500],
    modal_locked: false,
  },

  /**
   * 生命周期函数--监听页面加载
   */
  onLoad() {
    wx.setNavigationBarTitle({
      title: "答题设置",
    });
    this._questionCountModalLock = createModalLock(this);
    this.setData({ challenge_question_count: getChallengeQuestionCount() });
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
  openQuestionCountSheet() {
    app.clickSound();
    this.setData({
      question_count_sheet_visible: true,
      question_count_draft: String(this.data.challenge_question_count),
      question_count_error: "",
    });
    this._questionCountModalLock.set(true);
  },
  chooseQuestionCount(event) {
    if (!this.data.question_count_sheet_visible) return;
    const count = parseChallengeQuestionCount(
      event.currentTarget.dataset.count,
    );
    if (count === null) return;
    app.clickSound();
    this.setData({
      question_count_draft: String(count),
      question_count_error: "",
    });
  },
  inputQuestionCount(event) {
    if (!this.data.question_count_sheet_visible) return;
    const value = clampChallengeQuestionCountInput(event.detail.value);
    this.setData({
      question_count_draft: value,
      question_count_error: "",
    });
    return value;
  },
  stepQuestionCount(event) {
    if (!this.data.question_count_sheet_visible) return;
    const step = Number(event.currentTarget.dataset.step);
    if (step !== -1 && step !== 1) return;
    app.clickSound();
    const count = parseChallengeQuestionCount(this.data.question_count_draft);
    if (count === null) {
      this.setData({ question_count_error: "请输入 1–500 的整数" });
      return;
    }
    this.setData({
      question_count_draft: String(
        Math.max(1, Math.min(MAX_CHALLENGE_QUESTION_COUNT, count + step)),
      ),
      question_count_error: "",
    });
  },
  cancelQuestionCountSheet() {
    app.clickSound();
    this.setData({
      question_count_sheet_visible: false,
      question_count_draft: String(this.data.challenge_question_count),
      question_count_error: "",
    });
    this._questionCountModalLock.set(false);
  },
  confirmQuestionCountSheet() {
    if (!this.data.question_count_sheet_visible) return;
    app.clickSound();
    const count = parseChallengeQuestionCount(this.data.question_count_draft);
    if (count === null) {
      this.setData({ question_count_error: "请输入 1–500 的整数" });
      return;
    }
    if (!setChallengeQuestionCount(count)) {
      this.setData({ question_count_error: "保存失败，请重试" });
      return;
    }
    this.setData({
      challenge_question_count: count,
      question_count_sheet_visible: false,
      question_count_error: "",
    });
    this._questionCountModalLock.set(false);
    showToast("已保存，下一次普通挑战生效");
  },
  catchtouchmove() {},
  operateSound: function () {
    if (this.data.sound_close) {
      app.sound_close = 0;
      app.clickSound();
      wx.removeStorageSync("sound_close");
      this.setData({
        sound_close: 0,
      });
      showToast("将为您播放音效提示");
    } else {
      wx.setStorageSync("sound_close", 1);
      app.sound_close = 1;
      app.stopInnerAudio();
      this.setData({
        sound_close: 1,
      });
      showToast("将为您关闭音效提示");
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
  onHide() {
    if (this._questionCountModalLock) this._questionCountModalLock.hide();
  },

  onShow() {
    if (typeof wx.hideShareMenu === "function") {
      wx.hideShareMenu({ menus: ["shareAppMessage", "shareTimeline"] });
    }
    if (this._questionCountModalLock) this._questionCountModalLock.show();
  },

  /**
   * 生命周期函数--监听页面卸载
   */
  onUnload() {
    if (this._questionCountModalLock) this._questionCountModalLock.dispose();
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
