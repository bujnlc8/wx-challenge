import { captureAuthSession, clearAuthSession, ensureAuthSession, isAuthSessionCurrent, saveAuthSession } from "./utils/auth-session";
import {
  inner_audio_context,
  showToast,
  showLoading,
  hideLoading,
  httpJsonPOST,
  httpGET,
} from "./utils/util";

var assetHost = "https://bucket-1256650966.cos.ap-beijing.myqcloud.com/";

App({
  sound_close: 0,
  show_correct_answer: 1,
  category: 0,
  show_class_tip: 0,
  show_help_tip: 0,
  show_analysis: 1,
  is_ios: false,
  global_data: {
    userInfo: null,
    login_code: null,
    encrypted_data: null,
    iv: null,
  },
  category_lables: [
    "不设置",
    "财经",
    "百科",
    "历史",
    "地理",
    "诗词",
    "驾考科一",
    "驾考科四",
    "交通规则",
  ],
  categories: {
    0: "不设置",
    1: "财经",
    2: "百科",
    3: "历史",
    4: "地理",
    5: "诗词",
    6: "驾考科一",
    7: "驾考科四",
    8: "交通规则",
  },
  checkLogin(cb = "") {
    const owner = captureAuthSession();
    const existing = !!(owner.uid && owner.token);
    const task = existing ? ensureAuthSession() : this.getUid();
    return task.then(() => {
      if (existing && !isAuthSessionCurrent(owner)) return;
      if (cb) cb();
    }).catch((error) => {
      if (error && error.authentication) clearAuthSession(owner);
      if (!error || !error.sessionChanged)
        showToast((error && (error.errMsg || error.message)) || "登录失败");
    });
  },
  getUid() {
    if (this._loginPromise && this._loginOwner && isAuthSessionCurrent(this._loginOwner))
      return this._loginPromise;
    const owner = captureAuthSession();
    this._loginOwner = owner;
    const loading = showLoading({ title: "登录中..." });
    const task = Promise.all([this.wxSilentLogin(), this.wxGetUserProfile()])
      .then(([login, profile]) => {
        if (!isAuthSessionCurrent(owner)) {
          const error = new Error("账号已变更，请重试");
          error.sessionChanged = true;
          throw error;
        }
        if (profile.errMsg !== "getUserProfile:ok") throw profile;
        this.global_data.login_code = login.code;
        this.global_data.iv = profile.iv;
        this.global_data.encrypted_data = profile.encryptedData;
        return httpJsonPOST("api/user/login-by-weixin", {
          code: login.code,
          iv: profile.iv,
          encrypted_data: profile.encryptedData,
          authVersion: 2,
        });
      })
      .then((response) => {
        if (!response.data || Number(response.data.code) !== 10000)
          throw new Error((response.data && response.data.message) || "登录失败");
        saveAuthSession(response.data.data, { manual: true, expected: owner });
        return response;
      })
      .finally(() => {
        hideLoading(loading);
        if (this._loginPromise === task) this._loginPromise = null;
      });
    this._loginPromise = task;
    return task;
  },
  wxSilentLogin() {
    return new Promise((resolve, reject) => {
      wx.login({
        success: resolve,
        fail: reject,
      });
    });
  },
  wxGetUserProfile() {
    return new Promise((resolve, reject) => {
      wx.getUserProfile({
        desc: "你的信息用于用户名的展示",
        success: resolve,
        fail: reject,
      });
    });
  },
  onLaunch: function onLaunch(options) {
    if (wx.getStorageSync("sound_close")) {
      this.sound_close = 1;
    }
    if (wx.getStorageSync("close_show_correct_answer")) {
      this.show_correct_answer = 0;
    } else {
      this.show_correct_answer = 1;
    }
    var category = wx.getStorageSync("question_category");
    if (category) {
      this.category = category;
    }
    wx.getSystemInfoAsync({
      success: (result) => {
        if (result.platform == "ios") {
          this.is_ios = true;
        } else {
          this.is_ios = false;
        }
      },
    });
    inner_audio_context.onEnded(() => {});
    // 获取题目分类
    httpGET("api/common/category")
      .then((res) => {
        if (res.data.code == 10000) {
          this.category_lables = res.data.data;
          var index = 0;
          var data = {};
          this.category_lables.forEach((element) => {
            data[index++] = element;
          });
          this.categories = data;
        }
      })
      .catch((e) => {
        console.log(e);
      });
  },
  onShow: function onShow() {
    this._soundHidden = false;
  },
  playSound: function (src) {
    this.stopInnerAudio();
    if (this.sound_close || this._soundHidden) return;
    const request = this._soundRequest;
    inner_audio_context.src = assetHost + "audios/" + src + ".m4a";
    this._soundTimer = setTimeout(() => {
      this._soundTimer = null;
      if (
        request === this._soundRequest &&
        !this.sound_close &&
        !this._soundHidden
      )
        inner_audio_context.play();
    }, 80);
  },
  clickSound: function () {
    this.playSound("click");
  },
  wrongSound: function () {
    var tt = parseInt(Math.random() * 4);
    if (tt == 0) {
      this.playSound("answer_not_this");
    } else if ((tt = 1)) {
      this.playSound("wrong");
    } else if (tt == 2) {
      this.playSound("next_time_be_better");
    } else {
      this.playSound("hard");
    }
  },
  correctSound: function () {
    var tt = parseInt(Math.random() * 4);
    if (tt == 0) {
      this.playSound("correct");
    } else if (tt == 1) {
      this.playSound("so_good");
    } else if (tt == 2) {
      this.playSound("your_best");
    } else {
      this.playSound("worship");
    }
  },
  quickCorrectSound: function () {
    var tt = parseInt(Math.random() * 4);
    if (tt == 0) {
      this.playSound("quick_correct");
    } else if (tt == 1) {
      this.playSound("so_easy");
    } else if (tt == 2) {
      this.playSound("kill");
    } else {
      this.playSound("king");
    }
  },
  stopInnerAudio: function () {
    this._soundRequest = (this._soundRequest || 0) + 1;
    if (this._soundTimer != null) clearTimeout(this._soundTimer);
    this._soundTimer = null;
    inner_audio_context.stop();
  },
  onHide: function () {
    this._soundHidden = true;
    this.stopInnerAudio();
  },
});
