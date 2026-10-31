import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

function setup(category = 1) {
  const app = {
    category,
    category_lables: ['全部', '历史', '科学'],
    categories: { 0: '全部', 1: '历史', 2: '科学' },
    clickSound() {},
  };
  const storage = new Map([['question_category', category]]);
  const notices = [];
  let page;
  const source = readFileSync(new URL('../pages/mine/mine.js', import.meta.url), 'utf8')
    .replace(/import\s*\{[\s\S]*?\}\s*from\s*["'][^"']+["'];?/g, '');
  vm.runInNewContext(source, {
    getApp: () => app,
    Page(definition) { page = definition; },
    wx: { setStorageSync(key, value) { storage.set(key, value); } },
    showToast(message) { notices.push(message); },
  });
  page.data = { ...page.data, category };
  page.setData = (patch) => Object.assign(page.data, patch);
  return { page, app, storage, notices };
}

test('a draft selection leaves the active category and persisted filter unchanged', () => {
  const { page, app, storage, notices } = setup();
  assert.equal(typeof page.openCategorySheet, 'function', 'category selection needs a draft stage');
  page.openCategorySheet();
  assert.equal(page.data.category_sheet_visible, true);
  assert.equal(page.data.category_draft, 1);
  page.chooseCategoryDraft({ currentTarget: { dataset: { index: 2 } } });
  assert.equal(page.data.category_draft, 2);
  assert.equal(page.data.category, 1);
  assert.equal(app.category, 1);
  assert.equal(storage.get('question_category'), 1);
  assert.deepEqual(notices, []);
});

test('cancel discards the draft and reopening starts from the active category', () => {
  const { page, app, storage } = setup();
  assert.equal(typeof page.openCategorySheet, 'function');
  page.openCategorySheet();
  page.chooseCategoryDraft({ currentTarget: { dataset: { index: 2 } } });
  page.cancelCategorySheet();
  assert.equal(page.data.category_sheet_visible, false);
  assert.equal(app.category, 1);
  assert.equal(storage.get('question_category'), 1);
  page.openCategorySheet();
  assert.equal(page.data.category_draft, 1);
});

test('confirm applies the draft through the existing category persistence contract', () => {
  const { page, app, storage, notices } = setup();
  assert.equal(typeof page.openCategorySheet, 'function');
  page.openCategorySheet();
  page.chooseCategoryDraft({ currentTarget: { dataset: { index: '2' } } });
  page.confirmCategorySheet();
  assert.equal(page.data.category_sheet_visible, false);
  assert.equal(page.data.category, 2);
  assert.equal(app.category, 2);
  assert.equal(storage.get('question_category'), 2);
  assert.equal(notices.length, 1);
  assert.match(notices[0], /科学/);
});

test('confirming all categories preserves zero as a valid filter', () => {
  const { page, app, storage, notices } = setup();
  assert.equal(typeof page.openCategorySheet, 'function');
  page.openCategorySheet();
  page.chooseCategoryDraft({ currentTarget: { dataset: { index: 0 } } });
  page.confirmCategorySheet();
  assert.equal(page.data.category, 0);
  assert.equal(app.category, 0);
  assert.equal(storage.get('question_category'), 0);
  assert.deepEqual(notices, []);
});

test('invalid draft indices cannot replace the active filter', () => {
  const { page, app, storage } = setup();
  assert.equal(typeof page.openCategorySheet, 'function');
  page.openCategorySheet();
  for (const index of [-1, 3, 'invalid', 1.5]) {
    page.chooseCategoryDraft({ currentTarget: { dataset: { index } } });
    assert.equal(page.data.category_draft, 1);
  }
  page.cancelCategorySheet();
  page.confirmCategorySheet();
  assert.equal(app.category, 1);
  assert.equal(storage.get('question_category'), 1);
});
