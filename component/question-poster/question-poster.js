const app = getApp();
import { getSessionIdentity } from "../../utils/auth-session";
import { createModalLock } from "../../utils/modal-lock";
import { httpPOST } from "../../utils/util";
import { showToast } from "../../utils/feedback";
import {
  normalizeQuestion,
  layoutPoster,
  drawPoster,
  runtimeEnvironment,
  validateShareCode,
  createPosterSession,
} from "../../utils/question-poster-render";

function identity() {
  let env = "";
  try {
    env = wx.getAccountInfoSync().miniProgram.envVersion;
  } catch (error) {
    /* Runtime is validated before requesting a code. */
  }
  return JSON.stringify([getSessionIdentity(), env]);
}
function removeTemporary(path) {
  if (!path) return;
  try {
    wx.getFileSystemManager().unlink({ filePath: path, fail() {} });
  } catch (error) {
    /* Best-effort cleanup. */
  }
}
function loadImage(canvas, src) {
  return new Promise((resolve, reject) => {
    const image = canvas.createImage();
    const timer = setTimeout(
      () => reject(Error("图片读取超时，请重试")),
      12000,
    );
    image.onload = () => {
      clearTimeout(timer);
      if (image.width > 0 && image.height > 0) resolve(image);
      else reject(Error("题目图片尺寸异常，请重试"));
    };
    image.onerror = () => {
      clearTimeout(timer);
      reject(Error("题目图片读取失败，请检查网络后重试"));
    };
    image.src = src;
  });
}
function localImagePath(src) {
  return new Promise((resolve, reject) => {
    wx.getImageInfo({
      src,
      success: (result) =>
        result.path ? resolve(result.path) : reject(Error("empty path")),
      fail: reject,
    });
  });
}
function getCanvas(component) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(Error("海报画布尚未就绪，请重试")),
      5000,
    );
    component
      .createSelectorQuery()
      .select("#question-poster-canvas")
      .fields({ node: true })
      .exec((result) => {
        clearTimeout(timer);
        const canvas = result && result[0] && result[0].node;
        if (canvas) resolve(canvas);
        else reject(Error("海报画布尚未就绪，请重试"));
      });
  });
}
function exportCanvas(canvas, component, layout) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => {
      settled = true;
      reject(Error("海报导出超时，请重试"));
    }, 12000);
    wx.canvasToTempFilePath(
      {
        canvas,
        width: layout.width,
        height: layout.height,
        destWidth: layout.width,
        destHeight: layout.height,
        fileType: "png",
        success(result) {
          if (settled) {
            removeTemporary(result.tempFilePath);
            return;
          }
          settled = true;
          clearTimeout(timer);
          if (result.tempFilePath) resolve(result.tempFilePath);
          else reject(Error("海报导出失败，请重试"));
        },
        fail() {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          reject(Error("海报导出失败，请重试，或尝试分享较短的题目"));
        },
      },
      component,
    );
  });
}

