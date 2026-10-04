"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const vm = require("node:vm");
const fs = require("node:fs");
const path = require("node:path");

function instance(realRender = false) {
  let definition;
  const timers = new Map();
  let id = 0;
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, "../MMM-Life360-Leaflet.js"), "utf8"), {
    Module: { register(name, value) { definition = value; } },
    setInterval(fn, ms) { timers.set(++id, { fn, ms }); return id; },
    clearInterval(timer) { timers.delete(timer); },
    Date, Map, Set, console,
    L: { divIcon: options => options }
  });
  definition.config = { ...definition.defaults, circleId: "circle-1" };
  definition.identifier = "module-1";
  definition.sent = [];
  definition.sendSocketNotification = (notification, payload) => definition.sent.push({ notification, payload });
  if (!realRender) definition.render = () => {};
  return { module: definition, timers };
}

test("frontend fetches immediately, polls every 60 seconds, and pauses/resumes", () => {
  const { module, timers } = instance();
  module.start();
  assert.equal(module.sent.length, 1);
  assert.equal(timers.size, 2);
  const poll = [...timers.values()].find(t => t.ms === 60000);
  assert.ok(poll);
  poll.fn();
  assert.equal(module.sent.length, 2);
  assert.equal(module.sent[1].payload.circleId, "circle-1");
  assert.ok(!JSON.stringify(module.sent).includes("accessToken"));
  module.suspend();
  assert.equal(timers.size, 0);
  module.resume();
  assert.equal(timers.size, 2);
  assert.equal(module.sent.length, 3);
});

test("frontend does not poll faster than 5 seconds", () => {
  const { module } = instance();
  module.config.updateInterval = 1000;
  module.start();
  assert.equal(module.refreshMs, 5000);
});

test("configured intervals drive both the polling timer and rendered caption", () => {
  for (const interval of [5000, 120000]) {
    const { module, timers } = instance(true);
    module.config.updateInterval = interval;
    module.start();
    assert.equal(timers.get(module.pollTimer).ms, interval);
    module.root = {};
    module.count = {};
    module.status = { classList: { toggle() {} } };
    module.footer = {};
    module.emptyMap = {};
    module.list = { replaceChildren() {} };
    module.render();
    assert.equal(module.footer.textContent,
      `Refresh every ${interval / 1000}s · Times show last location report`);
  }
});

test("unrelated instances are ignored, failures preserve snapshot, empty success clears it", () => {
  const { module } = instance();
  module.start();
  const good = { identifier: "module-1", circleId: "circle-1", fetchedAt: 1000,
    members: [{ id: "member-1" }], error: null };
  module.socketNotificationReceived("L360_RESULT", { ...good, identifier: "other" });
  assert.equal(module.members.length, 0);
  module.socketNotificationReceived("L360_RESULT", good);
  assert.equal(module.members.length, 1);
  module.socketNotificationReceived("L360_RESULT", {
    identifier: "module-1", circleId: "circle-1", error: { code: "AUTH", message: "Token rejected" }
  });
  assert.equal(module.members.length, 1);
  assert.equal(module.fetchedAt, 1000);
  assert.equal(module.error.code, "AUTH");
  module.socketNotificationReceived("L360_RESULT", { ...good, members: [], fetchedAt: 2000 });
  assert.equal(module.members.length, 0);
  assert.equal(module.error, null);
});

test("battery display distinguishes charging, not charging, and unknown", () => {
  const { module } = instance();
  assert.equal(module.batteryText({ battery: 0, charging: false }), "0% · Not charging");
  assert.equal(module.batteryText({ battery: 80, charging: true }), "80% · Charging");
  assert.equal(module.batteryText({ battery: null, charging: null }), "Battery unknown · Charging unknown");
});

function clusterFixture(module, count) {
  module.el = (tag, className) => ({ tag, className, style: {}, children: [],
    append(child) { this.children.push(child); }, setAttribute(name, value) { this[name] = value; } });
  module.avatar = (member, className, showAdmin) => ({ memberId: member.id, className, showAdmin });
  const members = Array.from({ length: count }, (_, i) => ({
    id: String(i), name: `Member ${i}`, updatedAt: Date.now()
  }));
  return { getChildCount: () => count,
    getAllChildMarkers: () => members.map(member => ({ options: { life360Member: member } })) };
}

test("up to three colocated members show all avatars; four show a single count", () => {
  const { module } = instance();
  for (const count of [2, 3, 4]) {
    const icon = module.clusterIcon(clusterFixture(module, count));
    if (count <= 3) {
      assert.equal(icon.className, "l360-cluster-avatars");
      assert.equal(icon.html.children.length, count);
      assert.ok(icon.html.children.every(face => face.showAdmin === true));
      assert.equal(new Set(icon.html.children.map(face => face.memberId)).size, count);
    } else {
      assert.equal(icon.className, "l360-cluster");
      assert.equal(icon.html, "4");
    }
  }
});

