// pages/coin/coin.js
import { httpGET, showToast } from "../../utils/util";
import { getSessionIdentity } from "../../utils/auth-session";
const app = getApp();

Page({
  data: {
    record_list: [],
    no_more_data: 0,
    page: 0,
    size: 30,
    loading_str: "",
    view_state: "loading",
    error_message: "",
    more_error: "",
  },

  /**
   * 生命周期函数--监听页面加载
   */
  onLoad() {
    this._generation = 0;
    this._visible = true;
    this._disposed = false;
    this._owner = getSessionIdentity();
    wx.setNavigationBarTitle({
      title: "百科币",
    });
    this.refreshList();
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
    this._generation = (this._generation || 0) + 1;
    this._listFlight = null;
    this._owner = getSessionIdentity();
    this.setData({
      record_list: [],
      page: 0,
      no_more_data: 0,
      loading_str: "",
      view_state: this._owner ? "loading" : "logged-out",
      error_message: "",
      more_error: "",
    });
    if (!this._owner) {
      wx.stopPullDownRefresh();
      return;
    }
    return this.getRecordList(1);
  },
  async getRecordList(page = this.data.page + 1) {
    if (this._disposed || !this._visible || this._listFlight || !this._owner)
      return;
    const owner = this._owner,
      generation = this._generation,
      flight = {};
    this._listFlight = flight;
    this.setData({ loading_str: "加载中...", more_error: "" });
    try {
      const response = await httpGET("api/coin/record", {
        page,
        size: this.data.size,
      });
      if (!this.isHistoryCurrent(owner, generation)) return;
      const result = response && response.data;
      if (!result || Number(result.code) !== 10000)
        throw Error((result && result.message) || "加载失败，请重试");
      const rows = result.data && result.data.list;
      if (!Array.isArray(rows)) throw Error("列表数据异常，请重试");
      const items = rows;
      const previous = page === 1 ? [] : this.data.record_list;
      const next = previous.concat(items);
      this.setData({
        record_list: next,
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
    return this.getRecordList(this.data.page + 1);
  },
  loginAndLoad() {
    app.clickSound();
    return app.checkLogin(() => {
      if (this._visible && !this._disposed) this.refreshList();
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
    this._visible = true;
    if (typeof wx.hideShareMenu === "function")
      wx.hideShareMenu({ menus: ["shareAppMessage", "shareTimeline"] });
    if (
      this._owner !== getSessionIdentity() ||
      (this.data.view_state === "loading" && !this._listFlight)
    )
      return this.refreshList();
  },

  /**
   * 生命周期函数--监听页面隐藏
   */
  onHide() {
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
      return this.getRecordList(this.data.page + 1);
  },
});
