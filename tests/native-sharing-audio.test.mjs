import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
const root = new URL('../', import.meta.url);
const pages = fs.readdirSync(new URL('pages/',root)).map(name=>new URL(`pages/${name}/${name}.js`,root)).filter(file=>fs.existsSync(file));
test('all pages disable native sharing and remove share handlers and coin rewards',()=>{
 for(const file of pages){const source=fs.readFileSync(file,'utf8'); assert.doesNotMatch(source,/onShareAppMessage|onShareTimeline|shareGetCoin/,file.pathname);assert.match(source,/hideShareMenu\(\{\s*menus:\s*\["shareAppMessage", "shareTimeline"\]/,file.pathname);}
 assert.doesNotMatch(fs.readFileSync(new URL('utils/util.js',root),'utf8'),/shareGetCoin/);
});
test('background audio is removed and app hide stops only inner sound effects',()=>{
 const app=fs.readFileSync(new URL('app.js',root),'utf8');
 for(const file of [...pages,new URL('utils/util.js',root),new URL('app.js',root)]) assert.doesNotMatch(fs.readFileSync(file,'utf8'),/getBackgroundAudioManager|background_music|playBgSound|stopPlayBgSound/,file.pathname);
 let definition, pending, stops = 0, plays = 0;
 vm.runInNewContext(app.replace(/import[\s\S]*?from\s+["'][^"']+["'];?/g, ''), {
   App(value) { definition = value; },
   inner_audio_context: { stop() { stops++; }, play() { plays++; } },
   setTimeout(callback) { pending = callback; return 1; }, clearTimeout() {},
 });
 definition.playSound('click'); definition.onHide(); pending();
 assert.equal(stops, 2); assert.equal(plays, 0);
 assert.doesNotMatch(fs.readFileSync(new URL('pages/setting/setting.js',root),'utf8'),/背景音乐/);
});