test("cluster threshold is configurable and invalid values use the default", () => {
  const { module } = instance();
  for (const [limit, count, avatars] of [[1, 2, false], [2, 2, true], [2, 3, false],
    [4, 4, true], [4, 5, false], ["3", 3, true], [0, 3, true], [NaN, 4, false]]) {
    module.config.maxAvatarsPerCluster = limit;
    const icon = module.clusterIcon(clusterFixture(module, count));
    assert.equal(icon.className, avatars ? "l360-cluster-avatars" : "l360-cluster");
    if (avatars) assert.equal(icon.html.children.length, count);
    else assert.equal(icon.html, String(count));
  }
});

test("location line displays driving speed in mph or km/h and walking without speed", () => {
  const { module } = instance();
  const driving = { place: "Home", movement: "driving", speedMph: 22.5 };
  assert.equal(module.locationText(driving), "Home · Driving [22.5 mph]");
  module.config.speedUnits = "kmh";
  assert.equal(module.locationText(driving), "Home · Driving [36.2 km/h]");
  assert.equal(module.locationText({ ...driving, speedMph: 0 }), "Home · Driving [0 km/h]");
  assert.equal(module.locationText({ ...driving, speedMph: null }), "Home · Driving [speed unavailable]");
  assert.equal(module.locationText({ ...driving, movement: "walking" }), "Home · Walking");
  assert.equal(module.locationText({ ...driving, movement: null }), "Home");
  assert.equal(module.locationText({ ...driving, locationStatus: "Location sharing off" }), "Location sharing off");
});

test("admin avatars have SVG crowns unless explicitly suppressed; non-admins do not", () => {
  const { module } = instance();
  module.el = (tag, className, text) => ({ tag, className, text, children: [],
    append(child) { this.children.push(child); }, setAttribute(name, value) { this[name] = value; } });
  const admin = { name: "Alex Rivera", avatar: "", isAdmin: true };
  const crownCount = face => face.children.filter(child => child.className === "l360-admin-crown").length;
  assert.equal(crownCount(module.avatar(admin)), 1);
  assert.match(module.avatar(admin).children.find(child => child.className === "l360-admin-crown").innerHTML, /<svg/);
  assert.equal(crownCount(module.avatar(admin, "", false)), 0);
  assert.equal(crownCount(module.avatar({ ...admin, isAdmin: false })), 0);
  assert.equal(crownCount(module.avatar({ ...admin, isAdmin: undefined })), 0);
  module.config.showAdminCrowns = false;
  assert.equal(crownCount(module.avatar(admin)), 0);
  assert.equal(crownCount(module.avatar(admin, "", true)), 0);
  module.config.showAdminCrowns = true;
  assert.equal(crownCount(module.avatar(admin)), 1);
});

test("unchanged members refresh a cached count icon when the avatar limit changes", () => {
  const { module } = instance(true);
  module.start();
  const cluster = clusterFixture(module, 2);
  const children = cluster.getAllChildMarkers();
  module.members = children.map(child => ({ ...child.options.life360Member,
    latitude: 40, longitude: -74, isAdmin: true, avatar: "" }));
  module.root = {};
  module.count = {};
  module.status = { classList: { toggle() {} } };
  module.footer = {};
  module.emptyMap = {};
  module.list = { replaceChildren() {} };
  module.memberCard = () => ({});
  module.map = {};
  module.hasFit = true;
  module.config.autoFit = false;
  const markers = module.members.map(member => ({ options: {
    life360Member: member, life360Position: [40, -74],
    life360IconKey: JSON.stringify([member.name, member.avatar, true, false, true])
  }, setTooltipContent() {}, setPopupContent() {} }));
  module.markers = new Map(markers.map(marker => [marker.options.life360Member.id, marker]));
  cluster.getAllChildMarkers = () => markers;
  module.config.maxAvatarsPerCluster = 1;
  let icon = module.clusterIcon(cluster);
  assert.equal(icon.html, "2");
  module.clusters = { refreshClusters() { icon = module.clusterIcon(cluster); } };
  module.config.maxAvatarsPerCluster = 3;
  module.render();
  assert.equal(icon.className, "l360-cluster-avatars");
  assert.equal(icon.html.children.length, 2);
  module.config.maxAvatarsPerCluster = 1;
  module.render();
  assert.equal(icon.html, "2");
});

test("member aliases affect card labels and avatars without changing source names", () => {
  const { module } = instance();
  module.el = (tag, className, text) => ({ tag, className, text, style: {}, children: [],
    append(...children) { this.children.push(...children); },
    setAttribute(name, value) { this[name] = value; }, addEventListener() {} });
  module.avatar = member => ({ name: member.name });
  const member = { id: "person-1", name: "Original Name", latitude: null, longitude: null,
    battery: null, charging: null, updatedAt: null, locationStatus: "Location sharing off" };
  for (const [aliases, expected] of [[{ "person-1": " Dad " }, "Dad"],
    [{ "other": "Dad" }, "Original Name"], [{ "person-1": " " }, "Original Name"],
    [{ "person-1": 42 }, "Original Name"], [null, "Original Name"]]) {
    module.config.memberAliases = aliases;
    for (const popup of [false, true]) {
      const card = module.memberCard(member, popup);
      assert.equal(card.children[0].name, expected);
      assert.equal(card.children[1].children[0].text, expected);
      if (!popup) assert.ok(card["aria-label"].startsWith(expected + ","));
    }
    assert.equal(member.name, "Original Name");
  }
});

