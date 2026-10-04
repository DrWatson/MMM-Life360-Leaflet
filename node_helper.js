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
    if (notification !== "L360_FETCH" || !payload ||
        typeof payload.identifier !== "string" || typeof payload.circleId !== "string") return;
    const result = await this.poller.poll(payload.circleId);
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
