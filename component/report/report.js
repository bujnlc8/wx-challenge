import { getSessionIdentity } from "../../utils/auth-session";
import { createModalLock } from "../../utils/modal-lock";
import { httpPOST, httpGET, showToast } from "../../utils/util";

const app = getApp();
function feedbackAccount() {
  return getSessionIdentity();
}
Component({
  properties: {
    show_feedback: {
      type: Boolean,
      value: true,
    },
    question_id: {
      type: Number,
      value: 0,
    },
  },
  /**
   * 组件的初始数据
   */
  data: {
    captcha_image: "",
    captcha_token: "",
    feedback_remark: "",
    feedback_checked_value: [],
    captcha_data: "",
    submit_pending: false,
  },
  observers: {
    "show_feedback, question_id"() {
      this.syncFeedbackSession();
      if (
        this._captchaAwaitingVisible &&
        this.data.show_feedback &&
        !this._reportHidden
      ) {
        this._captchaAwaitingVisible = false;
        this.getCaptcha();
      }
    },
  },
  lifetimes: {
    attached() {
      this._modalLock = createModalLock();
      this._reportAttached = true;
      this._reportDisposed = false;
      this._reportHidden = false;
      this._reportGeneration = 0;
      this._captchaSequence = 0;
      this.syncFeedbackSession();
    },
    detached() {
      this._reportDisposed = true;
      this._captchaAwaitingVisible = false;
      this._reportGeneration++;
      this._captchaSequence++;
      this._pendingFeedback = null;
      if (this._modalLock) this._modalLock.dispose();
    },
  },
  pageLifetimes: {
    show() {
      const restoring = this._reportHidden && this.data.show_feedback;
      this._reportHidden = false;
      this.syncFeedbackSession();
      if (this._modalLock) this._modalLock.show();
      if (restoring) this.getCaptcha();
    },
    hide() {
      this._reportHidden = true;
      this._captchaAwaitingVisible = false;
      this.invalidateFeedback();
      if (this._modalLock) this._modalLock.hide();
    },
  },
  /**
   * 组件的方法列表
   */
  methods: {
    invalidateFeedback() {
      this._reportGeneration = (this._reportGeneration || 0) + 1;
      this._captchaSequence = (this._captchaSequence || 0) + 1;
      this._pendingFeedback = null;
      this.setData({
        feedback_remark: "",
        captcha_token: "",
        captcha_image: "",
        feedback_checked_value: [],
        captcha_data: "",
        submit_pending: false,
      });
    },
    syncFeedbackSession() {
      if (!this._reportAttached || this._reportDisposed) return;
      const owner = feedbackAccount();
      const visible = !!this.data.show_feedback;
      const questionId = Number(this.data.question_id);
      if (
        owner !== this._reportOwner ||
        visible !== this._reportVisible ||
        questionId !== this._reportQuestion
      ) {
        this._reportOwner = owner;
        this._reportVisible = visible;
        this._reportQuestion = questionId;
        this.invalidateFeedback();
      }
      if (this._modalLock) this._modalLock.set(visible);
    },
    feedbackSession() {
      return {
        generation: this._reportGeneration,
        owner: this._reportOwner,
        questionId: Number(this.data.question_id),
      };
    },
    isFeedbackCurrent(session) {
      return (
        !this._reportDisposed &&
        !this._reportHidden &&
        this.data.show_feedback &&
        session.generation === this._reportGeneration &&
        session.owner === feedbackAccount() &&
        session.owner === this._reportOwner &&
        session.questionId === Number(this.data.question_id)
      );
    },
    getCaptcha(event) {
      if (this._reportDisposed || this._reportHidden) return;
      this.syncFeedbackSession();
      if (!this.data.show_feedback) {
        this._captchaAwaitingVisible = true;
        return;
      }
      if (this.data.submit_pending) return;
      if (event && event.type === "tap") app.clickSound();
      const session = this.feedbackSession();
      const sequence = ++this._captchaSequence;
      const current = () =>
        this.isFeedbackCurrent(session) && sequence === this._captchaSequence;
      httpGET("api/common/captcha")
        .then((res) => {
          if (!current()) return;
          if (!res || !res.data || res.data.code != 10000) {
            showToast(
              (res && res.data && res.data.message) || "验证码暂时不可用",
            );
            return;
          }
          this.setData({
            captcha_token: res.data.data.token,
            captcha_image: res.data.data.image_data,
          });
        })
        .catch(() => {
          if (current()) showToast("网络异常");
        });
    },
    feedbackRemarkInput: function (e) {
      if (this.data.submit_pending) return;
      this.setData({
        feedback_remark: e.detail.value,
      });
    },
    feedbackChecked: function (e) {
      if (this.data.submit_pending) return;
      app.clickSound();
      this.setData({
        feedback_checked_value: e.detail.value,
      });
    },
    captchaInput: function (e) {
      if (this.data.submit_pending) return;
      this.setData({
        captcha_data: e.detail.value,
      });
    },
    feedbackSubmit: function () {
      this.syncFeedbackSession();
      if (
        !this.data.show_feedback ||
        this._reportDisposed ||
        this._reportHidden ||
        this.data.submit_pending
      )
        return;
      if (
        this.data.feedback_checked_value.length == 0 &&
        this.data.feedback_remark.replaceAll(/\s/g, "").length == 0
      ) {
        app.playSound("warn");
        showToast("请填写纠错内容");
        return;
      }
      if (this.data.captcha_data.length != 6) {
        app.playSound("warn");
        showToast("验证码不正确");
        return;
      }
      app.clickSound();
      var feedback_value = 0;
      var feedback_checked_value = this.data.feedback_checked_value;
      for (var i = 0; i < feedback_checked_value.length; i++) {
        feedback_value += parseInt(feedback_checked_value[i]);
      }
      const session = this.feedbackSession();
      const submission = {};
      this._pendingFeedback = submission;
      this.setData({ submit_pending: true });
      const current = () =>
        this.isFeedbackCurrent(session) && this._pendingFeedback === submission;
      httpPOST("api/common/feedback", {
        token: this.data.captcha_token,
        question_id: this.data.question_id,
        captcha: this.data.captcha_data,
        remark: this.data.feedback_remark,
        type: feedback_value,
      })
        .then((res) => {
          if (!current()) return;
          if (res.data.code != 10000) {
            showToast(res.data.message);
            return;
          }
          showToast("纠错已提交，感谢你的帮助");
          this.closeFeedback();
        })
        .catch(() => {
          if (current()) showToast("网络异常");
        })
        .finally(() => {
          if (current()) {
            this._pendingFeedback = null;
            this.setData({ submit_pending: false });
          }
        });
    },
    closeFeedback: function (event) {
      if (!this.data.show_feedback || this._reportDisposed) return;
      if (event && event.type === "tap") app.clickSound();
      this.setData({
        show_feedback: false,
        feedback_remark: "",
        captcha_token: "",
        feedback_checked_value: [],
        captcha_data: "",
        captcha_image: "",
      });
      this.triggerEvent("nextQuestion");
    },
    catchtouchmove: function () {},
  },
});
