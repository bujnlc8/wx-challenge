import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {loadAuth} from './helpers/auth-loader.mjs';
import vm from 'node:vm';
const credentials={uid:'u1',token:'new',refresh_token:'refresh',session_id:'sid',access_expires_in:7200,refresh_expires_in:2592000};
function fixture(){let app;const storage=new Map();const requests=[];const toast=[];let profileCalls=0;
const wx={getStorageSync:k=>storage.get(k),setStorageSync:(k,v)=>storage.set(k,v),removeStorageSync:k=>storage.delete(k),login:o=>o.success({code:'wx-code'}),getUserProfile:o=>{profileCalls++;o.success({errMsg:'getUserProfile:ok',iv:'iv',encryptedData:'encrypted'});},request:o=>requests.push(o)};
const {api,scope}=loadAuth({wx,Promise,Date,Math,WeakMap,Error,console,App:value=>app=value,showLoading:()=>({}),hideLoading(){},showToast:t=>toast.push(t),inner_audio_context:{stop(){}},httpJsonPOST:(path,data)=>{requests.push({path,data});return Promise.resolve({data:{code:10000,data:credentials}});}});
vm.runInContext(fs.readFileSync(new URL('../app.js',import.meta.url),'utf8').replace(/import[\s\S]*?from\s+["'][^"']+["'];?/g,''),scope);
return {app,api,storage,requests,toast,profileCalls:()=>profileCalls};}
async function flush(){for(let i=0;i<20;i++)await Promise.resolve();}
test('manual login opts into v2 and stores full credentials before resolving',async()=>{const s=fixture();await s.app.getUid();assert.equal(s.requests[0].data.authVersion,2);assert.equal(s.storage.get('auth_session').refresh_token,'refresh');assert.ok(s.storage.get('auth_session').access_expires_at>Date.now());assert.equal(s.profileCalls(),1);});
test('checkLogin upgrades an existing account before callback without profile prompts or success toast',async()=>{const s=fixture();s.storage.set('uid','u1');s.storage.set('token','old');let completed=false;const task=s.app.checkLogin(()=>completed=true);await flush();assert.equal(completed,false);assert.match(s.requests[0].url,/upgrade-session$/);s.requests[0].success({data:{code:10000,data:credentials}});await task;assert.equal(completed,true);assert.equal(s.profileCalls(),0);assert.equal(s.toast.length,0);});
test('manual login resolving after explicit logout cannot restore credentials',async()=>{const s=fixture();const task=s.app.getUid();const rejected=assert.rejects(task,error=>error.sessionChanged===true);s.api.clearAuthSession();await rejected;assert.equal(s.storage.has('uid'),false);});
test('checkLogin valid-session callback cannot run after a same-tick logout',async()=>{const s=fixture();s.api.saveAuthSession(credentials,{manual:true});let called=false;const task=s.app.checkLogin(()=>called=true);s.api.clearAuthSession();await task;assert.equal(called,false);});
test('logout before wx authorization settles prevents the old login request from being sent',async()=>{const s=fixture();const task=s.app.getUid();const rejected=assert.rejects(task,error=>error.sessionChanged===true);s.api.clearAuthSession();await rejected;assert.equal(s.requests.length,0);});
