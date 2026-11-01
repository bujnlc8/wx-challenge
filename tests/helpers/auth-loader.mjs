import fs from 'node:fs';
import vm from 'node:vm';
export function authSource() {
 const file = new URL('../../utils/auth-session.js', import.meta.url);
 if (!fs.existsSync(file)) return 'this.authApi = {};';
 return '(function(){' + fs.readFileSync(file,'utf8').replace(/export\s*\{([\s\S]*?)\};?/, 'return {$1};') + '\n})()';
}
export function installAuth(scope) {
 if (scope.__authApi) return scope.__authApi;
 const api=vm.runInContext(authSource(),scope);
 Object.assign(scope,api);
 scope.__authApi=api;
 return api;
}
export function loadAuth(context) {
 const scope=vm.createContext(context);
 const api=installAuth(scope);
 return { api, scope };
}
export function runWithAuth(source, context, options) {
 const {scope}=loadAuth(context);
 return vm.runInContext(source,scope,options);
}
