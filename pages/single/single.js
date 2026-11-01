import { getSessionIdentity, clearAuthSession } from "../../utils/auth-session";
import { httpGET, httpPOST, showToast } from "../../utils/util";
import { parseQuestionEntry } from "../../utils/question-entry";
import {
  createDailyReminder,
  reminderSettings,
} from "../../utils/daily-reminder";
import { subscriptionRequestId } from "../../utils/daily-subscription";
const app = getApp();

function account() {
  return getSessionIdentity();
}
function unauthorized(response) {
  return (
    response &&
    (response.statusCode === 401 ||
      (response.data && Number(response.data.code) === 11111))
  );
}
function questionPresentation(detail, questionId) {
  if (
    !detail ||
    Number(detail.question_id) !== questionId ||
    typeof detail.content !== "string" ||
    typeof detail.options !== "string" ||
    typeof detail.question_revision !== "string" ||
    !detail.question_revision.trim() ||
    detail.question_revision.length > 256
  )
    throw Error("指定题目暂时不可用，请稍后重试");
  const parts = detail.content.split("###");
  const options = detail.options
    .split("|")
    .map((content, index) => ({
      number: index + 1,
      label: String.fromCharCode(65 + index),
      content,
    }))
    .filter((option) => option.content.trim() !== "");
  if (!options.length || (!parts[0].trim() && !parts[1]))
    throw Error("题目内容不完整，请稍后重试");
  const first = options[0].content;
  return {
    content: parts[0].replace(/\n\n/g, "\n"),
    options,
    question_image: parts[1] || "",
    is_video: /\.(mp4|mov|webm|m3u8)(?:[?#]|$)/i.test(parts[1] || ""),
    option_type:
      first.startsWith("https://bucket-1256650966") ||
      /^https?:\/\/.*\.(png|jpe?g|gif|webp|mp4)(?:[?#]|$)/i.test(first)
        ? 1
        : 0,
  };
}
function checkedResult(detail, questionId, options) {
  const rewardCoins =
    detail && detail.reward_coins !== undefined ? detail.reward_coins : 0;
  if (
    !detail ||
    Number(detail.question_id) !== questionId ||
    ![0, 1].includes(detail.result) ||
    !(detail.result === 1 ? [1000, 100] : [0]).includes(detail.score) ||
    ![0, 1000].includes(rewardCoins) ||
    (rewardCoins > 0 && (detail.result !== 1 || detail.score !== 1000)) ||
    !options.some((option) => option.number === Number(detail.right_answer)) ||
    (detail.analysis != null && typeof detail.analysis !== "string")
  )
    throw Error("答题结果暂未确认，请重试提交");
  return {
    result: detail.result,
    right_answer: Number(detail.right_answer),
    analysis: detail.analysis || "",
    score: detail.score,
    reward_coins: rewardCoins,
  };
}
Page({
  data: {
    view_state: "loading",
    question_id: 0,
    source: "share",
    content: "",
    options: [],
    question_image: "",
    is_video: false,
    option_type: 0,
    selected_option: 0,
    phase: "question",
    result: null,
    right_answer: 0,
    analysis: "",
    score: 0,
    reward_coins: 0,
    elapsed_text: "00:00",
    error_message: "",
    submit_error: "",
    show_feedback: false,
    show_correct_answer: 1,
    show_analysis: 1,
  },
  onLoad(options) {
    this._disposed = false;
    this._visible = true;
    this._generation = 0;
    this._owner = account();
    const questionId = parseQuestionEntry(options);
    const source =
      options && options.from === "daily"
        ? "daily"
        : options && options.from === "favorite"
          ? "favorite"
          : "share";
    wx.setNavigationBarTitle({
      title:
        source === "daily"
          ? "每日一题"
          : source === "favorite"
            ? "收藏答题"
            : "单题答题",
    });
    this.setData({
      source,
      show_correct_answer: app.show_correct_answer,
      show_analysis: app.show_analysis,
    });
    if (!questionId) {
      this.setData({
        view_state: "error",
        error_message: "题目链接无效，请重新扫码",
      });
      return;
    }
    this.setData({ question_id: questionId });
    this._dailyReminder = createDailyReminder({
      platform: wx,
      loadPreference: () =>
        httpGET("api/daily-challenge/reminder", {}).then(reminderSettings),
      recordAcceptance: (body) =>
        httpPOST("api/daily-challenge/reminder/accept", body).then(
          reminderSettings,
        ),
    });
    this._dailyReminder.refresh();
    this.loadQuestion();
  },
  onShow() {
    if (typeof wx.hideShareMenu === "function") {
      wx.hideShareMenu({ menus: ["shareAppMessage", "shareTimeline"] });
    }
    if (this._disposed) return;
    this._visible = true;
    this.setData({
      show_correct_answer: app.show_correct_answer,
      show_analysis: app.show_analysis,
    });
    const current = account();
    if (this._owner !== current) {
      this._owner = current;
      this._generation++;
      this._submission = null;
      const poster = this.selectComponent("#question-poster");
      if (poster && poster.close) poster.close("account-change");
      if (this.data.question_id) this.loadQuestion();
    }
    if (this._dailyReminder) this._dailyReminder.refresh();
    this.resumeElapsedClock();
  },
  onHide() {
    this._visible = false;
    this.clearElapsedTimer();
  },
  onUnload() {
    this._disposed = true;
    this.clearElapsedTimer();
    this._elapsedStartedAt = null;
    this._generation++;
    if (this._dailyReminder) this._dailyReminder.dispose();
  },
  clearElapsedTimer() {
    if (this._elapsedTimer != null) clearInterval(this._elapsedTimer);
    this._elapsedTimer = null;
  },
  resetElapsedClock() {
    this.clearElapsedTimer();
    this._elapsedStartedAt = null;
    this._elapsedMilliseconds = 0;
    this.setData({ elapsed_text: "00:00" });
  },
  updateElapsedClock() {
    if (
      this._disposed ||
      this._owner !== account() ||
      this._elapsedStartedAt == null
    )
      return;
    this._elapsedMilliseconds = Math.max(
      this._elapsedMilliseconds || 0,
      Date.now() - this._elapsedStartedAt,
    );
    const seconds = Math.floor(this._elapsedMilliseconds / 1000);
    this.setData({
      elapsed_text:
        String(Math.floor(seconds / 60)).padStart(2, "0") +
        ":" +
        String(seconds % 60).padStart(2, "0"),
    });
  },
  resumeElapsedClock() {
    if (
      this._disposed ||
      this._visible === false ||
      this._elapsedStartedAt == null ||
      this.data.view_state !== "ready" ||
      this.data.phase !== "question"
    )
      return;
    this.clearElapsedTimer();
    this.updateElapsedClock();
    this._elapsedTimer = setInterval(() => this.updateElapsedClock(), 1000);
  },
  startElapsedClock() {
    this.resetElapsedClock();
    this._elapsedStartedAt = Date.now();
    this.resumeElapsedClock();
  },
  freezeElapsedClock() {
    this.updateElapsedClock();
    this.clearElapsedTimer();
    this._elapsedStartedAt = null;
  },
  isCurrent(generation, owner) {
    return (
      !this._disposed &&
      generation === this._generation &&
      owner === this._owner &&
      owner === account()
    );
  },
  expireSession() {
    this.resetElapsedClock();
    clearAuthSession();
    this._generation++;
    this._owner = account();
    this._submission = null;
    this._questionRevision = null;
    this.setData({
      view_state: "logged-out",
      phase: "question",
      content: "",
      options: [],
      selected_option: 0,
      result: null,
      analysis: "",
      score: 0,
      reward_coins: 0,
      submit_error: "",
      show_feedback: false,
    });
  },
  async loadQuestion(event) {
    if (this._disposed || !this.data.question_id) return;
    if (
      this._submission &&
      this._owner === account() &&
      ["submitting", "uncertain"].includes(this.data.phase)
    )
      return;
    if (event && event.type === "tap") app.clickSound();
    const generation = ++this._generation;
    const owner = account();
    this._owner = owner;
    this._submission = null;
    this._questionRevision = null;
    this.resetElapsedClock();
    this.setData({
      phase: "question",
      selected_option: 0,
      result: null,
      right_answer: 0,
      analysis: "",
      score: 0,
      reward_coins: 0,
      submit_error: "",
      show_feedback: false,
    });
    if (!wx.getStorageSync("uid") || !wx.getStorageSync("token")) {
      this.setData({ view_state: "logged-out" });
      return;
    }
    this.setData({ view_state: "loading", error_message: "" });
    try {
      const response = await httpGET("api/question/single", {
        question_id: this.data.question_id,
      });
      if (!this.isCurrent(generation, owner)) return;
      if (unauthorized(response)) {
        this.expireSession();
        return;
      }
      if (!response || !response.data || Number(response.data.code) !== 10000)
        throw Error(
          (response && response.data && response.data.message) ||
            "题目暂时无法加载，请重试",
        );
      const presentation = questionPresentation(
        response.data.data,
        this.data.question_id,
      );
      this._questionRevision = response.data.data.question_revision;
      this.setData({ ...presentation, view_state: "ready", error_message: "" });
      this.startElapsedClock();
    } catch (error) {
      if (this.isCurrent(generation, owner))
        this.setData({
          view_state: "error",
          error_message: (error && error.message) || "网络异常，请重新加载题目",
        });
    }
  },
  loginAndLoad() {
    app.clickSound();
    app.checkLogin(() => {
      if (this._disposed) return;
      this._owner = account();
      this._submission = null;
      this.loadQuestion();
      if (this._dailyReminder) this._dailyReminder.refresh();
    });
  },
  tapOption(event) {
    if (
      this.data.view_state !== "ready" ||
      this.data.phase !== "question" ||
      this._owner !== account()
    )
      return;
    const number = Number(event.currentTarget.dataset.number);
    if (!this.data.options.some((option) => option.number === number)) return;
    app.playSound("select");
    this.setData({ selected_option: number, submit_error: "" });
  },
  async submitAnswer() {
    if (
      this._disposed ||
      this._owner !== account() ||
      this.data.view_state !== "ready" ||
      ["submitting", "completed"].includes(this.data.phase)
    )
      return;
    if (!this._submission) {
      if (
        !this.data.options.some(
          (option) => option.number === this.data.selected_option,
        )
      ) {
        app.playSound("submit_after_select");
        showToast("选择后再提交哦");
        return;
      }
      this._submission = {
        question_id: this.data.question_id,
        answer: this.data.selected_option,
        request_id: subscriptionRequestId(),
        question_revision: this._questionRevision,
      };
    }
    app.clickSound();
    const payload = this._submission;
    const generation = this._generation;
    const owner = this._owner;
    const firstAttempt = this.data.phase !== "uncertain";
    this.freezeElapsedClock();
    this.setData({ phase: "submitting", submit_error: "" });
    if (firstAttempt && this._dailyReminder) this._dailyReminder.prompt();
    try {
      const response = await httpPOST("api/question/single-answer", {
        ...payload,
      });
      if (!this.isCurrent(generation, owner) || this._submission !== payload)
        return;
      if (unauthorized(response)) {
        this.expireSession();
        return;
      }
      if (!response || !response.data || Number(response.data.code) !== 10000) {
        const failure = response && response.data;
        if (
          failure &&
          Number(failure.code) === 40901 &&
          failure.data &&
          failure.data.reload_required === true &&
          failure.data.accepted === false
        ) {
          // Only this explicit server guarantee means no attempt was accepted.
          this._submission = null;
          this._questionRevision = null;
          this.resetElapsedClock();
          this.setData({
            view_state: "error",
            phase: "question",
            selected_option: 0,
            error_message:
              failure.message || "题目已更新或下架，请刷新后重新作答",
            submit_error: "",
          });
          return;
        }
        throw Error("答题结果暂未确认，请重试提交");
      }
      const result = checkedResult(
        response.data.data,
        payload.question_id,
        this.data.options,
      );
      this.setData({ ...result, phase: "completed", submit_error: "" }, () => {
        if (
          !this.isCurrent(generation, owner) ||
          this._submission !== payload ||
          this._visible === false ||
          this.data.show_feedback ||
          typeof wx.pageScrollTo !== "function"
        )
          return;
        const poster = this.selectComponent("#question-poster");
        if (!(poster && poster.data && poster.data.visible)) {
          wx.pageScrollTo({ selector: "#single-result", duration: 0 });
        }
      });
      if (this._visible !== false) {
        if (result.result === 1) app.correctSound();
        else app.wrongSound();
      }
      if (result.reward_coins > 0) {
        try {
          wx.removeStorageSync("mine_cache");
        } catch (error) {
          // Local cache failures cannot invalidate an accepted server reward.
        }
      }
    } catch (error) {
      if (this.isCurrent(generation, owner) && this._submission === payload)
        this.setData({
          phase: "uncertain",
          submit_error:
            "结果暂未确认，已保留本次答案。请重试提交，确认答题结果。",
        });
    }
  },
  openQuestionPoster() {
    if (
      this._disposed ||
      this.data.view_state !== "ready" ||
      !(Number(this.data.question_id) > 0) ||
      this._owner !== account()
    )
      return;
    app.clickSound();
    const options = Array.from(
      { length: Math.max(...this.data.options.map((option) => option.number)) },
      () => "",
    );
    this.data.options.forEach((option) => {
      options[option.number - 1] = option.content;
    });
    this.selectComponent("#question-poster").open({
      id: this.data.question_id,
      content: this.data.content,
      options,
      question_image: this.data.question_image,
      option_type: this.data.option_type,
    });
  },
  openFeedback() {
    if (
      this._disposed ||
      this.data.view_state !== "ready" ||
      !(Number(this.data.question_id) > 0) ||
      this._owner !== account()
    )
      return;
    app.clickSound();
    this.setData({ show_feedback: true });
    this.selectComponent("#single-report").getCaptcha();
  },
  onFeedbackClosed() {
    if (!this._disposed) this.setData({ show_feedback: false });
  },
  returnToSource() {
    app.clickSound();
    if (this.data.source === "favorite") {
      const pages = getCurrentPages();
      const previous = pages[pages.length - 2];
      if (previous && previous.route === "pages/favorites/favorites")
        wx.navigateBack({ delta: 1 });
      else wx.redirectTo({ url: "/pages/favorites/favorites" });
    } else if (this.data.source === "daily") {
      const pages = getCurrentPages();
      const previous = pages[pages.length - 2];
      if (previous && previous.route === "pages/daily/daily")
        wx.navigateBack({ delta: 1 });
      else wx.redirectTo({ url: "/pages/daily/daily" });
    } else wx.switchTab({ url: "/pages/index/index" });
  },
  previewQuestionImage() {
    if (this.data.question_image && !this.data.is_video) {
      app.clickSound();
      wx.previewImage({
        current: this.data.question_image,
        urls: [this.data.question_image],
      });
    }
  },
});
