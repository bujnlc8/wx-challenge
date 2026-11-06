const APP_VERSION = "2026.11.07.2";

function getAppVersion(platform = wx) {
  try {
    const info = platform.getAccountInfoSync();
    const version = info && info.miniProgram && info.miniProgram.version;
    if (typeof version === "string" && version.trim()) return version.trim();
  } catch (error) {
    // Development builds and unavailable account info use the packaged version.
  }
  return APP_VERSION;
}

export { APP_VERSION, getAppVersion };
