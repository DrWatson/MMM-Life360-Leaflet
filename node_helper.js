"use strict";
const NodeHelper = require("node_helper");
const { CirclePoller } = require("./lib/life360");

module.exports = NodeHelper.create({
  requiresVersion: "2.20.0",
  start() {
    this.poller = new CirclePoller();
    this.loggedMembers = new Map();
  },
  async socketNotificationReceived(notification, payload) {
    if (notification === "L360_POLLING_LOG") {
      if (payload && payload.debugLogging === true && typeof payload.message === "string") {
        console.log(`[MMM-Life360-Leaflet] instance=${JSON.stringify(payload.identifier)} ${payload.message.replace(/[\r\n]/g, " ")}`);
      }
      return;
    }
    if (notification === "L360_CONFIG_MINIMUM") {
      const limits = { updateInterval: [5000, "ms"], movingUpdateInterval: [1000, "ms"],
        movementThreshold: [10, "meters"], movementTimeout: [60000, "ms"] };
      if (payload && Object.prototype.hasOwnProperty.call(limits, payload.setting) &&
          Number.isFinite(payload.value)) {
        const [minimum, unit] = limits[payload.setting];
        if (payload.value < minimum) console.warn(`[MMM-Life360-Leaflet] ${payload.setting}=${payload.value} ${unit} is below minimum; using ${minimum} ${unit} instead.`);
      }
      return;
    }
    if (notification !== "L360_FETCH" || !payload ||
        typeof payload.identifier !== "string" || typeof payload.circleId !== "string") return;
    console.log(`[MMM-Life360-Leaflet] Map refresh requested: instance=${JSON.stringify(payload.identifier)} circleId=${JSON.stringify(payload.circleId)}.`);
    const result = await this.poller.poll(payload.circleId);
    console.log(`[MMM-Life360-Leaflet] Map refresh ${result.error ? "failed" : "data ready"}: instance=${JSON.stringify(payload.identifier)}${result.error ? " (retaining last displayed data)" : " (latest available server snapshot)"}.`);
    if (!result.error && Array.isArray(result.members)) {
      for (const member of result.members) {
        const key = JSON.stringify([payload.circleId, member.id]);
        if (this.loggedMembers.get(key) === member.name) continue;
        // JSON encoding keeps names on one log line, including unusual characters.
        console.log(`[MMM-Life360-Leaflet] Member name=${JSON.stringify(member.name)} memberId=${JSON.stringify(member.id)}`);
        this.loggedMembers.set(key, member.name);
      }
    }
    this.sendSocketNotification("L360_RESULT", {
      identifier: payload.identifier,
      circleId: payload.circleId,
      ...result
    });
  }
});
