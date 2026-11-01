import { getSessionIdentity } from "../../utils/auth-session";
import { httpGET, showToast } from "../../utils/util";
import {
  seedFavorites,
  setFavorite,
  getFavoriteRevision,
  waitForFavoriteWrites,
} from "../../utils/favorites";
const app = getApp();
function favoriteListPayload(response) {
  const result = response && response.data;
  if (!result || Number(result.code) !== 10000)
    throw Error((result && result.message) || "收藏夹暂时打不开，请重试");
  const data = result.data;
  if (
    !data ||
    !Array.isArray(data.items) ||
    !Number.isInteger(data.total) ||
    data.total < 0
  )
    throw Error("收藏列表异常，请重试");
  return data;
}
function favoriteCreatedAt(value) {
  if (typeof value !== "string") return "—";
  const parts =
    /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?$/.exec(
      value,
    );
  if (!parts) return "—";
  const [, year, month, day, hour, minute, second = "00"] = parts;
  const leap =
    Number(year) % 4 === 0 &&
    (Number(year) % 100 !== 0 || Number(year) % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (
    Number(year) < 1 ||
    Number(month) < 1 ||
    Number(month) > 12 ||
    Number(day) < 1 ||
    Number(day) > days[Number(month) - 1] ||
    Number(hour) > 23 ||
    Number(minute) > 59 ||
    Number(second) > 59
  )
    return "—";
  // created_at is a local DATETIME. Preserve its clock fields without timezone conversion.
  return `${year}-${month}-${day} ${hour}:${minute}:${second}`;
}
function favoriteQuestion(item) {
  const id = Number(item.question_id);
  if (!Number.isSafeInteger(id) || id <= 0) throw Error("收藏题目异常，请重试");
  const [content, media = ""] = String(item.content || "").split("###");
  return {
    question_id: id,
    created_at_text: favoriteCreatedAt(item.created_at),
    content: content.replace(/\n\n/g, "\n"),
    question_image: media,
    is_video: /\.(mp4|mov|m4v)(?:[?#]|$)/i.test(media),
    option_count: Array.isArray(item.options)
      ? item.options.length
      : String(item.options || "").split("|").length,
  };
}
Page({
  data: {
    question_list: [],
    view_state: "loading",
    error_message: "",
    loading_more: false,
    more_error: "",
    page: 0,
    size: 12,
    total: 0,
    no_more_data: false,
    removing_id: 0,
  },
  onLoad() {
    this._generation = 0;
    this._disposed = false;
  },
  onShow() {
    this._visible = true;
    if (typeof wx.hideShareMenu === "function")
      wx.hideShareMenu({ menus: ["shareAppMessage", "shareTimeline"] });
    wx.setNavigationBarTitle({ title: "收藏夹" });
    this._owner = getSessionIdentity();
    this.refreshFavorites();
  },
  onHide() {
    this.clearRemoveFavoriteIntent();
    this._visible = false;
    this._generation++;
    this._listFlight = null;
  },
  onUnload() {
    this._disposed = true;
    this.onHide();
  },
  isFavoritePageCurrent(owner, generation) {
    return (
      !this._disposed &&
      this._visible &&
      owner === getSessionIdentity() &&
      generation === this._generation
    );
  },
  refreshFavorites() {
    this.clearRemoveFavoriteIntent();
    this._generation++;
    this._listFlight = null;
    this._owner = getSessionIdentity();
    this.setData({
      question_list: [],
      view_state: this._owner ? "loading" : "logged-out",
      error_message: "",
      page: 0,
      total: 0,
      no_more_data: false,
      more_error: "",
      loading_more: false,
      removing_id: 0,
    });
    if (!this._owner) {
      wx.stopPullDownRefresh();
      return Promise.resolve();
    }
    return this.loadFavoritesPage(1);
  },
  async loadFavoritesPage(page) {
    if (this._listFlight || !this._visible || !this._owner) return;
    const owner = this._owner,
      generation = this._generation,
      flight = {};
    this._listFlight = flight;
    this.setData({ loading_more: page > 1, more_error: "" });
    try {
      const writes = waitForFavoriteWrites();
      if (writes) {
        await writes;
        if (!this.isFavoritePageCurrent(owner, generation)) return;
      }
      const readRevision = getFavoriteRevision();
      const response = await httpGET("api/question/favorites", {
        page,
        size: this.data.size,
      });
      if (!this.isFavoritePageCurrent(owner, generation)) return;
      const data = favoriteListPayload(response);
      const items = data.items.map(favoriteQuestion);
      if (seedFavorites(items, readRevision)) {
        // A confirmed write changed an offset while this list was in flight.
        this._listFlight = null;
        return this.refreshFavorites();
      }
      const existing = page === 1 ? [] : this.data.question_list;
      const ids = new Set(existing.map((item) => item.question_id));
      const next = existing.slice();
      for (const item of items)
        if (!ids.has(item.question_id)) {
          ids.add(item.question_id);
          next.push(item);
        }
      this.setData({
        question_list: next,
        page,
        size:
          Number.isInteger(data.size) && data.size > 0
            ? data.size
            : this.data.size,
        total: data.total,
        view_state: next.length ? "ready" : "empty",
        error_message: "",
        no_more_data:
          !items.length || page * (data.size || this.data.size) >= data.total,
      });
    } catch (error) {
      if (!this.isFavoritePageCurrent(owner, generation)) return;
      const message = (error && error.message) || "网络异常，请重试";
      if (page === 1)
        this.setData({ view_state: "error", error_message: message });
      else this.setData({ more_error: message });
    } finally {
      if (this._listFlight === flight) {
        this._listFlight = null;
        if (this.isFavoritePageCurrent(owner, generation)) {
          this.setData({ loading_more: false });
          wx.stopPullDownRefresh();
        }
      }
    }
  },
  onPullDownRefresh() {
    if (!this.data.removing_id) return this.refreshFavorites();
    wx.stopPullDownRefresh();
  },
  onReachBottom() {
    if (
      !this.data.removing_id &&
      !this._removeFavoriteIntent &&
      this.data.view_state === "ready" &&
      !this.data.no_more_data &&
      !this._listFlight
    )
      return this.loadFavoritesPage(this.data.page + 1);
  },
  retryFavorites() {
    app.clickSound();
    return this.refreshFavorites();
  },
  retryMore() {
    app.clickSound();
    return this.onReachBottom();
  },
  loginAndLoad() {
    app.clickSound();
    return app.checkLogin(() => {
      if (this._visible && !this._disposed) this.refreshFavorites();
    });
  },
  openQuestion(event) {
    const id = Number(event.currentTarget.dataset.id);
    if (
      !Number.isSafeInteger(id) ||
      id <= 0 ||
      !this._visible ||
      this._owner !== getSessionIdentity()
    )
      return;
    app.clickSound();
    wx.navigateTo({
      url: "/pages/single/single?question_id=" + id + "&from=favorite",
    });
  },
  getRemoveFavoritePopup() {
    if (!this._removeFavoritePopup && this.selectComponent)
      this._removeFavoritePopup = this.selectComponent(
        "#favorite-remove-popup",
      );
    return this._removeFavoritePopup;
  },
  clearRemoveFavoriteIntent() {
    this._removeFavoriteIntent = null;
    const popup = this.getRemoveFavoritePopup();
    if (popup && popup.data.flag === false) popup.hidePopup();
  },
  requestRemoveFavorite(event) {
    const id = Number(event.currentTarget.dataset.id);
    if (
      this._removeFavoriteIntent ||
      this.data.removing_id ||
      this._listFlight ||
      !this.isFavoritePageCurrent(this._owner, this._generation) ||
      !this.data.question_list.some((item) => item.question_id === id)
    )
      return;
    const popup = this.getRemoveFavoritePopup();
    if (!popup) return;
    app.clickSound();
    this._removeFavoriteIntent = {
      id,
      owner: this._owner,
      generation: this._generation,
    };
    if (popup.data.flag !== false) popup.showPopup();
  },
  cancelRemoveFavorite() {
    this.clearRemoveFavoriteIntent();
  },
  confirmRemoveFavorite() {
    const intent = this._removeFavoriteIntent;
    this.clearRemoveFavoriteIntent();
    if (
      !intent ||
      !this.isFavoritePageCurrent(intent.owner, intent.generation) ||
      !this.data.question_list.some((item) => item.question_id === intent.id)
    )
      return;
    // popup owns the confirmation click sound; this helper performs only the write.
    return this.removeFavorite({
      currentTarget: { dataset: { id: intent.id } },
    });
  },
  async removeFavorite(event) {
    const id = Number(event.currentTarget.dataset.id);
    if (
      !Number.isSafeInteger(id) ||
      id <= 0 ||
      this.data.removing_id ||
      !this._visible ||
      this._listFlight ||
      this._owner !== getSessionIdentity()
    )
      return;
    const owner = this._owner,
      generation = this._generation;
    this.setData({ removing_id: id });
    try {
      await setFavorite(id, false);
      if (!this.isFavoritePageCurrent(owner, generation)) return;
      showToast("已取消收藏");
      // Removing shifts offset pages; restart from page one so the next page cannot skip a record.
      return this.refreshFavorites();
    } catch (error) {
      if (this.isFavoritePageCurrent(owner, generation)) {
        this.setData({ removing_id: 0 });
        if (!(error && error.sessionChanged))
          showToast((error && error.message) || "取消失败，请重试");
      }
    }
  },
});
