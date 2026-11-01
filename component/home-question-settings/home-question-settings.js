import { createModalLock } from "../../utils/modal-lock";
import {
  getChallengeQuestionCount,
  parseChallengeQuestionCount,
  setChallengeQuestionCount,
} from "../../utils/challenge-settings";
const app = getApp();

function categoryIndex(value) {
  if (typeof value === "string" && /^\d+$/.test(value)) value = Number(value);
  return typeof value === "number" && Number.isInteger(value) && value >= 0
    ? value
    : null;
}

Component({
  options: { virtualHost: true },
  data: {
    mode: "",
    categories: [],
    category_draft: 0,
    count_draft: 10,
    count_presets: [10, 20, 50, 100],
    scroll_height: 160,
    error: "",
  },
  lifetimes: {
    attached() {
      this._attached = true;
      this._hidden = false;
      this._modalLock = createModalLock();
    },
    detached() {
      this.close();
      this._attached = false;
      if (this._modalLock) this._modalLock.dispose();
    },
  },
  pageLifetimes: {
    hide() {
      this._hidden = true;
      this.close();
      if (this._modalLock) this._modalLock.hide();
    },
    show() {
      this._hidden = false;
      if (this._modalLock) this._modalLock.show();
    },
  },
  methods: {
    open(mode) {
      if (
        !this._attached ||
        this._hidden ||
        !["category", "count"].includes(mode)
      )
        return;
      app.clickSound();
      const labels = app.category_lables;
      let categories = Array.isArray(labels)
        ? labels.map((label, value) => ({ value, label }))
        : Object.keys(app.categories || {}).map((key) => ({
            value: Number(key),
            label: app.categories[key],
          }));
      categories = categories.filter(
        (item) =>
          categoryIndex(item.value) !== null && typeof item.label === "string",
      );
      if (!categories.length) categories = [{ value: 0, label: "全部题型" }];
      const active = categoryIndex(app.category);
      const category = categories.some((item) => item.value === active)
        ? active
        : categories[0].value;
      const count = getChallengeQuestionCount();
      let height = 640;
      try {
        const info =
          typeof wx.getWindowInfo === "function"
            ? wx.getWindowInfo()
            : wx.getSystemInfoSync();
        if (info.windowHeight > 0) height = info.windowHeight;
      } catch (error) {
        /* Use the normal content viewport when window information is unavailable. */
      }
      const available = Math.max(88, Math.floor(height * 0.85) - 196);
      this.setData({
        mode,
        categories,
        category_draft: category,
        count_draft: count,
        error: "",
        scroll_height: Math.min(
          Math.ceil(categories.length / 2) * 66 + 12,
          available,
        ),
      });
      this._modalLock.set(true);
    },
    chooseCategory(event) {
      if (!this._attached || this._hidden || this.data.mode !== "category")
        return;
      const value = categoryIndex(event.currentTarget.dataset.index);
      if (
        value === null ||
        !this.data.categories.some((item) => item.value === value)
      )
        return;
      app.clickSound();
      this.setData({ category_draft: value, error: "" });
    },
    chooseCount(event) {
      if (!this._attached || this._hidden || this.data.mode !== "count") return;
      const value = parseChallengeQuestionCount(
        event.currentTarget.dataset.count,
      );
      if (value === null) return;
      app.clickSound();
      this.setData({ count_draft: value, error: "" });
    },
    inputCount(event) {
      if (!this._attached || this._hidden || this.data.mode !== "count") return;
      this.setData({ count_draft: event.detail.value, error: "" });
    },
    stepCount(event) {
      if (!this._attached || this._hidden || this.data.mode !== "count") return;
      const raw = event.currentTarget.dataset.step;
      if (![1, -1, "1", "-1"].includes(raw)) return;
      app.clickSound();
      const count = parseChallengeQuestionCount(this.data.count_draft);
      if (count === null) {
        this.setData({ error: "请输入 1–100 的整数" });
        return;
      }
      this.setData({
        count_draft: String(Math.max(1, Math.min(100, count + Number(raw)))),
        error: "",
      });
    },
    confirm() {
      if (!this._attached || this._hidden || !this.data.mode) return;
      app.clickSound();
      const mode = this.data.mode;
      if (mode === "category") {
        const value = categoryIndex(this.data.category_draft);
        if (
          value === null ||
          !this.data.categories.some((item) => item.value === value)
        )
          return;
        try {
          wx.setStorageSync("question_category", value);
        } catch (error) {
          this.setData({ error: "保存失败，请重试" });
          return;
        }
        app.category = value;
      } else {
        const count = parseChallengeQuestionCount(this.data.count_draft);
        if (count === null) {
          this.setData({ error: "请输入 1–100 的整数" });
          return;
        }
        if (!setChallengeQuestionCount(count)) {
          this.setData({ error: "保存失败，请重试" });
          return;
        }
      }
      this.close();
      this.triggerEvent("change", { setting: mode });
    },
    cancel() {
      if (!this._attached || this._hidden || !this.data.mode) return;
      app.clickSound();
      this.close();
    },
    close() {
      if (this._modalLock) this._modalLock.set(false);
      this.setData({ mode: "", category_draft: 0, count_draft: 10, error: "" });
    },
    preventTouch() {},
  },
});
