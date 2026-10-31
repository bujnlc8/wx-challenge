import {
  httpGET,
  httpPOST,
  showToast,
  showLoading,
  hideLoading,
} from "../../utils/util";
import {
  DAILY_TEMPLATE_ID,
  createDailySubscription,
} from "../../utils/daily-subscription";
const app = getApp();
function payload(response) {
  if (!response || response.data.code !== 10000)
    throw new Error(
      (response && response.data.message) || "暂时无法连接，请稍后重试",
    );
  return response.data.data;
}
function account() {
  return (
    String(wx.getStorageSync("uid") || "") +
    ":" +
    String(wx.getStorageSync("token") || "")
  );
}
Page({
  data: {
    view_state: "loading",
    today: null,
    enabled: false,
    credits: 0,
    pending: false,
    error_message: "",
    next_send_time: "",
  },
  onLoad() {
    this._subscriptions = createDailySubscription({
      platform: wx,
      recordAcceptance: (data) =>
        httpPOST("api/daily-challenge/reminder/accept", data).then(payload),
    });
  },
  onShow() {
    const owner = account();
    this._disposed = false;
    this._visible = true;
    if (this._owner !== owner || this._hidden) {
      this._operation = (this._operation || 0) + 1;
      const reset = { pending: false };
      if (this._owner !== owner)
        Object.assign(reset, {
          enabled: false,
          credits: 0,
          today: null,
          view_state: "loading",
        });
      this.setData(reset);
    }
    this._owner = owner;
    this._hidden = false;
    this.loadDaily();
  },
  onHide() {
    this._visible = false;
    this._hidden = true;
    this._operation = (this._operation || 0) + 1;
  },
  onUnload() {
    this._disposed = true;
    this._operation = (this._operation || 0) + 1;
  },
  isCurrent(operation, owner) {
    return (
      !this._disposed &&
      this._visible !== false &&
      operation === this._operation &&
      owner === account()
    );
  },
  async loadDaily() {
    if (this.data.pending) return;
    if (!wx.getStorageSync("uid")) {
      this.setData({ view_state: "logged-out", today: null });
      return;
    }
    const owner = account();
    const operation = (this._operation = (this._operation || 0) + 1);
    this.setData({ view_state: "loading", error_message: "" });
    const loading = showLoading({ title: "准备今日挑战" });
    try {
      const result = await Promise.all([
        httpGET("api/daily-challenge/today", {}).then(payload),
        httpGET("api/daily-challenge/reminder", {}).then(payload),
      ]);
      if (!this.isCurrent(operation, owner)) return;
      const [today, reminder] = result;
      if (
        !today ||
        !Number.isInteger(Number(today.question_id)) ||
        Number(today.question_id) <= 0
      )
        throw new Error("今日题目暂未准备好");
      this._templateId = reminder.template_id || DAILY_TEMPLATE_ID;
      this.setData({
        view_state: "ready",
        today,
        enabled: reminder.enabled === true,
        credits: Number(reminder.credits) || 0,
        next_send_time: reminder.next_send_time || "",
      });
    } catch (error) {
      if (this.isCurrent(operation, owner))
        this.setData({
          view_state: "error",
          error_message: error.message || "今日挑战暂时打不开",
        });
    } finally {
      hideLoading(loading);
    }
  },
  loginAndLoad() {
    app.checkLogin(() => this.loadDaily());
  },
  startDaily() {
    if (this.data.view_state !== "ready" || !this.data.today) return;
    wx.navigateTo({
      url:
        "/pages/answer/answer?question_id=" +
        encodeURIComponent(this.data.today.question_id),
    });
  },
  async toggleReminder(event) {
    if (this.data.view_state !== "ready" || this.data.pending) return;
    const enabled = event.detail.value === true;
    const previous = this.data.enabled;
    const owner = account();
    const operation = (this._operation = (this._operation || 0) + 1);
    // Request immediately while still inside the native switch's gesture callback.
    const subscription =
      enabled && !previous
        ? this._subscriptions.request(this._templateId).then(
            (result) => ({ result }),
            (error) => ({ error }),
          )
        : null;
    this.setData({ enabled, pending: true });
    let saveError;
    try {
      const reminder = payload(
        await httpPOST("api/daily-challenge/reminder", { enabled }),
      );
      if (this.isCurrent(operation, owner))
        this.setData({
          enabled: reminder.enabled === true,
          credits: Number(reminder.credits) || 0,
        });
    } catch (error) {
      saveError = error;
    }
    // A native request already in flight can still accept and enable the server preference.
    // Always settle it before releasing this operation and refreshing canonical settings.
    const outcome = subscription ? await subscription : null;
    if (this.isCurrent(operation, owner)) {
      if (outcome) this.notifySubscription(outcome);
      if (
        saveError &&
        !(outcome && outcome.result && outcome.result.choice === "accept")
      )
        showToast(saveError.message || "保存失败，请重试");
      this.setData({ pending: false });
      this.loadDaily();
    } else if (
      !this._disposed &&
      this._visible &&
      owner === account() &&
      !this.data.pending
    ) {
      this.loadDaily();
    }
  },

  async subscribeReminder() {
    if (this.data.view_state !== "ready" || this.data.pending) return;
    const owner = account();
    const operation = (this._operation = (this._operation || 0) + 1);
    const request = this._subscriptions.request(this._templateId);
    this.setData({ pending: true });
    try {
      const result = await request;
      if (this.isCurrent(operation, owner)) this.notifySubscription({ result });
    } catch (error) {
      if (this.isCurrent(operation, owner)) this.notifySubscription({ error });
    } finally {
      if (this.isCurrent(operation, owner)) {
        this.setData({ pending: false });
        this.loadDaily();
      }
    }
  },
  notifySubscription(outcome) {
    if (outcome.error) {
      showToast(outcome.error.message || "订阅未完成，请重试");
      return;
    }
    if (outcome.result.choice === "accept")
      showToast("已订阅下一次每日提醒", "success");
    else showToast("未允许订阅，可点击重新订阅");
  },
});
