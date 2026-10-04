"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const vm = require("node:vm");
const fs = require("node:fs");
const path = require("node:path");

test("helper logs member IDs once, repeats renamed members, and skips failed results", async () => {
  const logs = [];
  let result = { members: [{ id: "member-1", name: "Alex\nRivera" }] };
  const context = { module: { exports: {} }, console: { log: line => logs.push(line) },
    require: name => name === "node_helper" ? { create: value => value } :
      { CirclePoller: class { async poll() { return result; } } } };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, "../node_helper.js"), "utf8"), context);
  const helper = context.module.exports;
  helper.start();
  helper.sendSocketNotification = () => {};
  const fetch = () => helper.socketNotificationReceived("L360_FETCH", { identifier: "module-1", circleId: "circle-1" });
  await fetch();
  await fetch();
  assert.equal(logs.length, 1);
  assert.ok(logs[0].includes('memberId="member-1"'));
  assert.ok(logs[0].includes('name="Alex\\nRivera"'));
  assert.ok(!logs[0].includes("\n"));
  result = { members: [{ id: "member-1", name: "Alex" }] };
  await fetch();
  assert.equal(logs.length, 2);
  result = { error: { code: "AUTH" }, members: [{ id: "member-2", name: "Sam" }] };
  await fetch();
  assert.equal(logs.length, 2);
});

test("helper writes minimum adjustments to the server log", async () => {
  const warnings = [];
  const context = { module: { exports: {} }, console: { warn: text => warnings.push(text) },
    require: name => name === "node_helper" ? { create: value => value } : {} };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, "../node_helper.js"), "utf8"), context);
  const helper = context.module.exports;
  for (const [setting, minimum] of Object.entries({ updateInterval: 5000, movingUpdateInterval: 1000, movementThreshold: 10, movementTimeout: 60000 })) {
    await helper.socketNotificationReceived("L360_CONFIG_MINIMUM", { setting, value: 0 });
    assert.ok(warnings.at(-1).includes(`${setting}=0`));
    assert.ok(warnings.at(-1).includes(`using ${minimum}`));
  }
  assert.equal(warnings.length, 4);
});
