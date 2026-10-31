import { clearFeedback } from "../../utils/feedback";

Component({
  properties: {
    state: { type: Object, value: null },
  },
  lifetimes: {
    attached() {
      const pages = getCurrentPages();
      this.feedbackPage = pages[pages.length - 1];
    },
    detached() {
      clearFeedback(this.feedbackPage);
      this.feedbackPage = null;
    },
  },
  pageLifetimes: {
    hide() {
      clearFeedback(this.feedbackPage);
    },
  },
  methods: {
    preventTouch() {},
  },
});
