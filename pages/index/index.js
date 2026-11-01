const app = getApp();
import { httpGET } from "../../utils/util";
import { getChallengeQuestionCount } from "../../utils/challenge-settings";
import {
  captureAuthSession,
  isAuthSessionCurrent,
} from "../../utils/auth-session";

function emptyRanking() {
  return {
    list: [],
    mine: null,
    rank: null,
    reset_seconds: 0,
    loaded: false,
    loading: false,
    error: "",
  };
}

Page({
  data: {
    week_rank_list: [],
    total_rank_list: [],
    current_rank_list: [],
    reset_seconds: 0,
    reset_day: 0,
    reset_hour: 0,
    reset_minute: 0,
    t: 0,
    show_tip: 0,
    my_rank: null,
    my_rank_state: "guest",
    my_rank_label: "未登录",
    ranking_loading: false,
    ranking_loaded: false,
    ranking_error: "",
    skeleton_rows: [0, 1, 2, 3, 4],
    challenge_category: "全部题型",
    challenge_question_count: 10,
    logined: 0,
    mine: null,
    is_show_help_tip: 0,
  },
  startChallenge: function () {
    app.clickSound();
    app.checkLogin(this.goToChallenge);
  },
  goToChallenge: function () {
    wx.navigateTo({
      url: "/pages/answer/answer",
    });
  },
  onLoad: function () {
    wx.setNavigationBarTitle({
      title: "挑战",
    });
    this._homeUnloaded = false;
    this.syncChallengeSettings();
    this.getCurrentWeekRanking();
    this.getTotalRanking();
    wx.getStorage({
      key: "is_show_help_tip",
      fail: () => {
        this.openHelpPage();
      },
    });
  },
  openHelpPage: function () {
    if (this._openingHelp) return;
    this._openingHelp = true;
    wx.navigateTo({
      url: "/pages/help/help",
      complete: () => {
        this._openingHelp = false;
      },
    });
  },
  syncChallengeSettings() {
    const category = Number(app.category) || 0;
    this.setData({
      challenge_category:
        category === 0
          ? "全部题型"
          : (app.categories && app.categories[category]) ||
            (app.category_lables && app.category_lables[category]) ||
            "全部题型",
      challenge_question_count: getChallengeQuestionCount(),
    });
  },
  syncRankingSession() {
    const owner = captureAuthSession();
    if (!this._rankOwner || !isAuthSessionCurrent(this._rankOwner)) {
      this._rankOwner = owner;
      this._rankings = [emptyRanking(), emptyRanking()];
      this._rankFlights = [null, null];
      this.setData({
        week_rank_list: [],
        total_rank_list: [],
        mine: null,
        my_rank: null,
      });
    }
    this.setData({ logined: owner.uid && owner.token ? 1 : 0 });
  },
  applyRanking() {
    const ranking = this._rankings[this.data.t];
    const mine = this.data.logined ? ranking.mine : null;
    const rank = Number(ranking.rank);
    let state = "guest";
    let label = "未登录";
    if (this.data.logined) {
      if (!ranking.loaded) {
        state = ranking.error ? "error" : "loading";
        label = ranking.error ? "加载失败" : "加载中";
      } else if (!mine || Number(mine.total_score) === -1) {
        state = "empty";
        label = "暂无记录";
      } else if (
        (this.data.t === 1 && Number(mine.total_score) < 2000) ||
        !Number.isInteger(rank) ||
        rank <= 0
      ) {
        state = "unranked";
        label = "未上榜";
      } else {
        // The API also returns count-derived ranks: 999 and ranks beyond the visible 100 are valid.
        state = "ranked";
        label = String(rank);
      }
    }
    const seconds = Math.max(0, Number(ranking.reset_seconds) || 0);
    this.setData({
      current_rank_list: ranking.list,
      ranking_loading: ranking.loading,
      ranking_loaded: ranking.loaded,
      ranking_error: ranking.error,
      mine,
      my_rank: state === "ranked" ? rank : null,
      my_rank_state: state,
      my_rank_label: label,
      reset_seconds: seconds,
      reset_day: Math.floor(seconds / 86400),
      reset_hour: Math.floor(seconds / 3600) % 24,
      reset_minute: Math.floor(seconds / 60) % 60,
    });
  },
  loadRanking(type) {
    if (this._homeUnloaded) return;
    this.syncRankingSession();
    if (this._rankFlights[type]) return this._rankFlights[type];
    const owner = this._rankOwner;
    const ranking = this._rankings[type];
    const current = () =>
      !this._homeUnloaded &&
      this._rankings[type] === ranking &&
      isAuthSessionCurrent(owner);
    ranking.loading = true;
    ranking.error = "";
    if (this.data.t === type) this.applyRanking();
    const flight = httpGET("api/question/ranking-list", { type })
      .then((res) => {
        if (!current()) return;
        if (
          !res.data ||
          res.data.code != 10000 ||
          !res.data.data ||
          !Array.isArray(res.data.data.list)
        ) {
          throw new Error((res.data && res.data.message) || "榜单加载失败");
        }
        const data = res.data.data;
        Object.assign(ranking, {
          list: data.list,
          mine: data.mine,
          rank: data.rank,
          reset_seconds: data.reset_seconds,
          loaded: true,
        });
        this.setData(
          type === 0
            ? { week_rank_list: data.list }
            : { total_rank_list: data.list },
        );
      })
      .catch((error) => {
        if (current()) ranking.error = (error && error.message) || "网络异常";
      })
      .finally(() => {
        if (!current()) return;
        ranking.loading = false;
        this._rankFlights[type] = null;
        if (this.data.t === type) {
          this.applyRanking();
          wx.stopPullDownRefresh();
        }
      });
    this._rankFlights[type] = flight;
    return flight;
  },
  getCurrentWeekRanking: function () {
    return this.loadRanking(0);
  },
  getTotalRanking: function () {
    return this.loadRanking(1);
  },
  updateData: function (t) {
    // checkLogin invokes this callback without a Page receiver.
    const that = this && this.setData ? this : getCurrentPages().slice(-1)[0];
    if (!that || that._homeUnloaded) return;
    that.syncRankingSession();
    const type = t === undefined ? Number(that.data.t) : Number(t);
    if (type !== 0 && type !== 1) return;
    that.setData({ t: type });
    that.applyRanking();
    return that.loadRanking(type);
  },
  changeTab: function (e) {
    app.clickSound();
    this.updateData(e.currentTarget.dataset.t);
  },
  retryRanking() {
    app.clickSound();
    return this.updateData(this.data.t);
  },
  closeTip: function () {
    app.clickSound();
    this.setData({
      show_tip: 0,
    });
  },
  openTip: function () {
    app.clickSound();
    this.setData({
      show_tip: 1,
    });
  },
  onReady: function () {},
  onTabItemTap: function () {
    app.clickSound();
  },
  onPullDownRefresh: function () {
    this.updateData(this.data.t);
  },
  onShow() {
    if (typeof wx.hideShareMenu === "function") {
      wx.hideShareMenu({ menus: ["shareAppMessage", "shareTimeline"] });
    }
    if (this._homeUnloaded) return;
    this.syncChallengeSettings();
    this.updateData(this.data.t);
    if (app.show_help_tip) {
      app.show_help_tip = 0;
      this.openHelpPage();
    }
  },
  onUnload() {
    this._homeUnloaded = true;
  },
  onMyRankingTap() {
    if (!this.data.logined) this.goToLogin();
    else if (this.data.my_rank_state === "error") this.retryRanking();
  },
  goToLogin: function () {
    app.clickSound();
    app.checkLogin(this.updateData);
  },
  goToClassIntro: function () {
    app.clickSound();
    app.show_class_tip = 1;
    wx.switchTab({
      url: "/pages/mine/mine",
    });
  },
  catchtouchmove: function () {},
});
