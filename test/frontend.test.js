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
