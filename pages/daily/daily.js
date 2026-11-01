import { getSessionIdentity, clearAuthSession } from "../../utils/auth-session";
import { buildActivityCalendar } from "../../utils/activity-calendar";
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
    throw new Error(
      (response && response.data && response.data.message) ||
        "暂时无法连接，请稍后重试",
    );
  return response.data.data;
}
function account() {
  return getSessionIdentity();
}
Page({
  data: {
    view_state: "loading",
    today: null,
    daily_action_label: "开始今日挑战",
    enabled: false,
    credits: 0,
    pending: false,
    error_message: "",
    next_send_time: "",
    activity_state: "loading",
    activity: null,
    activity_selected: null,
    activity_scroll_target: "",
  },
  onLoad() {
    this.initializeSubscriptions();
  },
  initializeSubscriptions() {
    this._subscriptions = createDailySubscription({
      platform: wx,
      recordAcceptance: (data) =>
        httpPOST("api/daily-challenge/reminder/accept", data).then(payload),
    });
  },
  expireDailySession(owner) {
    if (this._disposed || this._visible === false || owner !== account())
      return;
    clearAuthSession();
    this._operation = (this._operation || 0) + 1;
    this._activityOperation = (this._activityOperation || 0) + 1;
    this._loginOperation = (this._loginOperation || 0) + 1;
    this._owner = account();
    this._templateId = null;
    this.setData({
      view_state: "logged-out",
      today: null,
      enabled: false,
      credits: 0,
      pending: false,
      error_message: "",
      next_send_time: "",
      activity_state: "idle",
      activity: null,
      activity_selected: null,
      activity_scroll_target: "",
    });
  },
  onShow() {
    if (typeof wx.hideShareMenu === "function") {
      wx.hideShareMenu({ menus: ["shareAppMessage", "shareTimeline"] });
    }
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
          activity_state: "loading",
          activity: null,
          activity_selected: null,
        });
      this.setData(reset);
    }
    this._owner = owner;
    this._hidden = false;
    this.loadDaily();
    this.loadActivity();
  },
  onHide() {
    this._visible = false;
    this._hidden = true;
    this._operation = (this._operation || 0) + 1;
  },
  onUnload() {
    this._disposed = true;
    this._activityOperation = (this._activityOperation || 0) + 1;
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
  async loadDaily(event) {
    if (this.data.pending) return;
    if (event && event.type === "tap") app.clickSound();
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
      if (
        Object.prototype.hasOwnProperty.call(today, "completed") &&
        typeof today.completed !== "boolean"
      )
        throw new Error("今日完成状态暂时不可用");
      this._templateId = reminder.template_id || DAILY_TEMPLATE_ID;
      this.setData({
        view_state: "ready",
        today: { ...today, completed: today.completed === true },
        daily_action_label:
          today.completed === true ? "再答一次" : "开始今日挑战",
        enabled: reminder.enabled === true,
        credits: Number(reminder.credits) || 0,
        next_send_time: reminder.next_send_time || "",
      });
    } catch (error) {
      if (this.isCurrent(operation, owner)) {
        if (error.authentication) this.expireDailySession(owner);
        else
          this.setData({
            view_state: "error",
            today: null,
            error_message: error.message || "今日挑战暂时打不开",
          });
      }
    } finally {
      hideLoading(loading);
    }
  },
  async loadActivity(event) {
    if (event && event.type === "tap") app.clickSound();
    const owner = account();
    const operation = (this._activityOperation =
      (this._activityOperation || 0) + 1);
    if (!wx.getStorageSync("uid")) {
      this.setData({
        activity_state: "idle",
        activity: null,
        activity_selected: null,
      });
      return;
    }
    const current = () =>
      !this._disposed &&
      this._visible !== false &&
      operation === this._activityOperation &&
      owner === account();
    this.setData({ activity_state: "loading" });
    try {
      const result = payload(
        await httpGET("api/daily-challenge/activity", { days: 365 }),
      );
      const activity = buildActivityCalendar(result);
      if (!current()) return;
      this.setData(
        {
          activity_state: "ready",
          activity,
          activity_selected: activity.today,
          activity_scroll_target: "",
        },
        () => {
          if (current())
            this.setData({ activity_scroll_target: "activity-today" });
        },
      );
    } catch (error) {
      if (current()) {
        if (error.authentication) this.expireDailySession(owner);
        else
          this.setData({
            activity_state: "error",
            activity: null,
            activity_selected: null,
          });
      }
    }
  },
  selectActivityDay(event) {
    if (!this.data.activity) return;
    const date = event.currentTarget.dataset.date;
    for (const week of this.data.activity.weeks) {
      const day = week.days.find((item) => item.date === date && item.in_range);
      if (day) {
        app.clickSound();
        this.setData({ activity_selected: day });
        return;
      }
    }
  },
  loginAndLoad() {
    app.clickSound();
    const login = (this._loginOperation = (this._loginOperation || 0) + 1);
    app.checkLogin(() => {
      if (
        this._disposed ||
        this._visible === false ||
        login !== this._loginOperation
      )
        return;
      this._owner = account();
      this._operation = (this._operation || 0) + 1;
      this._activityOperation = (this._activityOperation || 0) + 1;
      this.initializeSubscriptions();
      this.setData({ pending: false });
      this.loadDaily();
      this.loadActivity();
    });
  },
  startDaily() {
    if (this.data.view_state !== "ready" || !this.data.today) return;
    app.clickSound();
    wx.navigateTo({
      url:
        "/pages/single/single?question_id=" +
        encodeURIComponent(this.data.today.question_id) +
        "&from=daily",
    });
  },
  async toggleReminder(event) {
    if (this.data.view_state !== "ready" || this.data.pending) return;
    app.clickSound();
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
      if (error.authentication && this.isCurrent(operation, owner)) {
        this.expireDailySession(owner);
        return;
      }
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
    app.clickSound();
    const owner = account();
    const operation = (this._operation = (this._operation || 0) + 1);
    const request = this._subscriptions.request(this._templateId);
    this.setData({ pending: true });
    try {
      const result = await request;
      if (this.isCurrent(operation, owner)) this.notifySubscription({ result });
    } catch (error) {
      if (this.isCurrent(operation, owner)) {
        if (error.authentication) this.expireDailySession(owner);
        else this.notifySubscription({ error });
      }
    } finally {
      if (this.isCurrent(operation, owner)) {
        this.setData({ pending: false });
        this.loadDaily();
      }
    }
  },
  notifySubscription(outcome) {
    if (outcome.error && outcome.error.authentication) {
      this.expireDailySession(account());
      return;
    }
    if (outcome.error) {
      showToast(outcome.error.message || "订阅未完成，请重试");
      return;
    }
    if (outcome.result.choice === "accept")
      showToast("已订阅下一次每日提醒", "success");
    else showToast("未允许订阅，可点击重新订阅");
  },
});
