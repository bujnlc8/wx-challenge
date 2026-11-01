import { getSessionIdentity } from "../../utils/auth-session";
import { createModalLock } from "../../utils/modal-lock";
import { showToast } from "../../utils/util";
const app = getApp();
// Compatibility bridge: quiz pages own their existing correction guard;
// all editable fields now live in the native correction page.
Component({
  properties: {
    show_feedback: { type: Boolean, value: true },
    question_id: { type: Number, value: 0 },
  },
  observers: {
    "show_feedback, question_id"() {
      if (this._modalLock) this._modalLock.set(this.data.show_feedback);
      if (this._awaitingVisible && this.data.show_feedback) this.getCaptcha();
    },
  },
  lifetimes: {
    attached() {
      this._disposed = false;
      this._modalLock = createModalLock();
      this._modalLock.set(this.data.show_feedback);
    },
    detached() {
      this._disposed = true;
      this._navigation = null;
      this._awaitingVisible = false;
      if (this._modalLock) this._modalLock.dispose();
    },
  },
  pageLifetimes: {
    hide() {
      if (this._modalLock) this._modalLock.hide();
    },
    show() {
      if (this._modalLock) this._modalLock.show();
    },
  },
  methods: {
    getCaptcha() {
      if (this._disposed || this._navigation) return;
      if (!this.data.show_feedback) {
        this._awaitingVisible = true;
        return;
      }
      const questionId = Number(this.data.question_id);
      if (!Number.isSafeInteger(questionId) || questionId <= 0) return;
      this._awaitingVisible = false;
      const ticket = { questionId, owner: getSessionIdentity() };
      this._navigation = ticket;
      const close = () => {
        if (this._disposed || this._navigation !== ticket) return;
        const reason =
          ticket.owner !== getSessionIdentity()
            ? "account-change"
            : Number(this.data.question_id) !== questionId
              ? "question-change"
              : "user";
        this.closeFeedback({ reason });
      };
      wx.navigateTo({
        url: "/pages/correction/correction?question_id=" + questionId,
        events: { correctionClosed: close },
        fail: () => {
          if (this._disposed || this._navigation !== ticket) return;
          close();
          showToast("纠错页面暂时打不开，请重试");
        },
      });
    },
    closeFeedback(event) {
      if (this._disposed || !this.data.show_feedback) return;
      if (event && event.type === "tap") app.clickSound();
      this._navigation = null;
      this._awaitingVisible = false;
      this.setData({ show_feedback: false });
      this.triggerEvent("nextQuestion", {
        reason: (event && event.reason) || "user",
      });
    },
  },
});
