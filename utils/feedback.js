// Page-owned feedback keeps asynchronous responses from dismissing another page's UI.
function createFeedbackController(options) {
  const getCurrentPage = options.getCurrentPage;
  const schedule = options.setTimeout || setTimeout;
  const cancel = options.clearTimeout || clearTimeout;
  const pages = new WeakMap();
  let nextToken = 0;

  function validPage(page) {
    return page && typeof page.setData === "function";
  }

  function stateFor(page) {
    let state = pages.get(page);
    if (!state) {
      state = { toast: null, loading: null, toastTimer: null, toastToken: null, loadingToken: null };
      pages.set(page, state);
    }
    return state;
  }

  function render(page, state) {
    page.setData({ ui_feedback: { toast: state.toast, loading: state.loading } });
  }

  function showToast(titleOrOptions, icon, time, mask) {
    const page = getCurrentPage();
    if (!validPage(page)) return Promise.resolve();
    const input = titleOrOptions && typeof titleOrOptions === "object"
      ? titleOrOptions : { title: titleOrOptions, icon, duration: time, mask };
    const state = stateFor(page);
    if (state.toastTimer !== null) cancel(state.toastTimer);
    const token = ++nextToken;
    state.toastToken = token;
    state.toast = {
      title: input.title == null ? "" : String(input.title),
      icon: input.icon || "none",
      mask: !!input.mask,
    };
    render(page, state);
    const duration = typeof input.duration === "number" && input.duration > 0 ? input.duration : 2500;
    state.toastTimer = schedule(() => {
      if (pages.get(page) !== state || state.toastToken !== token) return;
      state.toast = null;
      state.toastTimer = null;
      state.toastToken = null;
      render(page, state);
    }, duration);
    return Promise.resolve();
  }

  function showLoading(optionsOrTitle) {
    const page = getCurrentPage();
    const token = ++nextToken;
    const handle = { page, token };
    if (!validPage(page)) return handle;
    const input = optionsOrTitle && typeof optionsOrTitle === "object"
      ? optionsOrTitle : { title: optionsOrTitle };
    const state = stateFor(page);
    state.loadingToken = token;
    state.loading = {
      title: input.title == null ? "加载中" : String(input.title),
      mask: !!input.mask,
    };
    render(page, state);
    return handle;
  }

  function hideLoading(handle) {
    const page = handle ? handle.page : getCurrentPage();
    if (!validPage(page)) return;
    const state = pages.get(page);
    if (!state || (handle && handle.token !== state.loadingToken)) return;
    state.loading = null;
    state.loadingToken = null;
    render(page, state);
  }

  function clearFeedback(page) {
    if (!validPage(page)) return;
    const state = pages.get(page);
    if (!state) return;
    if (state.toastTimer !== null) cancel(state.toastTimer);
    pages.delete(page);
    render(page, { toast: null, loading: null });
  }

  return { showToast, showLoading, hideLoading, clearFeedback };
}

const feedback = createFeedbackController({
  getCurrentPage() {
    if (typeof getCurrentPages !== "function") return undefined;
    const pages = getCurrentPages();
    return pages[pages.length - 1];
  },
});
const showToast = feedback.showToast;
const showLoading = feedback.showLoading;
const hideLoading = feedback.hideLoading;
const clearFeedback = feedback.clearFeedback;

export { createFeedbackController, showToast, showLoading, hideLoading, clearFeedback };
