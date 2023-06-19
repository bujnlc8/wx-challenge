import { httpPOST, httpGET, showToast } from "../../utils/util";

const app = getApp();
Component({
  properties: {
    show_feedback: {
      type: Boolean,
      value: true,
    },
    question_id: {
      type: Number,
      value: 0,
    },
  },
  /**
   * 组件的初始数据
   */
  data: {
    captcha_image: "",
    captcha_token: "",
    feedback_remark: "",
    feedback_checked_value: [],
    captcha_data: "",
  },
  pageLifetimes: {
    show: function () {
      // this.getCaptcha()
    },
    hide: function () {
      this.setData({
        feedback_remark: "",
        captcha_token: "",
        captcha_image: "",
        feedback_checked_value: [],
        captcha_data: "",
      });
    },
  },
  /**
   * 组件的方法列表
   */
  methods: {
    getCaptcha: function () {
      httpGET("api/common/captcha")
        .then((res) => {
          if (res.data.code != 10000) {
            showToast(res.data.message);
            return;
          }
          this.setData({
            captcha_token: res.data.data.token,
            captcha_image: res.data.data.image_data,
          });
        })
        .catch(() => {
          showToast("网络异常");
        });
    },
    feedbackRemarkInput: function (e) {
      this.setData({
        feedback_remark: e.detail.value,
      });
    },
    feedbackChecked: function (e) {
      this.setData({
        feedback_checked_value: e.detail.value,
      });
    },
    captchaInput: function (e) {
      this.setData({
        captcha_data: e.detail.value,
      });
    },
    feedbackSubmit: function () {
      if (
        this.data.feedback_checked_value.length == 0 &&
        this.data.feedback_remark.replaceAll(/\s/g, "").length == 0
      ) {
        app.playSound("warn");
        showToast("反馈内容为空");
        return;
      }
      if (this.data.captcha_data.length != 6) {
        app.playSound("warn");
        showToast("验证码不正确");
        return;
      }
      app.clickSound();
      var feedback_value = 0;
      var feedback_checked_value = this.data.feedback_checked_value;
      for (var i = 0; i < feedback_checked_value.length; i++) {
        feedback_value += parseInt(feedback_checked_value[i]);
      }
      httpPOST("api/common/feedback", {
        token: this.data.captcha_token,
        question_id: this.data.question_id,
        captcha: this.data.captcha_data,
        remark: this.data.feedback_remark,
        type: feedback_value,
      })
        .then((res) => {
          if (res.data.code != 10000) {
            showToast(res.data.message);
            return;
          }
          showToast("感谢你的反馈❤️");
          this.closeFeedback();
        })
        .catch(() => {
          showToast("网络异常");
        });
    },
    closeFeedback: function () {
      app.clickSound();
      this.setData({
        show_feedback: false,
        feedback_remark: "",
        captcha_token: "",
        feedback_checked_value: [],
        captcha_data: "",
        captcha_image: "",
      });
      this.triggerEvent("nextQuestion");
    },
    catchtouchmove: function () {},
  },
});
