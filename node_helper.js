"use strict";
const NodeHelper = require("node_helper");
const { CirclePoller } = require("./lib/life360");

module.exports = NodeHelper.create({
  requiresVersion: "2.20.0",
  start() { this.poller = new CirclePoller(); },
  async socketNotificationReceived(notification, payload) {
    if (notification !== "L360_FETCH" || !payload ||
        typeof payload.identifier !== "string" || typeof payload.circleId !== "string") return;
    const result = await this.poller.poll(payload.circleId);
    this.sendSocketNotification("L360_RESULT", {
      identifier: payload.identifier,
      circleId: payload.circleId,
      ...result
    });
  }
});