Component({
  data: {
    appMode: false,
    visible: false,
    loading: false,
    error: "",
    imagepath: "",
    environmentNote: "",
    saving: false,
    albumDenied: false,
    saveMessage: "",
  },
  lifetimes: {
    attached() {
      this._modalLock = createModalLock();
      this._modalLock.set(this.data.visible);
      this._session = createPosterSession(identity);
      this._disposed = false;
      this._renderQueue = Promise.resolve();
    },
    detached() {
      if (this._modalLock) this._modalLock.dispose();
      this._disposed = true;
      if (this._session) this._session.cancel();
      this._current = null;
      this._question = null;
    },
  },
  pageLifetimes: {
    hide() {
      this.close("page-hide");
      if (this._modalLock) this._modalLock.hide();
    },
    show() {
      if (this._modalLock) this._modalLock.show();
      if (this._current) this._current();
    },
  },
  methods: {
    openApp() {
      return this.open(null, true);
    },
    async open(question, appMode = false) {
      if (this._disposed) return;
      if (!this._session) this._session = createPosterSession(identity);
      const guard = this._session.begin();
      const current = () => {
        if (this._disposed || this._current !== current || !this.data.visible)
          return false;
        if (!guard()) {
          this.close("stale");
          return false;
        }
        return true;
      };
      this._current = current;
      this._question = question
        ? {
            ...question,
            options: Array.isArray(question.options)
              ? question.options.slice()
              : question.options,
          }
        : null;
      this.setData({
        appMode,
        visible: true,
        loading: true,
        error: "",
        imagepath: "",
        environmentNote: "",
        saving: false,
        albumDenied: false,
        saveMessage: "",
      });
      if (this._modalLock) this._modalLock.set(true);
      try {
        if (appMode) {
          this.setData({
            loading: false,
            imagepath: "/images/app-share-poster.png",
          });
          return;
        }
        const id = Number(question && question.id);
        if (!Number.isSafeInteger(id) || id <= 0)
          throw Error("题目暂未准备好，请稍后重试");
        const content = normalizeQuestion(this._question);
        const env = runtimeEnvironment(wx);
        this.setData({
          environmentNote:
            env === "release"
              ? ""
              : env === "trial"
                ? "体验版海报，仅体验成员可扫码进入"
                : "开发版海报，仅开发成员可扫码进入",
        });
        const response = await httpPOST("api/question/share-code", {
          question_id: id,
          env_version: env,
        });
        if (!current()) return;
        const result = response && response.data;
        if (!result || Number(result.code) !== 10000)
          throw Error(
            (result && result.message) || "小程序码暂时无法生成，请重试",
          );
        validateShareCode(result.data, id, env);
        const code = result.data;
        // The component owns one canvas. Queue renders so older exports cannot race a newer drawing.
        const task = (this._renderQueue || Promise.resolve()).then(() => {
          if (!current()) return "";
          return this.renderPoster(content, code, env, current);
        });
        this._renderQueue = task.catch(() => {});
        const path = await task;
        if (!current()) {
          removeTemporary(path);
          return;
        }
        this.setData({ loading: false, imagepath: path, error: "" });
      } catch (error) {
        if (!current()) return;
        this.setData({
          loading: false,
          error: String(
            (error && error.message) || "海报暂时无法生成，请检查网络后重试",
          ),
          imagepath: "",
        });
      }
    },
    async renderPoster(question, code, env, current) {
      let canvas;
      try {
        canvas = await getCanvas(this);
        if (!current()) return "";
        const sources = [];
        const blocks = question.blocks.concat(
          ...question.options.map((option) => option.blocks),
        );
        for (const block of blocks) {
          if (block.type === "image" && !sources.includes(block.src))
            sources.push(block.src);
        }
        const images = {};
        // Load sequentially to avoid decoding a large image collection at once.
        for (const source of sources) {
          images[source] = await loadImage(canvas, source);
          if (!current()) return "";
        }
        const qr = await loadImage(
          canvas,
          "data:" + code.mime_type + ";base64," + code.image_base64,
        );
        if (!current()) return "";
        const logo = await loadImage(canvas, "/images/ui-about-logo.png");
        if (!current()) return "";
        const context = canvas.getContext("2d");
        const layout = layoutPoster(context, question, images);
        canvas.width = layout.width;
        canvas.height = layout.height;
        drawPoster(context, layout, question, images, qr, logo, env);
        const path = await exportCanvas(canvas, this, layout);
        if (!current()) {
          removeTemporary(path);
          return "";
        }
        return path;
      } finally {
        if (canvas) {
          canvas.width = 1;
          canvas.height = 1;
        }
      }
    },
    close(reason) {
      if (this._modalLock) this._modalLock.set(false);
      const wasVisible = this.data.visible;
      if (wasVisible && !this._disposed && reason && reason.type === "tap")
        app.clickSound();
      if (this._session) this._session.cancel();
      this._current = null;
      this._question = null;
      if (!this._disposed)
        this.setData({
          visible: false,
          loading: false,
          error: "",
          imagepath: "",
          saving: false,
          albumDenied: false,
          saveMessage: "",
        });
      if (wasVisible && !this._disposed)
        this.triggerEvent("close", {
          reason: typeof reason === "string" ? reason : "user",
        });
    },
    retry() {
      if (
        this._disposed ||
        !this.data.visible ||
        (!this.data.appMode && !this._question)
      )
        return;
      app.clickSound();
      if (this.data.appMode) return this.openApp();
      if (this._question) return this.open(this._question);
    },
    async preview() {
      const current = this._current;
      if (!current || !current() || !this.data.imagepath) return;
      app.clickSound();
      let path = this.data.imagepath;
      if (this.data.appMode) {
        try {
          path = await localImagePath(path);
        } catch (error) {
          if (current())
            this.setData({ saveMessage: "海报读取失败，请重新打开海报后重试" });
          return;
        }
        if (!current()) return;
      }
      wx.previewImage({
        current: path,
        urls: [path],
        fail: () => {
          if (current())
            this.setData({ saveMessage: "预览暂时无法打开，请重试" });
        },
      });
    },
    async save() {
      const current = this._current;
      if (!current || !current() || !this.data.imagepath || this.data.saving)
        return;
      app.clickSound();
      this.setData({ saving: true, saveMessage: "", albumDenied: false });
      let path = this.data.imagepath;
      if (this.data.appMode) {
        try {
          path = await localImagePath(path);
        } catch (error) {
          if (current())
            this.setData({
              saving: false,
              saveMessage: "海报读取失败，请重新打开海报后重试",
            });
          return;
        }
        if (!current()) return;
      }
      wx.saveImageToPhotosAlbum({
        filePath: path,
        success: () => {
          if (!current()) return;
          this.setData({
            saving: false,
            saveMessage: "已保存到相册，可以分享给朋友",
          });
          showToast("已保存到相册", "success");
        },
        fail: (error) => {
          if (!current()) return;
          const denied = /auth|deny|denied|permission/i.test(
            (error && error.errMsg) || "",
          );
          this.setData({
            saving: false,
            albumDenied: denied,
            saveMessage: denied
              ? "保存海报需要相册权限。请前往设置允许访问相册，或点击预览后长按保存。"
              : "保存失败，请检查相册或存储空间后重试",
          });
        },
      });
    },
    openAlbumSettings() {
      const current = this._current;
      if (!current || !current()) return;
      app.clickSound();
      wx.openSetting({
        success: (result) => {
          if (!current()) return;
          if (
            result.authSetting &&
            result.authSetting["scope.writePhotosAlbum"]
          ) {
            this.setData({
              albumDenied: false,
              saveMessage: "相册权限已开启，请点击保存到相册",
            });
          } else
            this.setData({
              saveMessage: "仍未开启相册权限，可以点击预览后长按保存",
            });
        },
        fail: () => {
          if (current())
            this.setData({
              saveMessage: "设置暂时无法打开，可以点击预览后长按保存",
            });
        },
      });
    },
    handleImageError() {
      if (this._current && this._current())
        this.setData({
          error: this.data.appMode
            ? "海报预览读取失败，请重新打开"
            : "海报预览读取失败，请重新生成",
          imagepath: "",
        });
    },
    preventTouch() {},
  },
});
