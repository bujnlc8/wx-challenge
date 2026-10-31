import { showToast } from "../../utils/util";
Page({
  data: { version: "", logined: false },
  onLoad() {
    try {
      const info = wx.getAccountInfoSync();
      this.setData({ version: info.miniProgram.version || "" });
    } catch (error) {
      /* Development builds may not have a release version. */
    }
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
