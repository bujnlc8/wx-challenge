import { requestWithSession } from "./auth-session";
import { showToast, showLoading, hideLoading } from "./feedback";

const httpHost = "https://challenge.haihui.site/";

// const httpHost = 'http://192.168.0.108:8180/';

// const httpHost = 'http://127.0.0.1:8180/';

var COS = require("../libs/cos-wx-sdk-v5.min");

var COS_CONFIG = {
  bucket: "bucket-1256650966",
  region: "ap-beijing",
};

function httpRequest(url, method, data, json) {
  return requestWithSession(url, method, data, json);
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
        showToast({
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
      showToast({
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


const inner_audio_context = wx.createInnerAudioContext({
  useWebAudioImplement: false,
});

wx.setInnerAudioOption({
  mixWithOther: true,
  obeyMuteSwitch: false,
});

export {
  inner_audio_context,
  httpPOST,
  httpJsonPOST,
  httpDELETE,
  httpGET,
  uploadImage,
  generateKey,
  showToast,
  showLoading,
  hideLoading,
};
