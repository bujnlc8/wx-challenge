// pages/coin/coin.js
import { httpGET, showToast } from "../../utils/util";

Page({
  data: {
    record_list: [],
    no_more_data: 0,
    page: 1,
    size: 30,
    loading_str: "",
  },

  /**
   * 生命周期函数--监听页面加载
   */
  onLoad() {
    wx.setNavigationBarTitle({
      title: "百科币",
    });
    this.getRecordList();
  },

  getRecordList: function () {
    this.setData({
      loading_str: "加载中...",
    });
    httpGET("api/coin/record", {
      page: this.data.page,
      size: this.data.size,
    })
      .then((res) => {
        this.setData({
          loading_str: "",
        });
        if (res.data.code != 10000) {
          showToast(res.data.message);
          return;
        }
        this.setData({
          record_list: this.data.record_list.concat(res.data.data.list),
        });
        if (
          res.data.data.list.length == 0 ||
          res.data.data.list.length < this.data.size
        ) {
          this.setData({
            no_more_data: 1,
          });
        }
      })
      .catch(() => {
        showToast("网络异常");
      });
  },
  /**
   * 生命周期函数--监听页面初次渲染完成
   */
  onReady() {},

  /**
   * 生命周期函数--监听页面显示
   */
  onShow() {},

  /**
   * 生命周期函数--监听页面隐藏
   */
  onHide() {},

  /**
   * 生命周期函数--监听页面卸载
   */
  onUnload() {},

  /**
   * 页面相关事件处理函数--监听用户下拉动作
   */
  onPullDownRefresh() {},

  /**
   * 页面上拉触底事件的处理函数
   */
  onReachBottom() {
    if (this.data.no_more_data == 0) {
      this.setData({
        page: this.data.page + 1,
      });
      this.getRecordList();
    }
  },

  /**
   * 用户点击右上角分享
   */
  onShareAppMessage() {},
});
