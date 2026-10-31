import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
const sourcePath = new URL("../utils/daily-subscription.js", import.meta.url);
function setup() {
  const source = fs
    .readFileSync(sourcePath, "utf8")
    .replace(/export\s*\{[\s\S]*?\};?/g, "");
  const context = vm.createContext({ Promise, Date, Math, Error });
  vm.runInContext(source + "\nthis.create=createDailySubscription;", context);
  let dialog,
    uid = "u1",
    counter = 0;
  const calls = [];
  const platform = {
    getStorageSync: (key) => (key === "uid" ? uid : "token"),
    requestSubscribeMessage: (o) => {
      dialog = o;
      calls.push("native");
    },
  };
  const client = context.create({
    platform,
    recordAcceptance: async (data) => {
      calls.push(data);
    },
    createRequestId: () => `request-${++counter}`,
  });
  return {
    client,
    calls,
    get dialog() {
      return dialog;
    },
    setUid: (u) => {
      uid = u;
    },
  };
}
test("native subscription starts synchronously from the gesture; accept recorded once", async () => {
  const s = setup();
  const p = s.client.request("template");
  assert.equal(s.calls[0], "native");
  s.dialog.success({ template: "accept" });
  s.dialog.complete?.({});
  const r = await p;
  assert.equal(r.choice, "accept");
  assert.equal(s.calls.length, 2);
  assert.equal(s.calls[1].template_id, "template");
  assert.equal(s.calls[1].request_id, "request-1");
  assert.equal(s.calls[1].result, "accept");
});
test("reject and fail never create a server credit", async () => {
  const s = setup();
  const p = s.client.request("template");
  s.dialog.success({ template: "reject" });
  assert.equal((await p).choice, "reject");
  assert.equal(s.calls.length, 1);
  const second = s.client.request("template");
  s.dialog.fail({ errMsg: "cancel" });
  await assert.rejects(second, /订阅未完成/);
  assert.equal(s.calls.length, 2);
});
test("account change while native panel is open does not credit the new user", async () => {
  const s = setup();
  const p = s.client.request("template");
  s.setUid("u2");
  s.dialog.success({ template: "accept" });
  await assert.rejects(p, /账号已变更/);
  assert.equal(s.calls.length, 1);
});
test("duplicate taps share one pending native request; next invocation has a new id", async () => {
  const s = setup();
  const one = s.client.request("template");
  await assert.rejects(s.client.request("template"), /正在处理/);
  s.dialog.success({ template: "accept" });
  await one;
  const two = s.client.request("template");
  s.dialog.success({ template: "accept" });
  await two;
  assert.equal(s.calls[1].request_id, "request-1");
  assert.equal(s.calls[3].request_id, "request-2");
});
test("server recording failure does not claim subscription is ready", async () => {
  const source = fs
    .readFileSync(sourcePath, "utf8")
    .replace(/export\s*\{[\s\S]*?\};?/g, "");
  const c = vm.createContext({ Promise, Date, Math, Error });
  vm.runInContext(source + "\nthis.create=createDailySubscription;", c);
  const client = c.create({
    platform: {
      getStorageSync: () => 1,
      requestSubscribeMessage: (o) => o.success({ t: "accept" }),
    },
    recordAcceptance: async () => {
      throw Error("记录保存失败");
    },
  });
  await assert.rejects(client.request("t"), /记录保存失败/);
});
