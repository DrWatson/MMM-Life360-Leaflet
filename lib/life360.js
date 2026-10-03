"use strict";

const https = require("node:https");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");

class Life360Error extends Error {
  constructor(code, message, retryMs = 60000) {
    super(message);
    this.code = code;
    this.retryMs = retryMs;
  }
}

function number(value) {
  if (value === null || value === undefined || typeof value === "boolean" ||
      (typeof value === "string" && !value.trim())) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function flag(value) {
  if (value === true || value === 1 || value === "1" || value === "true") return true;
  if (value === false || value === 0 || value === "0" || value === "false") return false;
  return null;
}

function safeAvatar(value) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password ? url.href : "";
  } catch { return ""; }
}

function normalizeMember(raw) {
  const sharing = flag(raw.features?.shareLocation);
  const loc = sharing === false ? {} : (raw.location || {});
  const latitude = number(loc.latitude);
  const longitude = number(loc.longitude);
  const validLocation = latitude !== null && longitude !== null &&
    Math.abs(latitude) <= 90 && Math.abs(longitude) <= 180;
  const battery = number(loc.battery);
  const timestamp = number(loc.timestamp);
  const driving = flag(loc.isDriving);
  const moving = flag(loc.inTransit);
  const rawSpeed = number(loc.speed);
  const updatedAt = timestamp && timestamp > 0 ?
    (timestamp < 1e12 ? timestamp * 1000 : timestamp) : null;
  return {
    id: String(raw.id),
    name: [raw.firstName, raw.lastName].filter(Boolean).join(" ").trim() || "Circle member",
    avatar: safeAvatar(raw.avatar),
    isAdmin: flag(raw.isAdmin) === true,
    movement: !validLocation ? null : driving === true ? "driving" :
      moving === true ? (driving === false ? "walking" : "moving") : null,
    // Match the community Life360 integration's raw-speed conversion.
    speedMph: validLocation && rawSpeed !== null && rawSpeed >= 0 ? rawSpeed * 2.25 : null,
    latitude: validLocation ? latitude : null,
    longitude: validLocation ? longitude : null,
    battery: battery !== null && battery >= 0 && battery <= 100 ? Math.round(battery) : null,
    charging: flag(loc.charge),
    updatedAt: updatedAt && updatedAt <= 8640000000000000 ? updatedAt : null,
    place: String(loc.name || loc.address1 || ""),
    locationStatus: sharing === false ? "Location sharing off" :
      validLocation ? "" : "Location unavailable"
  };
}

function parseMembers(data) {
  if (!data || !Array.isArray(data.members)) {
    throw new Life360Error("FORMAT", "Life360 returned an unexpected member response.");
  }
  if (data.members.some(m => !m || typeof m !== "object" || !m.id)) {
    throw new Life360Error("FORMAT", "Life360 returned incomplete member records.");
  }
  return data.members.map(normalizeMember);
}

async function readToken() {
  const file = process.env.LIFE360_CREDENTIALS_FILE ||
    path.join(os.homedir(), ".config", "MMM-Life360Map", "credentials.json");
  let value;
  try { value = JSON.parse(await fs.readFile(file, "utf8")).accessToken; }
  catch {
    throw new Life360Error("SETUP", "Add valid credentials.json in ~/.config/MMM-Life360Map/ (see README).");
  }
  const token = typeof value === "string" ? value.trim().replace(/^Bearer\s+/i, "") : "";
  if (!token || /\s/.test(token) || token.includes("PASTE_")) {
    throw new Life360Error("SETUP", "Set accessToken in the private credentials.json file.");
  }
  return token;
}

function retryAfter(value, now = Date.now()) {
  const seconds = number(value);
  const ms = seconds !== null ? seconds * 1000 : Date.parse(value) - now;
  // A long Retry-After is honored; Node's timers are not used for this deadline.
  return Number.isFinite(ms) ? Math.max(60000, ms) : 300000;
}

