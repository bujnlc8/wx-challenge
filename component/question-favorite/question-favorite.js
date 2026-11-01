import { getSessionIdentity } from "../../utils/auth-session";
import {
  subscribeFavorite,
  loadFavorite,
  setFavorite,
  getFavoriteSnapshot,
} from "../../utils/favorites";
import { showToast } from "../../utils/feedback";
const app = getApp();
Component({
  options: { virtualHost: true },
  properties: {
    compact: { type: Boolean, value: false },
    question_id: {
      type: Number,
      value: 0,
      observer() {
        if (this._attached && !this._hidden) this.bindFavorite();
      },
    },
  },
  data: {
    favorite: false,
    known: false,
    loading: true,
    saving: false,
    error: "",
  },
  lifetimes: {
    attached() {
      this._attached = true;
      this._hidden = false;
      this.bindFavorite();
    },
    detached() {
      this._attached = false;
      this.unbindFavorite();
    },
  },
  pageLifetimes: {
    hide() {
      this._hidden = true;
      this.unbindFavorite();
    },
    show() {
      this._hidden = false;
      if (this._attached) this.bindFavorite();
    },
  },
  methods: {
    unbindFavorite() {
      this._binding = (this._binding || 0) + 1;
      if (this._unsubscribe) this._unsubscribe();
      this._unsubscribe = null;
    },
    bindFavorite() {
      this.unbindFavorite();
      const id = Number(this.data.question_id),
        binding = this._binding;
      if (!Number.isSafeInteger(id) || id <= 0) {
        this.setData({
          favorite: false,
          known: false,
          loading: true,
          saving: false,
          error: "",
        });
        return;
      }
      this._unsubscribe = subscribeFavorite(id, (state) => {
        if (this._attached && !this._hidden && binding === this._binding)
          this.setData({
            favorite: state.favorite,
            known: state.known,
            loading: state.loading,
            saving: state.saving,
            error: state.error,
          });
      });
      if (!getSessionIdentity()) {
        this.setData({ loading: false, error: "请先登录" });
        return;
      }
      loadFavorite(id).catch(() => {});
    },
    async toggleFavorite() {
      if (
        !this._attached ||
        this._hidden ||
        this.data.loading ||
        this.data.saving
      )
        return;
      app.clickSound();
      const id = Number(this.data.question_id),
        owner = getSessionIdentity(),
        binding = this._binding;
      const current = () =>
        this._attached &&
        !this._hidden &&
        binding === this._binding &&
        owner === getSessionIdentity();
      if (!owner) {
        return app.checkLogin(() => {
          if (this._attached && !this._hidden) this.bindFavorite();
        });
      }
      try {
        const state = getFavoriteSnapshot(id);
        if (state.loading || state.saving) return;
        // Retry only the lookup when state is unknown, never infer an inverse on failure.
        if (!state.known || state.error)
          await loadFavorite(id, { force: true });
        else {
          const result = await setFavorite(id, !state.favorite);
          if (current()) {
            showToast(result.favorite ? "已收藏" : "已取消收藏");
            this.triggerEvent("change", result);
          }
        }
      } catch (error) {
        if (current() && !(error && error.sessionChanged))
          showToast((error && error.message) || "网络异常，请重试");
      }
    },
  },
});
