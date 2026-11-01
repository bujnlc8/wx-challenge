const app = getApp();
import { logoutAuthSession } from "../../utils/auth-session";
import { showToast } from "../../utils/util";
import { APP_VERSION, getAppVersion } from "../../utils/version";
Page({
  data: { version: APP_VERSION, logined: false },
  onLoad() {
    this.setData({ version: getAppVersion() });
  },
  onShow() {
    if (typeof wx.hideShareMenu === "function") {
      wx.hideShareMenu({ menus: ["shareAppMessage", "shareTimeline"] });
    }
    this.setData({ logined: !!wx.getStorageSync("uid") });
  },
  logout() {
    app.clickSound();
    logoutAuthSession();
    this.setData({ logined: false });
    showToast("已退出当前账号");
  },
  openSharePoster() {
    app.clickSound();
    this.selectComponent("#question-poster").openApp();
  },
});
