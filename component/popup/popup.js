import { createModalLock } from "../../utils/modal-lock";
const app = getApp();
const confirmationText = (content) =>
  content.replace(/[。.]+(?=[ \t]*(?:\r?\n|$))/g, "");
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
    display_content: "",
  },
  observers: {
    "flag, content"(flag, content) {
      this.setData({ display_content: confirmationText(content) });
      if (this._modalLock) this._modalLock.set(!flag && !!content);
    },
  },
  lifetimes: {
    attached() {
      this.setData({ display_content: confirmationText(this.data.content) });
      this._modalLock = createModalLock();
      this._modalLock.set(!this.data.flag && !!this.data.content);
    },
    detached() {
      if (this._modalLock) this._modalLock.dispose();
    },
  },
  pageLifetimes: {
    hide() {
      if (this._modalLock) this._modalLock.hide();
    },
    show() {
      if (this._modalLock) {
        this._modalLock.set(!this.data.flag && !!this.data.content);
        this._modalLock.show();
      }
    },
  },
  methods: {
    hidePopup: function () {
      this.setData({
        flag: true,
      });
    },
    showPopup() {
      this.setData({
        flag: false,
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
