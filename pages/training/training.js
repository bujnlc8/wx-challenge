// pages/answer/answer.js
const app = getApp();
import { httpPOST, shareGetCoin, showToast } from "../../utils/util";
Page({
  data: {
    questions: [],
    current_question_id: 0,
    total_index: 0,
    current_index: 0,
    current_question: "",
    count_down: 0,
    option_a: "",
    option_b: "",
    option_c: "",
    option_d: "",
    selected_option: 0,
    interval_handle: 0,
    answer_result: -2,
    right_answer: 0,
    logined: 0,
    answered_ids: [],
    sub_button_active: "",
    hide_type: 0,
    option_type: 0,
    question_image: "",
    show_feedback: false,
    question_corrent_num: 0,
    continue_correct_num: 0,
    correct_question_ids: [],
    show_correct_answer: 1,
    count_down_stop: true,
    is_video: false,
    analysis: "",
    show_analysis: app.show_analysis,
  },
  /**
   * 生命周期函数--监听页面加载
   */
  onLoad() {
    wx.setNavigationBarTitle({
      title: "练习模式",
    });
    this.getTrainingQuestions();
    this.setData({
      show_correct_answer: app.show_correct_answer,
      show_analysis: app.show_analysis,
    });
  },
  getTrainingQuestions() {
    if (!wx.getStorageSync("uid")) {
      this.setData({
        logined: 0,
      });
      showToast("请先登录");
      return;
    }
    wx.showLoading({
      title: "加载中...",
    });
    httpPOST("api/question/training-question", {
      category: app.category,
    })
      .then((res) => {
        if (res.data.code != 10000) {
          showToast(res.data.message);
          if (res.data.code == 11111) {
            wx.clearStorageSync("uid");
            this.setData({
              logined: 0,
            });
          }
        } else {
          this.setData({
            questions: this.data.questions.concat(res.data.data.list),
            logined: 1,
          });
          this.startAnswer(1);
        }
        wx.hideLoading();
      })
      .catch(() => {
        showToast("网络异常");
      });
  },
  stopCountDown: function () {
    this.setData({
      count_down_stop: true,
    });
    if (this.data.interval_handle) {
      clearInterval(this.data.interval_handle);
    }
  },
  startAnswer: function (t) {
    this.stopCountDown();
    var index = this.data.current_index;
    if (index >= this.data.questions.length) {
      this.getTrainingQuestions();
    } else {
      this._startAnswer(this.data.questions[index], t);
    }
  },
  _startAnswer: function (question, t) {
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
      count_down: 0,
      total_index: this.data.total_index + t,
      current_question: split_question[0].replaceAll("\n\n", "\n"),
      option_a: option_a,
      option_b: option_b,
      option_c: option_c,
      option_d: option_d,
      current_question_id: question.id,
      answer_result: -2,
      selected_option: 0,
      right_answer: 0,
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
    var interval_handle = setInterval(() => {
      this.setData({
        count_down: this.data.count_down + 1,
        count_down_stop: false,
      });
    }, 1000);
    this.setData({
      interval_handle: interval_handle,
      sub_button_active: "",
    });
  },
  tapOption: function (e) {
    if (this.data.answer_result == -1 || this.data.answer_result == 1) {
      app.playSound("warn");
      return;
    }
    app.playSound("select");
    this.setData({
      selected_option: e.target.dataset.i,
      sub_button_active: "",
    });
    if (this.data.answer_result == 0) {
      this.setData({
        answer_result: -2,
      });
    }
  },
  submitAnswer: function () {
    this.setData({
      sub_button_active: "sub_button_active",
    });
    if (this.data.selected_option == 0) {
      app.playSound("submit_after_select");
      showToast("选择后再提交哦");
      return;
    }
    if (this.data.answer_result == -1 || this.data.answer_result == 1) {
      app.playSound("warn");
      return;
    }
    this.stopCountDown();
    this.setData({
      answer_result: -1,
    });
    this._submitAnswer();
  },
  _submitAnswer() {
    httpPOST("api/question/check-training-question", {
      question_id: this.data.current_question_id,
      answer: this.data.selected_option,
    })
      .then((res) => {
        if (res.data.code == 10000) {
          var data = this.data.answered_ids;
          if (data.indexOf(this.data.current_question_id) == -1) {
            data.push(this.data.current_question_id);
          }
          this.setData({
            answer_result: res.data.data.result,
            right_answer: res.data.data.right_answer,
            answered_ids: data,
            analysis: res.data.data.analysis,
          });
          if (res.data.data.result == 1) {
            // setTimeout(() => {
            //   this.nextQuestion()
            // }, 2000)
            if (this.data.count_down <= 4) {
              app.quickCorrectSound();
            } else {
              app.correctSound();
            }
            if (
              this.data.correct_question_ids.indexOf(
                this.data.current_question_id
              ) == -1
            ) {
              var data = this.data.correct_question_ids;
              data.push(this.data.current_question_id);
              this.setData({
                question_corrent_num: this.data.question_corrent_num + 1,
                correct_question_ids: data,
                continue_correct_num: this.data.continue_correct_num + 1,
              });
            }
          } else {
            this.setData({
              continue_correct_num: 0,
            });
            app.wrongSound();
          }
        } else {
          app.playSound("warn");
          showToast(res.data.message);
        }
      })
      .catch(() => {
        showToast("网络异常");
      });
  },
  hideQuestion: function () {
    var body = "以后不再答此题?";
    this.stopCountDown();
    this.popup.setData({
      content: body,
    });
    this.popup.showPopup();
  },
  nextQuestion: function (check) {
    if (
      check &&
      (this.data.answer_result == -1 || this.data.answer_result == -2) &&
      this.data.answered_ids.indexOf(this.data.current_question_id) == -1
    ) {
      app.playSound("warn");
      showToast("请答完本题");
      return;
    }
    app.clickSound();
    this.stopCountDown();
    this.setData({
      current_index: this.data.current_index + 1,
    });
    this.startAnswer(1);
  },
  upQuestion: function () {
    if (this.data.current_index == 0) {
      app.playSound("warn");
      showToast("已是第一题");
      return;
    }
    app.clickSound();
    this.stopCountDown();
    this.setData({
      current_index: this.data.current_index - 1,
    });
    this.startAnswer(-1);
  },
  doFeedback: function () {
    if (this.data.answer_result == -1 || this.data.answer_result == -2) {
      app.playSound("warn");
      showToast("作答之后才能反馈哦~");
      return;
    }
    app.clickSound();
    this.setData({
      show_feedback: true,
    });
    this.report.getCaptcha();
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
    app.playBgSound();
  },

  /**
   * 生命周期函数--监听页面隐藏
   */
  onHide() {
    app.stopPlayBgSound();
  },

  /**
   * 生命周期函数--监听页面卸载
   */
  onUnload() {
    this.stopCountDown();
    app.stopPlayBgSound();
  },

  /**
   * 页面相关事件处理函数--监听用户下拉动作
   */
  onPullDownRefresh() {},

  /**
   * 页面上拉触底事件的处理函数
   */
  onReachBottom() {},
  onShareAppMessage() {
    shareGetCoin();
    return {
      title: "和我一起变强大吧！",
      path: "pages/training/training",
      imageUrl: "../../images/share.png",
    };
  },
  onShareTimeline() {
    shareGetCoin();
    return {
      title: "不止金钱能让你变强大，知识也能！",
      imageUrl: "../../images/share.png",
    };
  },
  popupCancel: function () {
    this.popup.hidePopup();
    this.startCountDown();
  },
  popupConfirm: function () {
    this.popup.hidePopup();
    httpPOST("api/question/hide", {
      id: this.data.current_question_id,
      t: 0,
    })
      .then((res) => {
        if (res.data.code != 10000) {
          showToast(res.data.message);
          return;
        }
        wx.showToast({
          title: "操作成功",
          icon: "success",
        });
        var data = this.data.questions;
        var current_index = this.data.current_index;
        data.splice(current_index, 1);
        this.setData({
          questions: data,
          current_index: current_index - 1,
        });
        this.nextQuestion(false);
      })
      .catch(() => {
        showToast("网络异常");
      });
  },
  previewImg: function (e) {
    var src = e.currentTarget.dataset.image_src;
    wx.previewImage({
      current: src,
      urls: [src],
    });
  },
});
