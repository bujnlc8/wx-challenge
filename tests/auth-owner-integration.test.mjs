import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {loadAuth} from './helpers/auth-loader.mjs';
const host='https://challenge.haihui.site/';
const creds=token=>({uid:'u1',token,refresh_token:'refresh',session_id:'sid',access_expires_in:7200,refresh_expires_in:2592000});
const ok=data=>({data:{code:10000,data}});
const expiry={statusCode:401,data:{code:11111}};
const read=file=>fs.readFileSync(new URL('../'+file,import.meta.url),'utf8').replace(/import[\s\S]*?from\s+["'][^"']+["'];?/g,'').replace(/export\s*\{[\s\S]*?\};?/g,'');
async function flush(){for(let i=0;i<25;i++)await Promise.resolve();}
function runtime(){const storage=new Map();const requests=[];const native=[];const wx={getStorageSync:k=>storage.get(k),setStorageSync:(k,v)=>storage.set(k,v),removeStorageSync:k=>storage.delete(k),request:o=>requests.push(o),requestSubscribeMessage:o=>native.push(o),setNavigationBarTitle(){}};const {api,scope}=loadAuth({wx,Date,Math,Promise,WeakMap,Error,setInterval:()=>1,clearInterval(){},getApp:()=>({clickSound(){},playSound(){},show_correct_answer:1,show_analysis:1,correctSound(){},wrongSound(){}}),showToast(){}});api.saveAuthSession(creds('old'),{manual:true});scope.httpGET=(p,d)=>api.requestWithSession(host+p,'GET',d,false);scope.httpPOST=(p,d)=>api.requestWithSession(host+p,'POST',d,false);return {storage,requests,native,wx,api,scope};}
test('Single question and accepted result remain visible through real HTTP refresh and retry',async()=>{
 const s=runtime();let definition;s.scope.Page=value=>definition=value;s.scope.createDailyReminder=()=>({refresh(){},prompt(){return false;},dispose(){}});s.scope.subscriptionRequestId=()=> 'id';vm.runInContext(read('utils/question-entry.js')+'\n'+read('pages/single/single.js'),s.scope);
 const page={...definition,data:{...definition.data},setData(v,done){Object.assign(this.data,v);if(done)done();},selectComponent(){return {data:{visible:false}};}};page.onLoad({question_id:'42'});page.onShow();await flush();s.requests[0].success(expiry);await flush();s.requests[1].success(ok(creds('get-refreshed')));await flush();s.requests[2].success(ok({question_id:42,question_revision:'revision',content:'题目',options:'甲|乙'}));await flush();assert.equal(page.data.view_state,'ready');assert.equal(page.data.options.length,2);
 page.tapOption({currentTarget:{dataset:{number:1}}});const task=page.submitAnswer();await flush();s.requests[3].success(expiry);await flush();s.requests[4].success(ok(creds('answer-refreshed')));await flush();s.requests[5].success(ok({question_id:42,result:1,right_answer:1,analysis:'解析',score:100,reward_coins:0}));await task;assert.equal(page.data.phase,'completed');assert.equal(page.data.score,100);assert.equal(page.data.analysis,'解析');assert.deepEqual(s.requests[3].data,s.requests[5].data);
});
test('reminder keeps loaded preference and native accept ownership during real refresh without duplicate daily prompt',async()=>{
 const s=runtime();vm.runInContext(read('utils/daily-subscription.js')+'\n'+read('utils/daily-reminder.js')+'\nthis.createReminder=createDailyReminder;',s.scope);let records=0;const reminder=s.scope.createReminder({platform:s.wx,loadPreference:()=>s.scope.httpGET('api/daily-challenge/reminder').then(r=>r.data.data),recordAcceptance:async()=>records++});const load=reminder.refresh();await flush();s.requests[0].success(expiry);await flush();s.requests[1].success(ok(creds('preference-refreshed')));await flush();s.requests[2].success(ok({enabled:true,template_id:'t'}));await load;assert.equal(reminder.prompt(),true);
 const refresh=s.api.ensureAuthSession({force:true});await flush();s.requests[3].success(ok(creds('panel-refreshed')));await refresh;s.native[0].success({t:'accept'});await flush();assert.equal(records,1);assert.equal(reminder.prompt(),false);assert.equal(s.native.length,1);assert.equal(reminder.isCurrentAccount(),true);
});
