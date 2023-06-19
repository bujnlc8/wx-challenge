const app = getApp();
Component({
  options: {
    multipleSlots: true,
  },
  properties: {
    title: {
      type: String,
      value: "",
    },
    // 弹窗内容
    content: {
      type: String,
      value: "内容",
    },
    // 弹窗取消按钮文字
    btn_no: {
      type: String,
      value: "取消",
    },
    // 弹窗确认按钮文字
    btn_ok: {
      type: String,
      value: "确定",
    },
    // 是否显示遮罩
    show_modal: {
      type: Boolean,
      value: false,
    },
  },
  data: {
    flag: true,
  },
  methods: {
    hidePopup: function () {
      this.setData({
        flag: !this.data.flag,
      });
    },
    showPopup() {
      this.setData({
        flag: !this.data.flag,
      });
    },
    popupCancel() {
      this.triggerEvent("error");
      app.clickSound();
    },
    popupConfirm() {
      this.triggerEvent("success");
      app.clickSound();
    },
    catchtouchmove: function () {},
  },
});
