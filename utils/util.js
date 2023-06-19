const httpHost = "https://example.com/";

// const httpHost = 'http://192.168.0.108:8180/';

// const httpHost = 'http://127.0.0.1:8180/';

var COS = require("../libs/cos-wx-sdk-v5.min");

var COS_CONFIG = {
  bucket: "bucket-1256650966",
  region: "ap-beijing",
};

function httpRequest(url, method, data, json) {
  let headers = {};
  if (json == false) {
    headers["content-type"] = "application/x-www-form-urlencoded";
  } else {
    headers["content-type"] = "application/json";
  }
  if (wx.getStorageSync("uid") && wx.getStorageSync("token")) {
    headers["Authorization"] =
      "Bearer " + wx.getStorageSync("uid") + "_" + wx.getStorageSync("token");
  }

  return new Promise((resolve, reject) => {
    wx.request({
      url: url,
      method: method,
      data: data,
      header: headers,
      success: resolve,
      fail: reject,
    });
  });
}

function httpPOST(url, data) {
  return httpRequest(httpHost + url, "POST", data, false);
}

function httpJsonPOST(url, data) {
  return httpRequest(httpHost + url, "POST", data, true);
}

function httpDELETE(url, data) {
  return httpRequest(httpHost + url, "DELETE", data, false);
}

function httpGET(url, data) {
  return httpRequest(httpHost + url, "GET", data, false);
}

var getAuthorization = function (options, callback) {
  httpGET("api/common/qcloud/temporay_key")
    .then((res) => {
      if (res.data.code != 10000) {
        wx.showToast({
          title: res.data.message,
          icon: "none",
        });
        return;
      }
      callback({
        TmpSecretId: res.data.data.credentials.tmp_secret_id,
        TmpSecretKey: res.data.data.credentials.tmp_secret_key,
        SecurityToken: res.data.data.credentials.session_token,
        StartTime: res.data.data.start_time,
        ExpiredTime: res.data.data.expired_time,
      });
    })
    .catch((e) => {
      wx.showToast({
        title: "网络异常",
        icon: "none",
      });
    });
};

var cos = new COS({
  getAuthorization: getAuthorization,
});

function generateKey(local_path) {
  var suffix = local_path.split(".").pop();
  if (!suffix) {
    suffix = ".png";
  } else {
    suffix = "." + suffix;
  }
  return "challenge/" + Date.now() + suffix;
}

function uploadImage(local_path, cb) {
  var key = generateKey(local_path);
  cos.postObject(
    {
      Bucket: COS_CONFIG.bucket,
      Region: COS_CONFIG.region,
      Key: key,
      FilePath: local_path,
      onProgress: function (info) {
        console.log(JSON.stringify(info));
      },
    },
    cb
  );
}

function shareGetCoin() {
  httpPOST("api/coin/operate", {
    source: 3,
  }).then((res) => {
    if (res.data.code != 10000) {
      showToast(res.data.message);
    } else {
      if (res.data.data.result == 1) {
        setTimeout(() => {
          showToast("恭喜你，分享获得1000百科币:)");
        }, 2000);
      }
    }
  });
}

function showToast(title, icon, time, mask) {
  return new Promise((res, rej) => {
    wx.showToast({
      title: title,
      icon: icon || "none",
      duration: time || 2500,
      mask: mask || false,
      success: res,
    });
  });
}
const inner_audio_context = wx.createInnerAudioContext({
  useWebAudioImplement: false,
});
const background_music = wx.getBackgroundAudioManager();

wx.setInnerAudioOption({
  mixWithOther: true,
  obeyMuteSwitch: false,
});

export {
  background_music,
  inner_audio_context,
  httpPOST,
  httpJsonPOST,
  httpDELETE,
  httpGET,
  uploadImage,
  generateKey,
  shareGetCoin,
  showToast,
};
