// pages/answer/answer.js
const app = getApp();
import { httpPOST, shareGetCoin, showToast } from "../../utils/util";

Page({
  data: {
    questions: [],
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
  },
  /**
   * 生命周期函数--监听页面加载
   */
  onLoad(options) {
    wx.setNavigationBarTitle({
      title: "挑战模式",
    });
    if (options && options.question_id) {
      this.setData({
        share_question_id: options.question_id,
      });
    }
    this.setData({
      show_correct_answer: app.show_correct_answer,
      show_analysis: app.show_analysis,
    });
    this.getChallengeQuestions();
  },
  toLogin: function () {
    app.checkLogin(this.getChallengeQuestions);
  },
  getChallengeQuestions() {
    if (!wx.getStorageSync("uid")) {
      this.setData({
        logined: 0,
        show_login: 1,
      });
      showToast("请点击登录");
      return;
    }
    wx.showLoading({
      title: "加载中...",
    });
    httpPOST("api/question/start-challenge", {
      round_id: this.data.round_id,
      question_id: this.data.share_question_id,
      category: app.category,
    })
      .then((res) => {
        if (res.data.code != 10000) {
          showToast(res.data.message);
          if (res.data.code == 11111) {
            wx.clearStorageSync("uid");
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
        wx.hideLoading();
      })
      .catch(() => {
        showToast("网络异常");
      });
  },
  startAnswer: function () {
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
    app.playSound("select");
    this.setData({
      selected_option: e.target.dataset.i,
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
    this.setData({
      answer_result: -1,
    });
    if (this.data.interval_handle) {
      clearInterval(this.data.interval_handle);
    }
    this._submitAnswer(0);
  },
  _submitAnswer(timeout) {
    httpPOST("api/question/check-answer", {
      timeout: timeout,
      count_down: this.data.count_down,
      question_id: this.data.current_question_id,
      round_id: this.data.round_id,
      answer: this.data.selected_option,
    })
      .then((res) => {
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
            setTimeout(() => {
              if (!this.data.show_feedback) {
                this.startAnswer();
              }
            }, 2000);
          } else {
            this.setData({
              right_answer: res.data.data.right_answer,
              continue_correct_num: 0,
            });
            var t = "未回答正确";
            if (timeout == 1) {
              t = "回答超时";
              app.playSound("timeout");
            } else {
              app.wrongSound();
            }
            if (this.data.last_relive_times > 0) {
              setTimeout(() => {
                this.popup.setData({
                  content: t + "，原地复活？",
                  show_modal: false,
                });
                this.setData({
                  pop_type: 1,
                });
                this.popup.showPopup();
              }, 1000);
            } else {
              showToast("本轮剩余复活次数为0");
              setTimeout(() => {
                this.tryAgainPop();
              }, 2000);
            }
          }
        } else {
          showToast(res.data.message);
        }
      })
      .catch(() => {
        showToast("网络异常");
      });
  },
  hideQuestion: function (e) {
    var t = e.target.dataset.t || 0;
    var body = "以后不再答此题?";
    if (t == 1) {
      body = "本轮不答此题?";
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
      content: body,
    });
    this.setData({
      pop_type: 3,
      hide_type: t,
    });
    this.popup.showPopup();
  },
  doFeedback: function () {
    if (this.data.answer_result == -1 || this.data.answer_result == -2) {
      app.playSound("warn");
      showToast("作答之后才能反馈哦~");
      return;
    }
    app.clickSound();
    if (this.data.interval_handle) {
      clearInterval(this.data.interval_handle);
    }
    this.setData({
      show_feedback: true,
    });
    this.report.getCaptCha();
  },
  nextQuestionAfterCloseFeedback: function () {
    if (this.data.answer_result == 1) {
      setTimeout(() => {
        this.startAnswer();
      }, 1000);
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
    app.playBgSound();
  },

  /**
   * 生命周期函数--监听页面隐藏
   */
  onHide() {
    app.stopPlayBgSound();
    app.stopInnerAudio();
  },

  /**
   * 生命周期函数--监听页面卸载
   */
  onUnload() {
    if (this.data.interval_handle) {
      clearInterval(this.data.interval_handle);
    }
    app.stopInnerAudio();
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

  /**
   * 用户点击右上角分享
   */
  onShareAppMessage() {
    shareGetCoin();
    return {
      title: this.data.current_question,
      path: "pages/answer/answer?question_id=" + this.data.current_question_id,
      imageUrl: "../../images/share.png",
    };
  },
  onShareTimeline() {
    shareGetCoin();
    return {
      title: "这题有点难，进来试试呗！",
      path: "question_id=" + this.data.current_question_id,
      imageUrl: "../../images/share.png",
    };
  },
  tryAgainPop: function () {
    setTimeout(() => {
      app.playSound("try_again");
    }, 150);
    this.popup.setData({
      title: "答题结束",
      content: "恭喜你，本轮排第" + this.data.rank + "名，再挑战一次吧？",
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
              setTimeout(() => {
                this.startAnswer();
              }, 2000);
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
          wx.showToast({
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
          setTimeout(() => {
            this.startAnswer();
          }, 1000);
        })
        .catch(() => {
          showToast("网络异常");
        });
    }
  },
  previewImg: function (e) {
    var src = e.currentTarget.dataset.image_src;
    wx.previewImage({
      current: src,
      urls: [src],
    });
  },
});
