const DAILY_TEMPLATE_ID = "faTHcOm8TebcnbsK92I5DyJ-bJxo7XQfR5wiwJdh24A";

function subscriptionRequestId() {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (letter) => {
    const value = Math.floor(Math.random() * 16);
    return (letter === "x" ? value : (value & 3) | 8).toString(16);
  });
}

// A saved preference is not a WeChat subscription entitlement.
function createDailySubscription({
  platform,
  recordAcceptance,
  createRequestId = subscriptionRequestId,
}) {
  let pending = false;
  const owner = () =>
    String(platform.getStorageSync("uid") || "") +
    ":" +
    String(platform.getStorageSync("token") || "");
  return {
    request(templateId = DAILY_TEMPLATE_ID) {
      if (pending) return Promise.reject(new Error("订阅正在处理，请稍候"));
      if (!platform.getStorageSync("uid"))
        return Promise.reject(new Error("请先登录"));
      if (typeof platform.requestSubscribeMessage !== "function")
        return Promise.reject(new Error("当前微信版本不支持订阅消息"));
      const account = owner();
      const requestId = createRequestId();
      pending = true;
      return new Promise((resolve, reject) => {
        let settled = false;
        const finish = (action) => {
          if (settled) return;
          settled = true;
          action();
        };
        try {
          // This call must stay synchronous within the user's button/switch gesture.
          platform.requestSubscribeMessage({
            tmplIds: [templateId],
            success(result) {
              finish(() => {
                if (owner() !== account) {
                  reject(new Error("账号已变更，请重新订阅"));
                  return;
                }
                const choice = result[templateId];
                if (choice !== "accept") {
                  resolve({ choice });
                  return;
                }
                Promise.resolve()
                  .then(() => {
                    if (owner() !== account)
                      throw new Error("账号已变更，请重新订阅");
                    return recordAcceptance({
                      request_id: requestId,
                      template_id: templateId,
                      result: "accept",
                    });
                  })
                  .then((settings) => resolve({ choice, settings }), reject);
              });
            },
            fail() {
              finish(() => reject(new Error("订阅未完成，请点击重试")));
            },
          });
        } catch (error) {
          finish(() => reject(new Error("订阅未完成，请点击重试")));
        }
      }).finally(() => {
        pending = false;
      });
    },
  };
}

export { DAILY_TEMPLATE_ID, subscriptionRequestId, createDailySubscription };
