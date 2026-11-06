import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { loadAuth } from './helpers/auth-loader.mjs';

const read = path => fs.readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const strip = source => source.replace(/import[\s\S]*?from\s+["'][^"']+["'];?/g, '').replace(/export\s*\{[\s\S]*?\};?/g, '');
const tapEvent = dataset => ({ type: 'tap', currentTarget: { dataset }, target: { dataset } });
function fixture() {
  let now = 1000, serial = 0, app, definition;
  const timers = new Map(), played = [], requests = [], navigation = [];
  const storage = new Map([['uid', 'u1'], ['token', 't1']]);
  const audio = { src: '', playing: false, stop() { this.playing = false; }, play() { this.playing = true; played.push(this.src); }, onEnded() {} };
  const platform = {
    getStorageSync: key => storage.get(key), setStorageSync: (key, value) => storage.set(key, value), removeStorageSync: key => storage.delete(key),
    setNavigationBarTitle() {}, hideShareMenu() {}, setStorage() {},
    switchTab: o => navigation.push(o.url), redirectTo: o => navigation.push(o.url), navigateTo: o => navigation.push(o.url),
    previewImage: o => navigation.push(o.current), saveImageToPhotosAlbum: o => requests.push(o), openSetting: o => requests.push(o),
    getAccountInfoSync: () => ({ miniProgram: { envVersion: 'release' } }),
  };
  const { scope, api } = loadAuth({
    console, wx: platform, App: value => app = value, getApp: () => app, getCurrentPages: () => [],
    Page: value => definition = value, Component: value => definition = value,
    Date: class extends Date { static now() { return now; } }, Math, inner_audio_context: audio,
    setTimeout(callback, delay) { const id = ++serial; timers.set(id, { callback, due: now + delay }); return id; },
    clearTimeout: id => timers.delete(id), setInterval: () => ++serial, clearInterval() {},
    showToast() {}, showLoading() {}, hideLoading() {}, subscriptionRequestId: () => 'request-1',
    httpGET: () => new Promise(resolve => requests.push({ resolve })),
    httpPOST: (path, body) => new Promise(resolve => requests.push({ path, body, resolve })),
  });
  vm.runInContext(strip(read('app.js')), scope);
  for (const [path, names] of [
    ['utils/modal-lock.js', 'createModalLock'], ['utils/challenge-settings.js', 'DEFAULT_CHALLENGE_QUESTION_COUNT,MAX_CHALLENGE_QUESTION_COUNT,clampChallengeQuestionCountInput,getChallengeQuestionCount,parseChallengeQuestionCount,setChallengeQuestionCount'],
    ['utils/question-entry.js', 'parseQuestionEntry'], ['utils/version.js', 'APP_VERSION,getAppVersion'],
    ['utils/question-poster-render.js', 'normalizeQuestion,layoutPoster,drawPoster,runtimeEnvironment,validateShareCode,createPosterSession'],
  ]) Object.assign(scope, vm.runInContext('(function(){' + strip(read(path)) + '\nreturn {' + names + '};})()', scope));
  const advance = ms => {
    now += ms;
    for (const [id, task] of [...timers]) if (task.due <= now) { timers.delete(id); task.callback(); }
  };
  return { app, api, audio, played, requests, navigation, platform, storage, advance,
    load(path, component = false) {
      vm.runInContext('(function(){' + strip(read(path)) + '\n})()', scope);
      const page = { ...(component ? definition.methods : definition), data: { ...definition.data }, setData(patch, done) { Object.assign(this.data, patch); done?.(); }, selectComponent() { return { open() {}, openApp() {}, getCaptcha() {} }; }, triggerEvent() {} };
      if (component) definition.lifetimes?.attached?.call(page);
      return { page, definition };
    },
    click(action, sound = 'click') {
      advance(120);
      const count = played.length;
      const result = action();
      advance(80);
      assert.equal(played.length, count + 1, 'one gesture should play exactly one sound');
      assert.ok(played.at(-1).endsWith('/' + sound + '.m4a'), played.at(-1));
      return result;
    },
  };
}