function decodeResponse(status, headers, body) {
  if (status === 429) {
    throw new Life360Error("RATE_LIMIT", "Life360 rate limit reached; refresh temporarily delayed.",
      retryAfter(headers["retry-after"]));
  }
  const html = /text\/html/i.test(headers["content-type"] || "") || /^\s*</.test(body);
  if (html || (status >= 300 && status < 400)) {
    throw new Life360Error("CHALLENGE", "Life360 returned a browser/cookies challenge. See README troubleshooting.", 300000);
  }
  if (status === 401) {
    throw new Life360Error("AUTH", "Life360 token rejected. Replace accessToken in credentials.json.");
  }
  if (status === 403) {
    throw new Life360Error("FORBIDDEN", "Life360 denied access. Check token, circle access, or browser challenge.", 300000);
  }
  if (status === 404) {
    throw new Life360Error("CIRCLE", "Circle not found. Check circleId and account membership.");
  }
  if (status < 200 || status >= 300) {
    throw new Life360Error("HTTP", `Life360 request failed (HTTP ${status}).`);
  }
  let data;
  try { data = JSON.parse(body); }
  catch { throw new Life360Error("FORMAT", "Life360 returned invalid JSON."); }
  return parseMembers(data);
}

function fetchMembers(circleId, token, request = https.request) {
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(circleId)) {
    return Promise.reject(new Life360Error("SETUP", "Set a valid circleId in your module config."));
  }
  return new Promise((resolve, reject) => {
    // Fixed host, no redirects, no API response bodies or credentials in errors/logs.
    const req = request({
      hostname: "api-cloudfront.life360.com",
      path: `/v3/circles/${encodeURIComponent(circleId)}/members`,
      method: "GET",
      headers: { Accept: "application/json", Authorization: `Bearer ${token}`,
        "User-Agent": "MMM-Life360Map/1.0" }
    }, res => {
      const chunks = [];
      let size = 0;
      res.on("data", chunk => {
        size += chunk.length;
        if (size > 2 * 1024 * 1024) req.destroy(new Error("Response too large"));
        else chunks.push(chunk);
      });
      res.on("error", () => reject(new Life360Error("NETWORK", "Life360 connection interrupted.")));
      res.on("end", () => {
        clearTimeout(deadline);
        try { resolve(decodeResponse(res.statusCode, res.headers, Buffer.concat(chunks).toString("utf8"))); }
        catch (error) { reject(error); }
      });
    });
    const deadline = setTimeout(() => req.destroy(new Error("Timeout")), 20000);
    req.on("error", () => {
      clearTimeout(deadline);
      reject(new Life360Error("NETWORK", "Could not reach Life360. Check internet access; retrying."));
    });
    req.end();
  });
}

class CirclePoller {
  constructor({ loadToken = readToken, fetch = fetchMembers, now = Date.now } = {}) {
    this.loadToken = loadToken;
    this.fetch = fetch;
    this.now = now;
    this.states = new Map();
  }

  async poll(circleId) {
    if (!/^[A-Za-z0-9_-]{1,128}$/.test(circleId || "")) {
      return { error: { code: "SETUP", message: "Set circleId in your MagicMirror module config." } };
    }
    let state = this.states.get(circleId);
    if (!state) {
      state = { nextAt: 0, result: null, pending: null };
      this.states.set(circleId, state);
    }
    if (state.pending) return state.pending;
    if (this.now() < state.nextAt) return state.result;
    state.pending = (async () => {
      const started = this.now();
      try {
        const token = await this.loadToken();
        const members = await this.fetch(circleId, token);
        state.result = { members, fetchedAt: this.now(), error: null };
        state.nextAt = started + 5000;
      } catch (error) {
        const known = error instanceof Life360Error;
        state.nextAt = this.now() + (known ? error.retryMs : 60000);
        // Do not resend old members as if they were a new successful snapshot.
        state.result = { error: {
          code: known ? error.code : "NETWORK",
          message: known ? error.message : "Life360 update failed; retrying.",
          retryAt: state.nextAt
        } };
      }
      return state.result;
    })();
    try { return await state.pending; }
    finally { state.pending = null; }
  }
}

module.exports = { Life360Error, normalizeMember, parseMembers, decodeResponse,
  retryAfter, readToken, fetchMembers, CirclePoller };
