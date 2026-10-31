import {
  DAILY_TEMPLATE_ID,
  createDailySubscription,
  hasDailyPrompt,
  markDailyPrompt,
} from "./daily-subscription";

function createDailyReminder({
  platform,
  loadPreference,
  recordAcceptance,
  now = Date.now,
  onNativeOpen = () => {},
  onNativeSettled = () => {},
}) {
  let disposed = false;
  let preference = null;
  let preferenceOwner = "";
  let reading = null;
  let readingOwner = "";
  let operation = 0;
  let requesting = false;
  let nativeOwner = "";
  let nativeOpen = false;
  const owner = () =>
    JSON.stringify([
      platform.getStorageSync("uid") || "",
      platform.getStorageSync("token") || "",
    ]);
  const client = createDailySubscription({
    platform,
    recordAcceptance,
    now,
    onNativeSettled() {
      nativeOpen = false;
      if (!disposed && owner() === nativeOwner) onNativeSettled();
    },
  });
  return {
    refresh() {
      if (disposed) return Promise.resolve();
      const account = owner();
      if (preferenceOwner !== account) preference = null;
      if (!platform.getStorageSync("uid")) {
        preferenceOwner = account;
        return Promise.resolve();
      }
      if (reading && readingOwner === account) return reading;
      const token = ++operation;
      preference = null;
      readingOwner = account;
      // Begin the read immediately; it never participates in the submit gesture.
      let task;
      try {
        task = loadPreference();
      } catch (error) {
        task = Promise.reject(error);
      }
      const pending = Promise.resolve(task)
        .then((settings) => {
          if (disposed || operation !== token || owner() !== account) return;
          preference = settings;
          preferenceOwner = account;
        })
        .catch(() => {
          if (operation === token && owner() === account) {
            preference = null;
            preferenceOwner = account;
          }
        })
        .finally(() => {
          if (reading === pending) reading = null;
        });
      reading = pending;
      return pending;
    },
    prompt() {
      if (
        disposed ||
        requesting ||
        typeof platform.requestSubscribeMessage !== "function" ||
        !platform.getStorageSync("uid") ||
        preferenceOwner !== owner() ||
        !preference ||
        preference.enabled !== true
      )
        return false;
      const templateId = preference.template_id || DAILY_TEMPLATE_ID;
      try {
        const timestamp = now();
        if (
          hasDailyPrompt(platform, templateId, timestamp) ||
          !markDailyPrompt(platform, templateId, timestamp)
        )
          return false;
      } catch (error) {
        return false;
      }
      requesting = true;
      nativeOwner = owner();
      nativeOpen = true;
      onNativeOpen();
      // Do not await. The answer request proceeds in this same gesture stack.
      client
        .request(templateId)
        .catch(() => {})
        .finally(() => {
          requesting = false;
        });
      return true;
    },
    isCurrentAccount() {
      return !nativeOwner || owner() === nativeOwner;
    },
    isNativeOpen() {
      return !disposed && nativeOpen && owner() === nativeOwner;
    },
    dispose() {
      disposed = true;
      operation++;
      preference = null;
      nativeOpen = false;
    },
  };
}
function reminderSettings(response) {
  if (!response || !response.data || Number(response.data.code) !== 10000)
    throw new Error("提醒设置暂时不可用");
  return response.data.data;
}
export { createDailyReminder, reminderSettings };
