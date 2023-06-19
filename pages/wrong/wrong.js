// pages/wrong/wrong.js
const app = getApp();
import { httpDELETE, httpGET, shareGetCoin, showToast } from "../../utils/util";
Page({
  data: {
    question_list: [],
    no_more_data: 0,
    page: 1,
    size: 12,
    loading_str: "",
    show_tip: 1,
    show_answer_ids: [],
    delete_id: 0,
    delete_index: -1,
    show_feedback: false,
    current_question_id: 0,
    show_analysis: false,
    analysis: "",
  },

  /**
   * 生命周期函数--监听页面加载
   */
  onLoad() {
    this.getWrongQuestion();
    wx.setNavigationBarTitle({
      title: "错题集",
    });
    if (wx.getStorageSync("wrong_show_tip")) {
      this.setData({
        show_tip: 0,
      });
    } else {
      wx.setStorage({
        key: "wrong_show_tip",
        data: 1,
      });
    }
  },
  getWrongQuestion: function () {
    this.setData({
      loading_str: "加载中...",
    });
    httpGET("api/question/wrong-question-list", {
      page: this.data.page,
      size: this.data.size,
    })
      .then((res) => {
        wx.stopPullDownRefresh();
        this.setData({
          loading_str: "",
        });
        if (res.data.code != 10000) {
          showToast(res.data.message);
          return;
        }
        res.data.data.forEach((item) => {
          item.options = item.options.split("|");
          item.option_type = item.options[0].startsWith(
            "https://bucket-1256650966"
          )
            ? 1
            : 0;
          var split_content = item.content.split("###");
          item.content = split_content[0].replaceAll("\n\n", "\n");
          item.question_image =
            split_content.length > 1 ? split_content[1] : "";
        });
        this.setData({
          question_list: this.data.question_list.concat(res.data.data),
        });
        if (
          res.data.data.length == 0 ||
          res.data.data.length < this.data.size
        ) {
          this.setData({
            no_more_data: 1,
          });
        }
      })
      .catch(() => {
        wx.stopPullDownRefresh();
        showToast("网络异常");
      });
  },
  longpressQuestion: function (e) {
    var id = e.mark.i;
    var i = e.mark.ii;
    this.setData({
      delete_id: id,
      delete_index: i,
    });
    this.popup.setData({
      content: "是否确认删除第" + (i + 1) + "题？",
      show_modal: true,
    });
    this.popup.showPopup();
  },
  closeTip: function () {
    app.clickSound();
    this.setData({
      show_tip: 0,
    });
    wx.setStorage({
      key: "wrong_show_tip",
      data: 1,
    });
  },
  showAnswer: function (e) {
    var id = e.mark.i;
    var ids = this.data.show_answer_ids;
    if (ids.indexOf(id) >= 0) {
      ids.pop(id);
    } else {
      ids.push(id);
    }
    this.setData({
      show_answer_ids: ids,
    });
    app.playSound("select");
  },
  reportErr: function (e) {
    app.clickSound();
    var i = e.mark.ii;
    var question = this.data.question_list[i];
    this.setData({
      show_feedback: true,
      current_question_id: question.question_id,
    });
    this.report.getCaptcha();
  },
  showAnalysis: function (e) {
    app.clickSound();
    var i = e.mark.ii;
    var question = this.data.question_list[i];
    this.setData({
      show_analysis: true,
      analysis: question.analysis,
    });
  },
  closeAnalysis: function () {
    this.setData({
      show_analysis: false,
      analysis: "",
    });
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
  onPullDownRefresh() {
    this.setData({
      question_list: [],
      no_more_data: 0,
      page: 1,
      size: 12,
      loading_str: "",
      show_tip: 1,
      show_answer_ids: [],
      delete_id: 0,
      delete_index: -1,
      show_feedback: false,
      current_question_id: 0,
    });
    this.onLoad();
  },

  /**
   * 页面上拉触底事件的处理函数
   */
  onReachBottom() {
    if (this.data.no_more_data == 0) {
      this.setData({
        page: this.data.page + 1,
      });
      this.getWrongQuestion();
    }
  },

  /**
   * 用户点击右上角分享
   */
  onShareAppMessage() {
    shareGetCoin();
  },
  popupConfirm: function () {
    this.popup.hidePopup();
    var id = this.data.delete_id;
    var i = this.data.delete_index;
    httpDELETE("api/question/delete-wrong-question", {
      id: id,
    })
      .then((res) => {
        if (res.data.code != 10000) {
          showToast(res.data.message);
          return;
        }
        if (res.data.data.result) {
          showToast("删除成功");
          var data = this.data.question_list;
          data.splice(i, 1);
          this.setData({
            question_list: data,
          });
        } else {
          showToast("删除失败");
        }
      })
      .catch(() => {
        showToast("网络异常");
      });
  },
  popupCancel: function () {
    this.popup.hidePopup();
  },
  previewImg: function (e) {
    var src = e.currentTarget.dataset.image_src;
    wx.previewImage({
      current: src,
      urls: [src],
    });
  },
  catchtouchmove: function () {},
});
