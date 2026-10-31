import { createModalLock } from "../../utils/modal-lock";
import { clearFeedback } from "../../utils/feedback";

function feedbackMasked(state) {
  return !!(
    state &&
    ((state.toast && state.toast.mask) || (state.loading && state.loading.mask))
  );
}
Component({
  properties: {
    state: { type: Object, value: null },
  },
  observers: {
    state(state) {
      if (this._modalLock) this._modalLock.set(feedbackMasked(state));
    },
  },
  lifetimes: {
    attached() {
      const pages = getCurrentPages();
      this.feedbackPage = pages[pages.length - 1];
      this._modalLock = createModalLock(this.feedbackPage);
      this._modalLock.set(feedbackMasked(this.data && this.data.state));
    },
    detached() {
      if (this._modalLock) this._modalLock.dispose();
      clearFeedback(this.feedbackPage);
      this.feedbackPage = null;
    },
  },
  pageLifetimes: {
    show() {
      if (this._modalLock) {
        this._modalLock.set(feedbackMasked(this.data && this.data.state));
        this._modalLock.show();
      }
    },
    hide() {
      if (this._modalLock) {
        this._modalLock.set(false);
        this._modalLock.hide();
      }
      clearFeedback(this.feedbackPage);
    },
  },
  methods: {
    preventTouch() {},
  },
});