test("movement polling accumulates displacement, holds fast mode, and returns to idle", () => {
  const { module, timers } = instance();
  module.start();
  const send = (time, latitude, extra = {}) => module.socketNotificationReceived("L360_RESULT", {
    identifier: "module-1", circleId: "circle-1", fetchedAt: time,
    members: [{ id: "one", latitude, longitude: 0 }], ...extra
  });
  send(1000, 0);
  send(61000, 0.0003); // 33m: stays slow.
  assert.equal(module.refreshMs, 60000);
  send(121000, 0.0006); // 67m from anchor: switches fast.
  assert.equal(module.refreshMs, 5000);
  assert.equal(timers.get(module.pollTimer).ms, 5000);
  send(126000, 0.0006);
  assert.equal(module.refreshMs, 5000);
  send(241000, 0.0006, { error: { code: "NETWORK" } });
  assert.equal(module.refreshMs, 5000); // Errors are not evidence of stopping.
  send(241000, 0.0006);
  assert.equal(module.refreshMs, 60000);
  assert.equal(timers.size, 2);
});

test("movement respects threshold, any member, cached timestamps, missing positions, and suspension", () => {
  const { module, timers } = instance();
  module.config.movementThreshold = 100;
  module.config.movingUpdateInterval = 10000;
  module.start();
  const send = (time, latitude) => module.updateMovementPolling({ fetchedAt: time,
    members: [{ id: "still", latitude: 0, longitude: 0 }, { id: "moving", latitude, longitude: 0 }] });
  send(1000, 0);
  send(2000, 0.0006);
  assert.equal(module.refreshMs, 60000);
  send(2000, 1); // Duplicate fetch ignored.
  assert.equal(module.refreshMs, 60000);
  module.suspend();
  send(3000, 0.0012);
  assert.equal(module.refreshMs, 10000);
  assert.equal(timers.size, 0);
  module.resume();
  assert.equal(timers.get(module.pollTimer).ms, 10000);
  send(4000, null);
  assert.equal(module.movementAnchors.has("moving"), false);
});

test("polling settings clamp below-minimum values and send server log notices", () => {
  for (const input of [0, -1, 0.5]) {
    const { module, timers } = instance();
    const limits = { updateInterval: 5000, movingUpdateInterval: 1000,
      movementThreshold: 10, movementTimeout: 60000 };
    module.config.debugLogging = true; for (const key of Object.keys(limits)) module.config[key] = input;
    module.start();
    for (const [key, minimum] of Object.entries(limits)) assert.equal(module.config[key], minimum);
    assert.equal(module.sent.filter(x => x.notification === "L360_CONFIG_MINIMUM").length, 4);
    module.updateMovementPolling({ fetchedAt: 1, members: [{ id: "a", latitude: 0, longitude: 0 }] });
    module.updateMovementPolling({ fetchedAt: 5001, members: [{ id: "a", latitude: 0.001, longitude: 0 }] });
    assert.equal(timers.get(module.pollTimer).ms, 1000);
    module.updateMovementPolling({ fetchedAt: 65001, members: [{ id: "a", latitude: 0.001, longitude: 0 }] });
    assert.equal(module.refreshMs, 5000);
  }
  const { module } = instance();
  Object.assign(module.config, { updateInterval: 5000, movingUpdateInterval: 1000, movementThreshold: 10, movementTimeout: 60000 });
  module.start();
  assert.equal(module.sent.filter(x => x.notification === "L360_CONFIG_MINIMUM").length, 0);
});

test("movement diagnostics report threshold, both switches and timeout only once", () => {
  const { module } = instance();
  module.start();
  module.config.debugLogging = true; const send = (fetchedAt, latitude) => module.updateMovementPolling({ fetchedAt,
    members: [{ id: "a", name: "Alex", latitude, longitude: 0 }] });
  send(1, 0);
  send(60001, 0.001);
  send(65001, 0.001);
  send(180001, 0.001);
  send(240001, 0.001);
  const logs = module.sent.filter(x => x.notification === "L360_POLLING_LOG").map(x => x.payload.message);
  assert.equal(logs.length, 4);
  assert.match(logs[0], /movementThreshold exceeded/);
  assert.match(logs[1], /from updateInterval .* to movingUpdateInterval/);
  assert.match(logs[2], /movementTimeout reached\/exceeded/);
  assert.match(logs[3], /from movingUpdateInterval .* to updateInterval/);
});

test("debug logging is opt-in and does not prevent minimum enforcement", () => {
  for (const value of [false, undefined, "true"]) {
    const { module } = instance();
    module.config.debugLogging = value;
    module.config.updateInterval = 1;
    module.start();
    module.logPolling("movementThreshold exceeded");
    assert.equal(module.refreshMs, 5000);
    assert.equal(module.sent.filter(x => x.notification === "L360_CONFIG_MINIMUM").length, 1); assert.equal(module.sent.some(x => x.notification === "L360_POLLING_LOG"), false);
  }
});