test('stopping or hiding the app cancels scheduled effects before they can start', () => {
  for (const stop of ['stopInnerAudio', 'onHide']) {
    const f = fixture(); f.app.clickSound(); f.app[stop](); f.advance(1000);
    assert.equal(f.played.length, 0, stop);
    assert.equal(f.audio.playing, false);
  }
});
test('a newer result replaces pending click playback and muted or hidden apps stay silent', () => {
  const f = fixture(); f.app.clickSound(); f.app.playSound('correct'); f.advance(1000);
  assert.equal(f.played.length, 1); assert.ok(f.played[0].endsWith('/correct.m4a'));
  f.app.onHide(); f.app.playSound('warn'); f.advance(1000); assert.equal(f.played.length, 1);
  f.app.onShow(); f.app.sound_close = 1; f.app.playSound('warn'); f.advance(1000); assert.equal(f.played.length, 1);
});
test('turning effects off cancels pending sounds and turning them on gives one click', () => {
  const f = fixture(); const { page } = f.load('pages/setting/setting.js');
  f.app.clickSound(); page.operateSound(); f.advance(1000);
  assert.equal(f.played.length, 0); assert.equal(f.app.sound_close, 1);
  f.click(() => page.operateSound()); assert.equal(f.app.sound_close, 0);
});
test('setting presets, steps and invalid confirmation provide one click without saving invalid counts', () => {
  const f = fixture(); const { page } = f.load('pages/setting/setting.js'); page.onLoad();
  f.click(() => page.openQuestionCountSheet());
  f.click(() => page.chooseQuestionCount(tapEvent({ count: 50 })));
  f.click(() => page.stepQuestionCount(tapEvent({ step: -1 })));
  assert.equal(page.data.question_count_draft, '49');
  page.inputQuestionCount({ detail: { value: 'invalid' } });
  f.click(() => page.confirmQuestionCountSheet()); assert.equal(f.storage.has('challenge_question_count'), false);
});
test('help, about and category selection play once while keeping their intended actions', () => {
  const f = fixture(); const help = f.load('pages/help/help.js').page;
  f.click(() => help.toggleSection(tapEvent({ id: 'challenge' })));
  assert.equal(help.data.active_section, 'challenge');
  const about = f.load('pages/about/about.js').page;
  let posters = 0; about.selectComponent = () => ({ openApp() { posters++; } });
  f.click(() => about.openSharePoster()); assert.equal(posters, 1);
  f.click(() => about.logout()); assert.equal(f.storage.has('uid'), false);
  const mine = f.load('pages/mine/mine.js').page;
  mine.data.category_sheet_visible = true; mine.data.category_lables = ['a', 'b'];
  f.click(() => mine.chooseCategoryDraft(tapEvent({ index: 1 })));
  assert.equal(mine.data.category_draft, 1);
});
test('single question gestures use selection, submission and result sounds without duplicate submits', async () => {
  const f = fixture(); const { page } = f.load('pages/single/single.js');
  page._owner = f.api.getSessionIdentity(); page._generation = 1; page._visible = true;
  Object.assign(page.data, { view_state: 'ready', question_id: 42, options: [{ number: 1, content: 'a' }, { number: 2, content: 'b' }], question_image: 'https://a.test/q.png' });
  f.click(() => page.tapOption(tapEvent({ number: 2 })), 'select');
  const task = f.click(() => page.submitAnswer()); page.submitAnswer();
  assert.equal(f.requests.length, 1); assert.equal(f.requests[0].body.answer, 2);
  f.requests[0].resolve({ data: { code: 10000, data: { question_id: 42, result: 1, right_answer: 2, score: 1000 } } });
  await task; f.advance(80); assert.match(f.played.at(-1), /\/(correct|so_good|your_best|worship)\.m4a$/);
  let opens = 0; page.selectComponent = () => ({ open() { opens++; }, getCaptcha() {} });
  f.click(() => page.openQuestionPoster()); assert.equal(opens, 1);
  f.click(() => page.openFeedback()); assert.equal(page.data.show_feedback, true);
  f.click(() => page.previewQuestionImage()); f.click(() => page.returnToSource());
  assert.equal(f.requests.length, 1);
});
test('practice submit and user navigation play once, programmatic continuation remains silent', () => {
  const f = fixture(); const { page } = f.load('pages/training/training.js');
  Object.assign(page.data, { selected_option: 1, answer_result: -2, current_question_id: 3, current_index: 1 });
  page.promptDailyReminder = () => {}; page._submitAnswer = () => {}; page.startAnswer = () => {};
  f.click(() => page.submitAnswer());
  page.data.answer_result = 1;
  f.click(() => page.nextQuestion(tapEvent({})));
  f.click(() => page.upQuestion());
  const count = f.played.length; page.nextQuestion(false); f.advance(1000); assert.equal(f.played.length, count);
  f.click(() => page.openQuestionPoster()); f.click(() => page.previewImg(tapEvent({ image_src: 'q.png' })));
});
test('poster actions play once and automatic lifecycle closes stay silent', () => {
  const f = fixture(); const { page, definition } = f.load('component/question-poster/question-poster.js', true);
  Object.assign(page.data, { visible: true, imagepath: 'poster.png' }); page._current = () => true;
  f.click(() => page.preview()); f.click(() => page.save()); assert.equal(f.requests.length, 1);
  const count = f.played.length; page.save(); f.advance(1000); assert.equal(f.played.length, count);
  page.data.saving = false; f.click(() => page.openAlbumSettings());
  page._question = { id: 1 }; let renders = 0; page.open = () => { renders++; };
  f.click(() => page.retry()); assert.equal(renders, 1);
  f.click(() => page.close(tapEvent({}))); assert.equal(page.data.visible, false);
  page.data.visible = true; const sounds = f.played.length; definition.pageLifetimes.hide.call(page); f.advance(1000); assert.equal(f.played.length, sounds);
});
test('daily gestures play once while automatic refreshes do not produce click sounds', async () => {
  const f = fixture(); const { page } = f.load('pages/daily/daily.js');
  Object.assign(page.data, { view_state: 'ready', today: { question_id: 42 }, activity: { weeks: [{ days: [{ date: '2026-11-01', in_range: true }] }] } });
  f.click(() => page.startDaily()); f.click(() => page.selectActivityDay(tapEvent({ date: '2026-11-01' })));
  assert.equal(page.data.activity_selected.date, '2026-11-01');
  f.click(() => page.loadDaily(tapEvent({}))); assert.equal(f.requests.length, 2);
  const count = f.played.length; page.loadDaily(); f.advance(1000); assert.equal(f.played.length, count);
});
test('challenge submit, finish retry, restart, return and share keep one feedback per gesture', async () => {
  const f = fixture(); const { page } = f.load('pages/answer/answer.js');
  Object.assign(page.data, { selected_option: 1, answer_result: -2, current_question_id: 3, round_id: 4 });
  page.promptDailyReminder = () => {}; page.stopCountDown = () => {}; page._submitAnswer = () => {};
  f.click(() => page.submitAnswer());
  f.click(() => page.openQuestionPoster()); f.click(() => page.previewImg(tapEvent({ image_src: 'q.png' })));
  f.click(() => page.returnToChallenge());
  page.data.challenge_finish_state = 'done'; f.click(() => page.restartChallenge());
  page.data.challenge_finish_state = 'error'; f.click(() => page.finishChallenge(tapEvent({})));
  assert.equal(f.requests.at(-1).path, 'api/question/finish-challenge');
});
test('report refresh and checkbox gestures sound once, automatic captcha and success close stay silent', async () => {
  const f = fixture(); const { page } = f.load('component/correction-form/correction-form.js', true);
  Object.assign(page.data, { show_feedback: true, question_id: 42 }); page.syncFeedbackSession();
  f.click(() => page.getCaptcha(tapEvent({}))); assert.equal(f.requests.length, 1);
  const count = f.played.length; page.getCaptcha(); f.advance(1000); assert.equal(f.played.length, count);
  f.click(() => page.feedbackChecked({ detail: { value: ['1'] } })); assert.deepEqual(Array.from(page.data.feedback_checked_value), ['1']);
  f.click(() => page.closeFeedback(tapEvent({}))); assert.equal(page.data.show_feedback, false);
  page.data.show_feedback = true; const sounds = f.played.length; page.closeFeedback(); f.advance(1000); assert.equal(f.played.length, sounds);
});
test('wrong question poster, preview, deletion prompt and analysis close give click feedback', () => {
  const f = fixture(); const { page } = f.load('pages/wrong/wrong.js');
  page.data.question_list = [{ question_id: 42, content: 'question', options: ['a'] }];
  page.popup = { setData() {}, showPopup() {} };
  f.click(() => page.longpressQuestion({ mark: { i: 1, ii: 0 } }));
  f.click(() => page.openWrongQuestionPoster({ mark: { ii: 0 } }));
  f.click(() => page.previewImg(tapEvent({ image_src: 'q.png' })));
  f.click(() => page.closeAnalysis()); assert.equal(page.data.show_analysis, false);
});
test('fast accepted single results replace the submit click and hidden results never speak later', async () => {
  for (const [result, hidden] of [[0, false], [1, false], [1, true]]) {
    const f = fixture(); const { page } = f.load('pages/single/single.js');
    page._owner = f.api.getSessionIdentity(); page._generation = 1; page._visible = true;
    Object.assign(page.data, { view_state: 'ready', question_id: 42, selected_option: 1, options: [{ number: 1, content: 'a' }] });
    const task = page.submitAnswer();
    if (hidden) { page.onHide(); f.app.onHide(); }
    f.requests[0].resolve({ data: { code: 10000, data: { question_id: 42, result, right_answer: 1, score: result ? 1000 : 0 } } });
    await task; f.advance(1000);
    assert.equal(page.data.phase, 'completed');
    assert.equal(f.played.length, hidden ? 0 : 1);
    if (!hidden) assert.doesNotMatch(f.played[0], /\/click\.m4a$/);
  }
});
test('muting suppresses ordinary buttons, selection and result effects through the shared audio context', () => {
  const f = fixture(); f.app.sound_close = 1;
  const help = f.load('pages/help/help.js').page;
  help.toggleSection(tapEvent({ id: 'challenge' }));
  const single = f.load('pages/single/single.js').page;
  single._owner = f.api.getSessionIdentity();
  Object.assign(single.data, { view_state: 'ready', phase: 'question', options: [{ number: 1 }] });
  single.tapOption(tapEvent({ number: 1 }));
  f.app.correctSound(); f.app.wrongSound(); f.advance(1000);
  assert.equal(help.data.active_section, 'challenge'); assert.equal(single.data.selected_option, 1);
  assert.equal(f.played.length, 0);
});
test('same-gesture duplicate click calls coalesce and a mute set before playback suppresses it', () => {
  const f = fixture(); f.app.clickSound(); f.app.clickSound(); f.advance(80);
  assert.equal(f.played.length, 1);
  f.app.clickSound(); f.app.sound_close = 1; f.advance(1000);
  assert.equal(f.played.length, 1);
});
test('single retry loading sounds only for a user tap and login still loads the intended question once', () => {
  const f = fixture(); const { page } = f.load('pages/single/single.js');
  Object.assign(page.data, { question_id: 42 }); page._generation = 0;
  f.click(() => page.loadQuestion(tapEvent({}))); assert.equal(f.requests.length, 1);
  const count = f.played.length; page.loadQuestion(); f.advance(1000); assert.equal(f.played.length, count);
  const before = f.requests.length; f.app.checkLogin = callback => callback();
  f.click(() => page.loginAndLoad()); assert.equal(f.requests.length, before + 1);
});
