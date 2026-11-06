// pages/wrong/wrong.js
const app = getApp();
import { httpDELETE, httpGET, showToast } from "../../utils/util";
import { getSessionIdentity } from "../../utils/auth-session";
Page({
  data: {
    question_list: [],
    no_more_data: 0,
    page: 0,
    size: 12,
    loading_str: "",
    view_state: "loading",
    error_message: "",
    more_error: "",
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
    this._generation = 0;
    this._visible = true;
    this._disposed = false;
    this._owner = getSessionIdentity();
    this.refreshList();
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
  isHistoryCurrent(owner, generation) {
    return (
      !this._disposed &&
      this._visible &&
      this._owner === owner &&
      owner === getSessionIdentity() &&
      generation === this._generation
    );
  },
  refreshList() {
    this._deleteRefreshOwner = null;
    this._deleteIntent = null;
    if (this.popup) this.popup.hidePopup();
    this._generation = (this._generation || 0) + 1;
    this._listFlight = null;
    this._owner = getSessionIdentity();
    this.setData({
      question_list: [],
      page: 0,
      no_more_data: 0,
      loading_str: "",
      view_state: this._owner ? "loading" : "logged-out",
      error_message: "",
      more_error: "",
      show_answer_ids: [],
    });
    if (!this._owner) {
      wx.stopPullDownRefresh();
      return;
    }
    return this.getWrongQuestion(1);
  },
  async getWrongQuestion(page = this.data.page + 1) {
    if (this._disposed || !this._visible || this._listFlight || !this._owner)
      return;
    const owner = this._owner,
      generation = this._generation,
      flight = {};
    this._listFlight = flight;
    this.setData({ loading_str: "加载中...", more_error: "" });
    try {
      const response = await httpGET("api/question/wrong-question-list", {
        page,
        size: this.data.size,
      });
      if (!this.isHistoryCurrent(owner, generation)) return;
      const result = response && response.data;
      if (!result || Number(result.code) !== 10000)
        throw Error((result && result.message) || "加载失败，请重试");
      const rows = result.data;
      if (!Array.isArray(rows)) throw Error("列表数据异常，请重试");
      const items = rows.map((item) => {
        const options = Array.isArray(item.options)
          ? item.options.slice()
          : String(item.options || "").split("|");
        const first = options.find((option) => option) || "";
        const [content, question_image = ""] = String(item.content || "").split(
          "###",
        );
        return {
          ...item,
          options,
          option_type: first.startsWith("https://bucket-1256650966") ? 1 : 0,
          content: content.replace(/\n\n/g, "\n"),
          question_image,
        };
      });
      const previous = page === 1 ? [] : this.data.question_list;
      const next = previous.concat(items);
      this.setData({
        question_list: next,
        page,
        no_more_data: rows.length < this.data.size ? 1 : 0,
        view_state: next.length ? "ready" : "empty",
        error_message: "",
      });
    } catch (error) {
      if (!this.isHistoryCurrent(owner, generation)) return;
      const message = (error && error.message) || "网络异常，请重试";
      if (page === 1)
        this.setData({ view_state: "error", error_message: message });
      else this.setData({ more_error: message });
    } finally {
      if (this._listFlight === flight) {
        this._listFlight = null;
        if (this.isHistoryCurrent(owner, generation)) {
          this.setData({ loading_str: "" });
          wx.stopPullDownRefresh();
        } else if (
          !this._disposed &&
          this._visible &&
          generation === this._generation &&
          this._owner === owner &&
          getSessionIdentity() !== owner
        ) {
          this.refreshList();
        }
      }
    }
  },
  retryList() {
    app.clickSound();
    return this.refreshList();
  },
  retryMore() {
    app.clickSound();
    return this.getWrongQuestion(this.data.page + 1);
  },
  loginAndLoad() {
    app.clickSound();
    return app.checkLogin(() => {
      if (this._visible && !this._disposed) this.refreshList();
    });
  },
  longpressQuestion: function (e) {
    app.clickSound();
    var id = e.mark.i;
    var i = e.mark.ii;
    if (this._deleting || this._listFlight) return;
    this._deleteIntent = {
      id,
      owner: this._owner,
      generation: this._generation,
    };
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
    const ids = this.data.show_answer_ids.includes(id)
      ? this.data.show_answer_ids.filter((value) => value !== id)
      : this.data.show_answer_ids.concat(id);
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
  onFeedbackClosed() {
    this.setData({ show_feedback: false });
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
    app.clickSound();
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
  onShow() {
    this._visible = true;
    if (typeof wx.hideShareMenu === "function")
      wx.hideShareMenu({ menus: ["shareAppMessage", "shareTimeline"] });
    if (
      this._owner !== getSessionIdentity() ||
      this._deleteRefreshOwner === getSessionIdentity() ||
      (this.data.view_state === "loading" && !this._listFlight)
    )
      return this.refreshList();
  },

  /**
   * 生命周期函数--监听页面隐藏
   */
  onHide() {
    this._deleteIntent = null;
    if (this.popup) this.popup.hidePopup();
    this._visible = false;
    this._generation = (this._generation || 0) + 1;
    this._listFlight = null;
    this.setData({ loading_str: "" });
  },

  /**
   * 生命周期函数--监听页面卸载
   */
  onUnload() {
    this._disposed = true;
    this.onHide();
  },

  /**
   * 页面相关事件处理函数--监听用户下拉动作
   */
  onPullDownRefresh() {
    return this.refreshList();
  },

  /**
   * 页面上拉触底事件的处理函数
   */
  onReachBottom() {
    if (
      this.data.view_state === "ready" &&
      !this.data.no_more_data &&
      !this.data.more_error &&
      !this._listFlight
    )
      return this.getWrongQuestion(this.data.page + 1);
  },

  reconcileWrongDeletion(owner, message) {
    if (this._disposed || owner !== getSessionIdentity()) return;
    this._deleteRefreshOwner = owner;
    if (this._visible) {
      if (message) showToast(message);
      return this.refreshList();
    }
  },
  popupConfirm: function () {
    this.popup.hidePopup();
    const intent = this._deleteIntent;
    this._deleteIntent = null;
    if (
      !intent ||
      this._deleting ||
      !this.isHistoryCurrent(intent.owner, intent.generation) ||
      !this.data.question_list.some((item) => item.id === intent.id)
    )
      return;
    this._deleting = true;
    return httpDELETE("api/question/delete-wrong-question", { id: intent.id })
      .then((res) => {
        if (this._disposed || intent.owner !== getSessionIdentity()) return;
        if (!res || !res.data || Number(res.data.code) !== 10000)
          return this.reconcileWrongDeletion(
            intent.owner,
            (res && res.data && res.data.message) || "删除结果暂未确认，请重试",
          );
        if (res.data.data && res.data.data.result) {
          // A write affects the current offset even if it started in an older view.
          return this.reconcileWrongDeletion(intent.owner, "删除成功");
        }
        if (this.isHistoryCurrent(intent.owner, intent.generation))
          showToast("删除失败");
      })
      .catch(() =>
        this.reconcileWrongDeletion(
          intent.owner,
          "删除结果暂未确认，正在重新加载",
        ),
      )
      .finally(() => {
        this._deleting = false;
      });
  },
  popupCancel: function () {
    this._deleteIntent = null;
    this.popup.hidePopup();
  },
  openWrongQuestionPoster(e) {
    const question = this.data.question_list[e.mark.ii];
    if (!question || !question.question_id) {
      showToast("题目信息暂不可用");
      return;
    }
    app.clickSound();
    this.selectComponent("#question-poster").open({
      id: Number(question.question_id),
      content: question.content,
      options: question.options,
      question_image: question.question_image,
      option_type: question.option_type,
    });
  },
  previewImg: function (e) {
    app.clickSound();
    var src = e.currentTarget.dataset.image_src;
    wx.previewImage({
      current: src,
      urls: [src],
    });
  },
  catchtouchmove: function () {},
});
