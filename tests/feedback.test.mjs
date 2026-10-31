import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import vm from 'node:vm';

const file = new URL('../utils/feedback.js', import.meta.url);
function factory() {
  assert.ok(existsSync(file), 'feedback controller must exist');
  const source = readFileSync(file, 'utf8').replace(/export\s*\{[\s\S]*?\};?\s*$/, '');
  const context = vm.createContext({ setTimeout, clearTimeout });
  vm.runInContext(source + '\nthis.createController = createFeedbackController;', context);
  return context.createController;
}
function setup() {
  const timers = new Map();
  let timerId = 0;
  const page = () => ({ data: {}, setData(patch) { Object.assign(this.data, patch); } });
  const a = page();
  const b = page();
  let current = a;
  const controller = factory()({
    getCurrentPage: () => current,
    setTimeout(fn, delay) { const id = ++timerId; timers.set(id, { fn, delay }); return id; },
    clearTimeout(id) { timers.delete(id); },
  });
  return { ...controller, a, b, timers, switchTo(p) { current = p; } };
}

test('toast renders immediately, resolves before dismissal and uses compatible defaults', async () => {
  const s = setup();
  const shown = s.showToast('已保存');
  assert.equal(s.a.data.ui_feedback.toast.title, '已保存');
  assert.equal(s.a.data.ui_feedback.toast.icon, 'none');
  assert.equal(s.a.data.ui_feedback.toast.mask, false);
  assert.equal(s.a.data.ui_feedback.loading, null);
  await shown;
  assert.equal(s.timers.size, 1);
  const [{ fn, delay }] = s.timers.values();
  assert.equal(delay, 2500);
  fn();
  assert.equal(s.a.data.ui_feedback.toast, null);
});

test('a stale toast timer cannot dismiss a newer toast', () => {
  const s = setup();
  s.showToast('first', 'success', 100, true);
  const first = [...s.timers.values()][0];
  s.showToast({ title: 'second', icon: 'error', duration: 800, mask: false });
  first.fn();
  assert.equal(s.a.data.ui_feedback.toast.title, 'second');
  assert.equal(s.a.data.ui_feedback.toast.icon, 'error');
  assert.equal([...s.timers.values()][0].delay, 800);
  assert.equal(s.timers.size, 1);
});

test('toast expiry updates its captured page after navigation', () => {
  const s = setup();
  s.showToast('page a');
  const first = [...s.timers.values()][0];
  s.switchTo(s.b);
  s.showToast('page b');
  first.fn();
  assert.equal(s.a.data.ui_feedback.toast, null);
  assert.equal(s.b.data.ui_feedback.toast.title, 'page b');
});

test('loading handles dismiss only their own operation and captured page', () => {
  const s = setup();
  const old = s.showLoading('first');
  const current = s.showLoading({ title: 'second', mask: true });
  assert.equal(current.page, s.a);
  assert.notEqual(old.token, current.token);
  s.hideLoading(old);
  assert.equal(s.a.data.ui_feedback.loading.title, 'second');
  s.switchTo(s.b);
  const onB = s.showLoading('third');
  s.hideLoading(current);
  assert.equal(s.a.data.ui_feedback.loading, null);
  assert.equal(s.b.data.ui_feedback.loading.title, 'third');
  s.hideLoading(onB);
  assert.equal(s.b.data.ui_feedback.loading, null);
});

test('default hideLoading clears current page and preserves toast', () => {
  const s = setup();
  s.showLoading();
  assert.equal(s.a.data.ui_feedback.loading.title, '加载中');
  s.showToast('toast');
  s.switchTo(s.b);
  s.showLoading('b');
  s.hideLoading();
  assert.equal(s.b.data.ui_feedback.loading, null);
  assert.equal(s.a.data.ui_feedback.loading.title, '加载中');
  assert.equal(s.a.data.ui_feedback.toast.title, 'toast');
});

test('clearing a page cancels timers and invalidates stale handles after reuse', () => {
  const s = setup();
  s.showToast('old');
  const oldTimer = [...s.timers.values()][0];
  const oldLoading = s.showLoading('old');
  s.clearFeedback(s.a);
  assert.equal(s.timers.size, 0);
  assert.equal(s.a.data.ui_feedback.toast, null);
  assert.equal(s.a.data.ui_feedback.loading, null);
  s.showToast('new');
  s.showLoading('new');
  oldTimer.fn();
  s.hideLoading(oldLoading);
  assert.equal(s.a.data.ui_feedback.toast.title, 'new');
  assert.equal(s.a.data.ui_feedback.loading.title, 'new');
});

test('calls without a current page are harmless and stale empty handles never clear another page', async () => {
  const s = setup();
  s.switchTo(undefined);
  await s.showToast('no page');
  const handle = s.showLoading('no page');
  s.hideLoading();
  s.clearFeedback(undefined);
  s.switchTo(s.a);
  s.showLoading('valid');
  s.hideLoading(handle);
  assert.equal(s.a.data.ui_feedback.loading.title, 'valid');
});

test('component lifecycle cleanup uses the owning page captured on attachment', () => {
  let definition;
  const a = { id: 'a' };
  const b = { id: 'b' };
  let current = a;
  const cleared = [];
  const source = readFileSync(new URL('../component/ui-feedback/ui-feedback.js', import.meta.url), 'utf8')
    .replace(/^import[^\n]*\n/, '');
  vm.runInNewContext(source, {
    Component(value) { definition = value; },
    getCurrentPages() { return [current]; },
    clearFeedback(page) { cleared.push(page); },
  });
  const component = {};
  definition.lifetimes.attached.call(component);
  current = b;
  definition.pageLifetimes.hide.call(component);
  definition.lifetimes.detached.call(component);
  assert.deepEqual(cleared, [a, a]);
  assert.equal(component.feedbackPage, null);
});

test('toast dismissal preserves loading and page clearing leaves other pages intact', () => {
  const s = setup();
  s.showLoading({ title: 'saving', mask: true });
  s.showToast('notice');
  [...s.timers.values()][0].fn();
  assert.equal(s.a.data.ui_feedback.loading.title, 'saving');
  assert.equal(s.a.data.ui_feedback.loading.mask, true);
  s.switchTo(s.b);
  s.showToast('b');
  s.showLoading('b');
  s.clearFeedback(s.a);
  assert.equal(s.b.data.ui_feedback.toast.title, 'b');
  assert.equal(s.b.data.ui_feedback.loading.title, 'b');
});
