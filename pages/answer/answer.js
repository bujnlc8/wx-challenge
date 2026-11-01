import { getSessionIdentity, clearAuthSession } from "../../utils/auth-session";
import {
  createDailyReminder,
  reminderSettings,
} from "../../utils/daily-reminder";
import { parseQuestionEntry } from "../../utils/question-entry";
import { getChallengeQuestionCount } from "../../utils/challenge-settings";
// pages/answer/answer.js
const app = getApp();
import {
  httpPOST,
  httpGET,
  showToast,
  showLoading,
  hideLoading,
} from "../../utils/util";

function challengeAccount() {
  return getSessionIdentity();
}

Page({
  initializeDailyReminder() {
    this._unloaded = false;
    this._dailyReminder = createDailyReminder({
      platform: wx,
      loadPreference: () =>
        httpGET("api/daily-challenge/reminder", {}).then(reminderSettings),
      recordAcceptance: (data) =>
        httpPOST("api/daily-challenge/reminder/accept", data).then(
          reminderSettings,
        ),
      onNativeOpen: () => {
        this._subscriptionPanelOpen = true;
      },
      onNativeSettled: () => {
        this._subscriptionPanelOpen = false;
        this.resumeDailyAdvance();
        this.resumeCorrectionPrompt();
        this.resumeFailurePrompt();
      },
    });
    this._dailyReminder.refresh();
  },
  promptDailyReminder() {
    const option = Number(this.data.selected_option);
    if (
      this._unloaded ||
      !Number.isInteger(option) ||
      option < 1 ||
      option > 4 ||
      !this.data[
        ["option_a", "option_b", "option_c", "option_d"][option - 1]
      ] ||
      !(Number(this.data.current_question_id) > 0)
    )
      return;
    if (this._dailyReminder) this._dailyReminder.prompt();
  },
  data: {
    questions: [],
    entry_error: "",
    current_question_id: 0,
    round_id: 0,
    total_index: 0,
    current_index: 0,
    current_score: 0,
    current_question: "",
    count_down: 30,
    option_a: "",
    option_b: "",
    option_c: "",
    option_d: "",
    selected_option: 0,
    interval_handle: 0,
    answer_result: -2, // -2 未作答 -1 答案在提交 0错误 1正确
    right_answer: 0,
    chanlenge_count_seconds: 30,
    share_question_id: 0,
    logined: 0,
    last_skip_chance: 3,
    last_relive_times: 0,
    show_login: 0,
    sub_button_active: "",
    show_feedback: false,
    pop_type: 0,
    hide_type: 0,
    option_type: 0,
    question_image: "",
    correct_question_num: 0,
    show_correct_answer: 1,
    continue_correct_num: 0,
    rank: 999,
    is_video: false,
    analysis: "",
    show_analysis: app.show_analysis,
    challenge_limit: 10,
    challenge_finished: false,
    challenge_finish_state: "",
  },
  /**
   * 生命周期函数--监听页面加载
   */
  onLoad(options) {
    const questionId = parseQuestionEntry(options);
    if (questionId === null) {
      this.setData({ entry_error: "题目链接无效，请重新扫码" });
      return;
    }
    if (questionId > 0) {
      this._redirecting = true;
      wx.redirectTo({
        url:
          "/pages/single/single?question_id=" +
          questionId +
          "&from=" +
          (options && options.from === "daily" ? "daily" : "share"),
      });
      return;
    }
    this._challengeOwner = challengeAccount();
    this._questionViewSequence = 0;
    this.setData({ challenge_limit: getChallengeQuestionCount() });
    this.initializeDailyReminder();
    wx.setNavigationBarTitle({ title: "挑战答题" });
    this.setData({
      show_correct_answer: app.show_correct_answer,
      show_analysis: app.show_analysis,
    });
    this.getChallengeQuestions();
  },
  toLogin: function () {
    app.clickSound();
    app.checkLogin(this.getChallengeQuestions);
  },
  getChallengeQuestions() {
    if (this._unloaded || this.data.challenge_finished || this._questionLoad)
      return;
    if (!wx.getStorageSync("uid")) {
      this.setData({
        logined: 0,
        show_login: 1,
      });
      showToast("请点击登录");
      return;
    }
    const load = { owner: this._challengeOwner || challengeAccount() };
    this._questionLoad = load;
    const current = () =>
      this._questionLoad === load &&
      !this._unloaded &&
      !this.data.challenge_finished &&
      (!load.owner || load.owner === challengeAccount());
    const loading = showLoading({
      title: "加载中...",
    });
    httpPOST("api/question/start-challenge", {
      round_id: this.data.round_id,
      question_id: this.data.share_question_id,
      category: app.category,
    })
      .then((res) => {
        if (!current()) return;
        if (res.data.code != 10000) {
          showToast(res.data.message);
          if (this.data.share_question_id > 0 && res.data.code != 11111)
            this.setData({
              entry_error: res.data.message || "题目暂时不可用",
              logined: 0,
              show_login: 0,
            });
          if (res.data.code == 11111) {
            clearAuthSession();
            this.setData({
              logined: 0,
              show_login: 1,
            });
          }
        } else {
          this.setData({
            questions: res.data.data.list,
            round_id: res.data.data.round_id,
            current_index: 0,
            logined: 1,
            show_login: 0,
            last_skip_chance: res.data.data.last_skip_chance,
            last_relive_times: res.data.data.last_relive_times,
            chanlenge_count_seconds: res.data.data.timeout,
          });
          this.startAnswer();
        }
      })
      .catch(() => {
        if (current()) showToast("网络异常");
      })
      .finally(() => {
        hideLoading(loading);
        if (this._questionLoad === load) this._questionLoad = null;
      });
  },
  resumeDailyAdvance() {
    if (
      !this._advanceAfterSubscription ||
      this._subscriptionPanelOpen ||
      this._unloaded ||
      this._pageVisible === false ||
      this.data.show_feedback ||
      this.data.answer_result != 1
    )
      return;
    this._advanceAfterSubscription = false;
    this.startAnswer();
  },
  startAnswer: function () {
    if (
      this._unloaded ||
      this.data.challenge_finished ||
      (this._dailyReminder && !this._dailyReminder.isCurrentAccount())
    )
      return;
    if (this.data.total_index >= this.data.challenge_limit) {
      this.finishChallenge();
      return;
    }
    if (
      this.data.answer_result == 1 &&
      (this._subscriptionPanelOpen || this._pageVisible === false)
    ) {
      this._advanceAfterSubscription = true;
      return;
    }
    if (this.data.show_feedback && this.data.answer_result == 1) return;
    if (this._posterOpen && this.data.answer_result == 1) {
      this._advanceAfterPoster = true;
      return;
    }
    if (this.data.interval_handle) {
      clearInterval(this.data.interval_handle);
    }
    var index = this.data.current_index;
    if (index >= this.data.questions.length) {
      this.getChallengeQuestions();
    } else {
      this._startAnswer(this.data.questions[index]);
    }
  },
  _startAnswer: function (question) {
    this._pendingFailurePrompt = null;
    this._questionViewSequence = (this._questionViewSequence || 0) + 1;
    this._advanceAfterSubscription = false;
    this._advanceAfterPoster = false;
    this._posterOpen = false;
    const poster = this.selectComponent("#question-poster");
    if (poster) poster.close("question-change");
    var options = question.options.split("|");
    var option_a = "";
    var option_b = "";
    var option_c = "";
    var option_d = "";
    if (options[0]) {
      option_a = options[0];
    }
    if (options[1]) {
      option_b = options[1];
    }
    if (options[2]) {
      option_c = options[2];
    }
    if (options[3]) {
      option_d = options[3];
    }
    var split_question = question.content.split("###");
    this.setData({
      total_index: this.data.total_index + 1,
      current_question: split_question[0].replaceAll("\n\n", "\n"),
      option_a: option_a,
      option_b: option_b,
      option_c: option_c,
      option_d: option_d,
      current_question_id: question.id,
      answer_result: -2,
      selected_option: 0,
      count_down: this.data.chanlenge_count_seconds,
      right_answer: 0,
      show_feedback: false,
      feedback_remark: "",
      pop_type: 0,
      hide_type: 0,
      option_type: option_a.startsWith("https://bucket-1256650966") ? 1 : 0,
      question_image: split_question.length > 1 ? split_question[1] : "",
      is_video:
        split_question.length > 1 && split_question[1].indexOf(".mp4") != -1
          ? true
          : false,
      analysis: "",
    });
    this.startCountDown();
  },
  startCountDown: function () {
    var that = this;
    var interval_handle = setInterval(() => {
      var c = that.data.count_down - 1;
      if (c <= 0) {
        clearInterval(interval_handle);
        that._submitAnswer(1);
      }
      if (c >= 0) {
        if (c <= 9 && c >= 1) {
          app.playSound(c + "");
        }
        that.setData({
          count_down: c,
        });
      }
    }, 1000);
    this.setData({
      interval_handle: interval_handle,
      sub_button_active: "",
    });
  },
  tapOption: function (e) {
    if (this.data.answer_result != -2) {
      app.playSound("warn");
      return;
    }
    const option = Number((e.currentTarget || e.target).dataset.i);
    if (
      !Number.isInteger(option) ||
      option < 1 ||
      option > 4 ||
      !this.data[["option_a", "option_b", "option_c", "option_d"][option - 1]]
    )
      return;
    app.playSound("select");
    this.setData({
      selected_option: option,
      sub_button_active: "",
    });
  },
  submitAnswer: function () {
    this.setData({
      sub_button_active: "sub_button_active",
    });
    if (this.data.answer_result != -2) {
      app.playSound("warn");
      return;
    }
    if (this.data.selected_option == 0) {
      app.playSound("submit_after_select");
      showToast("选择后再提交哦");
      return;
    }
    app.clickSound();
    this.setData({
      answer_result: -1,
    });
    if (this.data.interval_handle) {
      clearInterval(this.data.interval_handle);
    }
    this.promptDailyReminder();
    this._submitAnswer(0);
  },
  _submitAnswer(timeout) {
    if (
      this._pendingAnswer ||
      this._unloaded ||
      this.data.challenge_finished ||
      ![-2, -1].includes(this.data.answer_result)
    )
      return;
    const attempt = {
      question: this.data.current_question_id,
      round: this.data.round_id,
      view: this._questionViewSequence,
    };
    this._pendingAnswer = attempt;
    this.setData({ answer_result: -1 });
    httpPOST("api/question/check-answer", {
      timeout: timeout,
      count_down: this.data.count_down,
      question_id: this.data.current_question_id,
      round_id: this.data.round_id,
      answer: this.data.selected_option,
    })
      .then((res) => {
        if (
          this._unloaded ||
          this._pendingAnswer !== attempt ||
          attempt.question !== this.data.current_question_id ||
          attempt.round !== this.data.round_id ||
          attempt.view !== this._questionViewSequence ||
          (this._challengeOwner && this._challengeOwner !== challengeAccount())
        )
          return;
        if (res.data.code == 10000) {
          this.setData({
            answer_result: res.data.data.result,
            current_score: res.data.data.total_score,
            rank: res.data.data.rank,
            analysis: res.data.data.analysis,
          });
          if (res.data.data.result == 1) {
            if (res.data.data.toast) {
              showToast(res.data.data.toast);
              app.playSound("bonus");
            } else {
              if (
                this.data.count_down >=
                this.data.chanlenge_count_seconds - 2
              ) {
                app.quickCorrectSound();
              } else {
                app.correctSound();
              }
            }
            this.setData({
              current_index: this.data.current_index + 1,
              correct_question_num: this.data.correct_question_num + 1,
              continue_correct_num: this.data.continue_correct_num + 1,
            });
            if (this.data.total_index >= this.data.challenge_limit)
              this.finishChallenge();
            else this.queueNextQuestion(2000);
          } else {
            this.setData({
              right_answer: res.data.data.right_answer,
              continue_correct_num: 0,
            });
            var t = "本题未答对";
            if (timeout == 1) {
              t = "答题超时";
              app.playSound("timeout");
            } else {
              app.wrongSound();
            }
            if (this.data.total_index >= this.data.challenge_limit) {
              this.finishChallenge();
              return;
            }
            this.queueFailurePrompt(t);
          }
        } else {
          showToast(res.data.message);
        }
      })
      .catch(() => {
        showToast("网络异常");
      })
      .finally(() => {
        if (this._pendingAnswer === attempt) this._pendingAnswer = null;
      });
  },
  queueFailurePrompt(title) {
    const prompt = {
      question: this.data.current_question_id,
      round: this.data.round_id,
      view: this._questionViewSequence,
      owner: this._challengeOwner,
      title,
      relive: this.data.last_relive_times > 0,
      ready: false,
    };
    this._pendingFailurePrompt = prompt;
    if (!prompt.relive) showToast("本轮剩余复活次数为0");
    setTimeout(
      () => {
        if (this._pendingFailurePrompt !== prompt) return;
        prompt.ready = true;
        this.resumeFailurePrompt();
      },
      prompt.relive ? 1000 : 2000,
    );
  },
  resumeFailurePrompt() {
    const prompt = this._pendingFailurePrompt;
    if (!prompt) return;
    if (
      this._unloaded ||
      this.data.challenge_finished ||
      this.data.answer_result != 0 ||
      prompt.question !== this.data.current_question_id ||
      prompt.round !== this.data.round_id ||
      prompt.view !== this._questionViewSequence ||
      (prompt.owner && prompt.owner !== challengeAccount())
    ) {
      this._pendingFailurePrompt = null;
      return;
    }
    if (
      !prompt.ready ||
      this._pageVisible === false ||
      this.data.show_feedback ||
      this._posterOpen ||
      this._subscriptionPanelOpen
    )
      return;
    this._pendingFailurePrompt = null;
    if (!prompt.relive) {
      this.tryAgainPop();
      return;
    }
    this.popup.setData({
      title: prompt.title,
      content:
        "消耗1000百科币可复活，继续本轮挑战。\n本轮剩余" +
        this.data.last_relive_times +
        "次复活机会。",
      btn_no: "结束本轮",
      btn_ok: "复活继续",
      show_modal: false,
    });
    this.setData({ pop_type: 1 });
    this.popup.showPopup();
  },
  queueNextQuestion(delay) {
    const view = this._questionViewSequence;
    setTimeout(() => {
      if (
        !this._unloaded &&
        view === this._questionViewSequence &&
        !this.data.show_feedback
      )
        this.startAnswer();
    }, delay);
  },
  async finishChallenge(event) {
    if (
      this._unloaded ||
      ["saving", "done"].includes(this.data.challenge_finish_state) ||
      !(this.data.round_id > 0)
    )
      return;
    if (event && event.type === "tap") app.clickSound();
    if (this.data.interval_handle) clearInterval(this.data.interval_handle);
    this._advanceAfterSubscription = false;
    this._advanceAfterPoster = false;
    this.setData({
      challenge_finished: true,
      challenge_finish_state: "saving",
    });
    this._pendingFailurePrompt = null;
    const roundId = this.data.round_id;
    const owner = this._challengeOwner;
    const current = () =>
      !this._unloaded &&
      roundId === this.data.round_id &&
      (!owner || owner === challengeAccount());
    try {
      const response = await httpPOST("api/question/finish-challenge", {
        round_id: roundId,
      });
      if (!current()) return;
      const body = response && response.data;
      const result = body && body.data;
      if (
        !body ||
        body.code !== 10000 ||
        !result ||
        result.finished !== true ||
        result.round_id !== roundId ||
        !Number.isInteger(result.total_score) ||
        !Number.isInteger(result.correct_question)
      )
        throw Error("结束状态暂未确认");
      this.setData({
        challenge_finish_state: "done",
        current_score: result.total_score,
        correct_question_num: result.correct_question,
      });
    } catch (error) {
      if (current()) this.setData({ challenge_finish_state: "error" });
    }
  },
  restartChallenge() {
    if (this.data.challenge_finish_state === "done") {
      app.clickSound();
      wx.redirectTo({ url: "/pages/answer/answer" });
    }
  },
  hideQuestion: function (e) {
    if (this.data.challenge_finished || this._unloaded) return;
    var t = e.target.dataset.t || 0;
    var body = "以后不再显示这道题？";
    if (t == 1) {
      body = "本轮跳过这道题？";
      if (this.data.last_skip_chance <= 0) {
        app.playSound("warn");
        showToast("今日跳过次数已用完");
        return;
      }
    }
    if (this.data.answer_result == 0) {
      app.playSound("warn");
      showToast("回答错误不能跳过");
      return;
    }
    if (this.data.answer_result == -1) {
      app.playSound("warn");
      showToast("答案正在提交，请稍后");
      return;
    }
    app.clickSound();
    this.popup.setData({
      title: t == 1 ? "跳过本题" : "不再显示本题",
      content: body,
      btn_no: "取消",
      btn_ok: "确认",
    });
    this.setData({
      pop_type: 3,
      hide_type: t,
    });
    this.popup.showPopup();
  },
  correctFromPopup() {
    if (
      this._unloaded ||
      this.data.answer_result !== 0 ||
      ![1, 2].includes(this.data.pop_type) ||
      !this.popup ||
      this.popup.data.flag
    )
      return;
    const data = this.popup.data;
    this._correctionPrompt = {
      question: this.data.current_question_id,
      round: this.data.round_id,
      view: this._questionViewSequence,
      owner: challengeAccount(),
      type: this.data.pop_type,
      properties: {
        title: data.title,
        content: data.content,
        btn_no: data.btn_no,
        btn_ok: data.btn_ok,
        show_modal: data.show_modal,
      },
    };
    this.popup.hidePopup();
    this.doFeedback();
  },
  resumeCorrectionPrompt() {
    const prompt = this._correctionPrompt;
    if (!prompt) return false;
    if (
      this._unloaded ||
      this.data.answer_result !== 0 ||
      prompt.question !== this.data.current_question_id ||
      prompt.round !== this.data.round_id ||
      prompt.view !== this._questionViewSequence ||
      prompt.owner !== challengeAccount()
    ) {
      this._correctionPrompt = null;
      return false;
    }
    if (
      this._pageVisible === false ||
      this.data.show_feedback ||
      this._posterOpen ||
      this._subscriptionPanelOpen
    )
      return false;
    this._correctionPrompt = null;
    this.popup.setData(prompt.properties);
    this.setData({ pop_type: prompt.type });
    if (this.popup.data.flag) this.popup.showPopup();
    return true;
  },
  doFeedback: function () {
    if (this._unloaded || !(Number(this.data.current_question_id) > 0)) return;
    app.clickSound();
    this.setData({
      show_feedback: true,
    });
    this.report.getCaptcha();
  },
  nextQuestionAfterCloseFeedback: function (event) {
    if (this._unloaded) return;
    this.setData({ show_feedback: false });
    if (
      event &&
      event.detail &&
      ["account-change", "question-change"].includes(event.detail.reason)
    ) {
      this._correctionPrompt = null;
      return;
    }
    if (this._correctionPrompt) {
      this.resumeCorrectionPrompt();
      return;
    }
    this.resumeFailurePrompt();
    if (this.data.answer_result == 1) {
      this.queueNextQuestion(1000);
    }
  },
  /**
   * 生命周期函数--监听页面初次渲染完成
   */
  onReady() {
    this.popup = this.selectComponent(".popup_compon");
    this.report = this.selectComponent(".report");
  },

  /**
   * 生命周期函数--监听页面显示
   */
  onShow() {
    if (typeof wx.hideShareMenu === "function") {
      wx.hideShareMenu({ menus: ["shareAppMessage", "shareTimeline"] });
    }
    if (this._redirecting || this._unloaded) return;
    this._pageVisible = true;
    if (this._dailyReminder) {
      this._dailyReminder.refresh();
      this._subscriptionPanelOpen = this._dailyReminder.isNativeOpen();
      if (!this._dailyReminder.isCurrentAccount())
        this._advanceAfterSubscription = false;
    }
    this.resumeDailyAdvance();
    this.resumeCorrectionPrompt();
    this.resumeFailurePrompt();
    if (
      this._advanceAfterPoster &&
      !this._posterOpen &&
      this.data.answer_result == 1
    ) {
      this._advanceAfterPoster = false;
      this.startAnswer();
    }
  },

  /**
   * 生命周期函数--监听页面隐藏
   */
  onHide() {
    this._pageVisible = false;

    app.stopInnerAudio();
  },

  /**
   * 生命周期函数--监听页面卸载
   */
  onUnload() {
    this._pageVisible = false;
    this._unloaded = true;
    this._correctionPrompt = null;
    this._pendingFailurePrompt = null;
    if (this._dailyReminder) this._dailyReminder.dispose();
    if (this.data.interval_handle) {
      clearInterval(this.data.interval_handle);
    }
    app.stopInnerAudio();
  },

  /**
   * 页面相关事件处理函数--监听用户下拉动作
   */
  onPullDownRefresh() {},

  /**
   * 页面上拉触底事件的处理函数
   */
  onReachBottom() {},

  openQuestionPoster() {
    if (this._unloaded || !(Number(this.data.current_question_id) > 0)) return;
    app.clickSound();
    this._posterOpen = true;
    this.selectComponent("#question-poster").open({
      id: Number(this.data.current_question_id),
      content: this.data.current_question,
      options: [
        this.data.option_a,
        this.data.option_b,
        this.data.option_c,
        this.data.option_d,
      ].filter((value) => value !== "" && value != null),
      question_image: this.data.question_image,
      option_type: this.data.option_type,
    });
  },
  onQuestionPosterClose(event) {
    this._posterOpen = false;
    const reason = (event && event.detail && event.detail.reason) || "user";
    if (reason === "user") this.resumeFailurePrompt();
    if (
      this._advanceAfterPoster &&
      reason === "user" &&
      this._pageVisible !== false &&
      !this._unloaded &&
      this.data.answer_result == 1
    ) {
      this._advanceAfterPoster = false;
      this.startAnswer();
    }
  },
  returnToChallenge() {
    app.clickSound();
    wx.switchTab({ url: "/pages/index/index" });
  },
  tryAgainPop: function () {
    setTimeout(() => {
      app.playSound("try_again");
    }, 150);
    this.popup.setData({
      title: "本轮挑战结束",
      content:
        "本轮得分" +
        this.data.current_score +
        "分，排名第" +
        this.data.rank +
        "名。\n再来一轮，继续挑战吧。",
      btn_no: "返回首页",
      btn_ok: "再来一轮",
      show_modal: false,
    });
    this.popup.showPopup();
    this.setData({
      pop_type: 2,
    });
  },
  popupCancel() {
    this.popup.hidePopup();
    if (this.data.pop_type == 1) {
      this.tryAgainPop();
    } else if (this.data.pop_type == 2) {
      wx.switchTab({
        url: "/pages/index/index",
      });
    }
  },
  popupConfirm() {
    this.popup.hidePopup();
    if (this.data.pop_type == 1) {
      httpPOST("api/coin/operate", {
        source: 4,
        round_id: this.data.round_id,
      })
        .then((res) => {
          if (res.data.code != 10000) {
            showToast(res.data.message);
            return;
          } else {
            if (res.data.data.result == 1) {
              app.playSound("relive");
              showToast("恭喜你，满血复活😄");
              this.setData({
                current_index: this.data.current_index + 1,
                last_relive_times: this.data.last_relive_times - 1,
              });
              this.queueNextQuestion(2000);
            } else {
              showToast("很遗憾，复活失败:(");
            }
          }
        })
        .catch(() => {
          showToast("网络异常");
        });
    } else if (this.data.pop_type == 2) {
      wx.redirectTo({
        url: "/pages/answer/answer",
      });
    } else if (this.data.pop_type == 3) {
      var t = this.data.hide_type;
      httpPOST("api/question/hide", {
        id: this.data.current_question_id,
        t: t,
      })
        .then((res) => {
          if (res.data.code != 10000) {
            showToast(res.data.message);
            return;
          }
          showToast({
            title: "操作成功",
            icon: "success",
          });
          if (this.data.interval_handle) {
            clearInterval(this.data.interval_handle);
          }
          this.setData({
            current_index: this.data.current_index + 1,
            last_skip_chance:
              t == 1
                ? this.data.last_skip_chance - 1
                : this.data.last_skip_chance,
          });
          this.startAnswer();
        })
        .catch(() => {
          showToast("网络异常");
        });
    }
  },
  previewImg: function (e) {
    app.clickSound();
    var src = e.currentTarget.dataset.image_src;
    wx.previewImage({
      current: src,
      urls: [src],
    });
  },
});
