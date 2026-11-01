import { showToast } from "../../utils/util";
import { APP_VERSION, getAppVersion } from "../../utils/version";
Page({
  data: { version: APP_VERSION, logined: false },
  onLoad() {
    this.setData({ version: getAppVersion() });
  },
  onShow() {
    this.setData({ logined: !!wx.getStorageSync("uid") });
  },
  logout() {
    wx.removeStorageSync("uid");
    wx.removeStorageSync("token");
    wx.removeStorageSync("mine_cache");
    this.setData({ logined: false });
    showToast("已退出当前账号");
  },
  openSharePoster() {
    this.selectComponent("#question-poster").openApp();
  },
});
