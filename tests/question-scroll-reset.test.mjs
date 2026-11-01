import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

function setup(mode, { scrollApi = true, pageStackApi = true } = {}) {
  let definition, top;
  const callbacks = [], scrolls = [], advances = [];
  const poster = { data: { visible: false }, close() { this.data.visible = false; }, open() { this.data.visible = true; } };
  const wx = scrollApi ? { pageScrollTo(options) { scrolls.push(options); } } : {};
  const scope = {
    wx,
    Page(value) { definition = value; },
    getApp: () => ({ show_analysis: 1, show_correct_answer: 1, clickSound() {}, playSound() {}, stopInnerAudio() {} }),
    setInterval: () => 1, clearInterval() {}, setTimeout(callback) { advances.push(callback); },
    showToast() {},
  };
  if (pageStackApi) scope.getCurrentPages = () => [top];
  vm.runInNewContext(fs.readFileSync(new URL(`../pages/${mode}/${mode}.js`, import.meta.url), 'utf8')
    .replace(/import[\s\S]*?from\s+["'][^"']+["'];?/g, ''), scope);
  const page = {
    ...definition,
    data: structuredClone(definition.data),
    setData(patch, complete) {
      Object.assign(this.data, patch);
      if (typeof complete === 'function') callbacks.push(complete);
    },
    selectComponent() { return poster; },
    report: { getCaptcha() {} },
  };
  top = page;
  return { page, callbacks, scrolls, poster, advance() { advances.shift()(); }, navigate() { top = {}; }, render() { callbacks.splice(0).forEach(callback => callback()); } };
}
const question = (id) => ({ id, content: '较长的题目正文\n第二行', options: '甲|乙|丙|丁' });

for (const mode of ['answer', 'training']) {
  test(`${mode} resets only after the new-question render finishes`, () => {
    const s = setup(mode);
    s.page._startAnswer(question(11), 1);
    assert.equal(s.scrolls.length, 0);
    assert.equal(s.page.data.current_question_id, 11);
    assert.equal(s.page.data.selected_option, 0);
    assert.equal(s.page.data.interval_handle, 1, 'the clock starts without waiting for a render callback');
    assert.equal(s.callbacks.length, 1, 'new question render needs one completion callback');
    s.render();
    assert.equal(s.scrolls.length, 1);
    assert.equal(s.scrolls[0].scrollTop, 0);
    assert.equal(s.scrolls[0].duration, 0);
  });

  test(`${mode} ignores old render callbacks after rapid changes including a repeated question id`, () => {
    const s = setup(mode);
    s.page._startAnswer(question(11), 1);
    s.page._startAnswer(question(12), 1);
    s.page._startAnswer(question(11), -1);
    assert.equal(s.callbacks.length, 3);
    s.callbacks.shift()(); s.callbacks.shift()();
    assert.equal(s.scrolls.length, 0);
    s.render();
    assert.equal(s.scrolls.length, 1);
  });

  test(`${mode} late renders cannot scroll hidden, unloaded or navigated-away pages`, () => {
    for (const action of ['hide', 'unload', 'navigate']) {
      const s = setup(mode);
      s.page._startAnswer(question(11), 1);
      if (action === 'hide') s.page.onHide();
      else if (action === 'unload') s.page.onUnload();
      else s.navigate();
      s.render();
      assert.equal(s.scrolls.length, 0, action);
    }
  });

  test(`${mode} a late new-question callback does not disturb feedback, poster, subscription or results`, () => {
    for (const overlay of ['feedback', 'poster', 'subscription', 'modal', 'submitting', 'result']) {
      const s = setup(mode);
      s.page._startAnswer(question(11), 1);
      if (overlay === 'feedback') s.page.doFeedback();
      if (overlay === 'poster') s.page.openQuestionPoster();
      if (overlay === 'subscription') s.page._subscriptionPanelOpen = true;
      if (overlay === 'modal') s.page.data.modal_locked = true;
      if (overlay === 'submitting') s.page.setData({ answer_result: -1 });
      if (overlay === 'result') s.page.setData({ answer_result: 1 });
      s.render();
      assert.equal(s.scrolls.length, 0, overlay);
    }
  });

  test(`${mode} tolerates a missing scroll API or page stack API`, () => {
    const noScroll = setup(mode, { scrollApi: false });
    noScroll.page._startAnswer(question(11), 1);
    assert.doesNotThrow(() => noScroll.render());
    const noStack = setup(mode, { pageStackApi: false });
    noStack.page._startAnswer(question(11), 1); noStack.render();
    assert.equal(noStack.scrolls.length, 1);
  });
}

test('practice next and previous actions each reset after rendering while answer state/timer flow stays intact', () => {
  const s = setup('training');
  s.page.data.questions = [question(11), question(12)];
  s.page._startAnswer(question(11), 1); s.render();
  s.page.setData({ answer_result: 1, answered_ids: [11] });
  s.page.nextQuestion({ type: 'tap' });
  assert.equal(s.page.data.current_question_id, 12);
  assert.equal(s.page.data.total_index, 2);
  assert.equal(s.scrolls.length, 1);
  s.render(); assert.equal(s.scrolls.length, 2);
  s.page.upQuestion();
  assert.equal(s.page.data.current_question_id, 11);
  assert.equal(s.page.data.total_index, 1);
  assert.equal(s.page.data.answer_result, -2);
  assert.equal(s.scrolls.length, 2);
  s.render(); assert.equal(s.scrolls.length, 3);
});

test('challenge automatic advance resets only when its newly rendered question is current', () => {
  const s = setup('answer');
  s.page.data.questions = [question(11), question(12)];
  s.page.startAnswer(); s.render();
  s.page.setData({ answer_result: 1, current_index: 1 });
  s.page.queueNextQuestion(2000);
  assert.equal(s.scrolls.length, 1);
  s.advance();
  assert.equal(s.page.data.current_question_id, 12);
  assert.equal(s.page.data.answer_result, -2);
  assert.equal(s.scrolls.length, 1);
  s.render();
  assert.equal(s.scrolls.length, 2);
});
