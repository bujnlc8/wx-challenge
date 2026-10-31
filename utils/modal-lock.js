// Each visible component owns one token on the page captured at attachment.
// Closing one modal must not unlock another modal or a newly navigated page.
const modalPages = new WeakMap();
function currentModalPage() {
  if (typeof getCurrentPages !== "function") return undefined;
  const pages = getCurrentPages();
  return pages[pages.length - 1];
}
function createModalLock(page = currentModalPage()) {
  const token = {};
  let requested = false;
  let active = true;
  let disposed = false;
  function sync() {
    if (!page || typeof page.setData !== "function") return;
    let state = modalPages.get(page);
    if (!state) {
      state = { tokens: new Set(), locked: false };
      modalPages.set(page, state);
    }
    if (requested && active && !disposed) state.tokens.add(token);
    else state.tokens.delete(token);
    const locked = state.tokens.size > 0;
    if (locked !== state.locked) {
      state.locked = locked;
      page.setData({ modal_locked: locked });
    }
  }
  return {
    set(visible) {
      if (!disposed) {
        requested = !!visible;
        sync();
      }
    },
    hide() {
      active = false;
      sync();
    },
    show() {
      if (!disposed) {
        active = true;
        sync();
      }
    },
    dispose() {
      disposed = true;
      requested = false;
      sync();
    },
  };
}
export { createModalLock };
