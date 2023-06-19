import {
  background_music,
  inner_audio_context,
  showToast,
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
    if (!wx.getStorageSync("uid")) {
      this.getUid()
        .then((res) => {
          if (cb) {
            cb();
          }
        })
        .catch((e) => {
          showToast("登录失败" + e.errMsg);
        });
    } else {
      if (cb) {
        cb();
      }
    }
  },
  getUid() {
    wx.showLoading({
      title: "登录中...",
    });
    return new Promise((resolve, reject) => {
      Promise.all([this.wxSilentLogin(), this.wxGetUserProfile()])
        .then((r) => {
          let e = {
            detail: r[1],
          };
          if (e.detail.errMsg == "getUserProfile:ok") {
            this.global_data.login_code = r[0].code;
            this.global_data.iv = e.detail.iv;
            this.global_data.encrypted_data = e.detail.encryptedData;
            httpJsonPOST("api/user/login-by-weixin", {
              code: this.global_data.login_code,
              iv: this.global_data.iv,
              encrypted_data: this.global_data.encrypted_data,
            })
              .then((res) => {
                wx.hideLoading();
                if (res.data.code == 10000) {
                  try {
                    wx.setStorageSync("uid", res.data.data.uid);
                    wx.setStorageSync("token", res.data.data.token);
                  } catch (e) {
                    console.log(e);
                  }
                  resolve(res);
                } else {
                  reject(res);
                }
              })
              .catch((err) => {
                wx.hideLoading();
                reject(err);
              });
          } else {
            wx.showToast({
              title: "登录失败",
              icon: "none",
            });
          }
        })
        .catch((err) => {
          wx.showToast({
            title: "登录失败",
            icon: "none",
          });
        });
    });
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
    background_music.onEnded(() => {
      this.playBgSound();
    });
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
  onShow: function onShow() {},
  playSound: function (src) {
    if (this.sound_close) {
      return;
    }
    inner_audio_context.stop();
    inner_audio_context.src = assetHost + "audios/" + src + ".m4a";
    setTimeout(() => {
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
  playBgSound: function () {
    // ios不播放背景音乐;
    if (this.is_ios) {
      return;
    }
    if (this.sound_close) {
      return;
    }
    background_music.stop();
    background_music.src = assetHost + "audios/background.m4a";
    background_music.coverImgUrl = assetHost + "challenge/cover.png";
    background_music.title = "百科知识挑战";
    setTimeout(() => {
      background_music.play();
    }, 80);
  },
  stopPlayBgSound: function () {
    background_music.stop();
  },
  stopInnerAudio: function () {
    inner_audio_context.stop();
  },
  onHide: function () {
    background_music.stop();
  },
});
