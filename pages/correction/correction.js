import { showToast } from "../../utils/util";
Page({
  data: { question_id: 0, invalid: false },
  onLoad(options) {
    const raw = options && options.question_id;
    const id = Number(raw);
    if (!/^\d+$/.test(String(raw)) || !Number.isSafeInteger(id) || id <= 0) {
      this.setData({ invalid: true });
      return;
    }
    this.setData({ question_id: id });
  },
  onReady() {
    const form = this.selectComponent("#correction-form");
    if (form) form.getCaptcha();
  },
  onShow() {
    if (typeof wx.hideShareMenu === "function")
      wx.hideShareMenu({ menus: ["shareAppMessage", "shareTimeline"] });
  },
  onFormClosed(event) {
    if (this._closing) return;
    this._closing = true;
    const submitted = !!(event && event.detail && event.detail.submitted);
    wx.navigateBack({
      delta: 1,
      success: () => {
        if (submitted) showToast("纠错已提交，感谢你的帮助");
      },
      fail: () => {
        this._closing = false;
        wx.switchTab({ url: "/pages/index/index" });
      },
    });
  },
  onUnload() {
    const channel = this.getOpenerEventChannel();
    if (channel && typeof channel.emit === "function")
      channel.emit("correctionClosed");
  },
});
