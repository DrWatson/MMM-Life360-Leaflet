"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { EventEmitter } = require("node:events");
const { normalizeMember, parseMembers, decodeResponse, retryAfter, fetchMembers,
  CirclePoller, Life360Error } = require("../lib/life360");

const member = overrides => ({ id: "member-1", firstName: "Alex", lastName: "Rivera",
  avatar: "https://example.com/alex.png", features: { shareLocation: "1" },
  location: { latitude: "40.7", longitude: "-74.0", battery: "0", charge: "0",
    timestamp: "1760000000", name: "Home" }, ...overrides });

test("string zero is a real empty battery and NOT charging", () => {
  const actual = normalizeMember(member());
  assert.equal(actual.battery, 0);
  assert.equal(actual.charging, false);
  assert.equal(actual.updatedAt, 1760000000000);
  assert.equal(actual.name, "Alex Rivera");
  assert.equal(actual.latitude, 40.7);
});

test("admin and movement flags handle string booleans and raw speed conversion", () => {
  const original = member();
  const driving = normalizeMember({ ...original, isAdmin: "1", location: {
    ...original.location, isDriving: "1", inTransit: "1", speed: "10"
  } });
  assert.equal(driving.isAdmin, true);
  assert.equal(driving.movement, "driving");
  assert.equal(driving.speedMph, 22.5);
  const walking = normalizeMember({ ...original, isAdmin: "0", location: {
    ...original.location, isDriving: "0", inTransit: "1", speed: "1"
  } });
  assert.equal(walking.isAdmin, false);
  assert.equal(walking.movement, "walking");
  const unknown = normalizeMember({ ...original, location: { ...original.location, inTransit: "1" } });
  assert.equal(unknown.movement, "moving");
  assert.equal(unknown.speedMph, null);
});

test("hidden locations and missing speed never produce false movement or zero speed", () => {
  const original = member();
  const hidden = normalizeMember({ ...original, isAdmin: true, features: { shareLocation: "0" },
    location: { ...original.location, isDriving: "1", speed: "10" } });
  assert.equal(hidden.isAdmin, true);
  assert.equal(hidden.movement, null);
  assert.equal(hidden.speedMph, null);
  for (const speed of [-1, null, "", "bad"]) {
    assert.equal(normalizeMember({ ...original, location: { ...original.location, speed } }).speedMph, null);
  }
  assert.equal(normalizeMember({ ...original, location: { ...original.location, speed: "0" } }).speedMph, 0);
});

test("charging true, unknown battery, and millisecond timestamp are preserved", () => {
  const actual = normalizeMember(member({ location: {
    latitude: "0", longitude: "0", battery: "-1", charge: "1", timestamp: 1760000000000
  } }));
  assert.equal(actual.battery, null);
  assert.equal(actual.charging, true);
  assert.equal(actual.latitude, 0);
  assert.equal(actual.updatedAt, 1760000000000);
});

test("missing or invalid locations do not become zero coordinates", () => {
  for (const location of [null, {}, { latitude: "", longitude: null },
    { latitude: "100", longitude: "-74" }, { latitude: "40", longitude: "NaN" }]) {
    const actual = normalizeMember(member({ location }));
    assert.equal(actual.latitude, null);
    assert.equal(actual.longitude, null);
    assert.equal(actual.locationStatus, "Location unavailable");
  }
});

test("sharing off suppresses even a populated last location", () => {
  const actual = normalizeMember(member({ features: { shareLocation: "0" } }));
  assert.equal(actual.latitude, null);
  assert.equal(actual.battery, null);
  assert.equal(actual.updatedAt, null);
  assert.equal(actual.locationStatus, "Location sharing off");
});

test("unknown charging is not falsely reported as not charging", () => {
  assert.equal(normalizeMember(member({ location: {} })).charging, null);
});

test("unsafe avatars are discarded", () => {
  for (const avatar of ["javascript:alert(1)", "data:text/html,test", "http://example.com/a.png",
    "https://user:password@example.com/a.png"]) {
    assert.equal(normalizeMember(member({ avatar })).avatar, "");
  }
});

test("all members are returned including those without location", () => {
  const result = parseMembers({ members: [member(), member({ id: "m2", location: null })] });
  assert.equal(result.length, 2);
  assert.equal(result[1].latitude, null);
  assert.deepEqual(parseMembers({ members: [] }), []);
  for (const data of [{}, { members: null }, { members: [null] }]) {
    assert.throws(() => parseMembers(data), /response|records/);
  }
});

test("HTML cookies challenge, auth, permissions, and missing circles have safe errors", () => {
  for (const [status, body, code] of [
    [200, "<html>Please enable cookies</html>", "CHALLENGE"],
    [403, "<!doctype html>secret data", "CHALLENGE"],
    [302, "", "CHALLENGE"], [401, "private-token", "AUTH"],
    [403, "private-token", "FORBIDDEN"], [404, "private-token", "CIRCLE"],
    [500, "private-token", "HTTP"], [200, "private-token", "FORMAT"]
  ]) {
    assert.throws(() => decodeResponse(status, {}, body), error =>
      error.code === code && !error.message.includes("private-token"));
  }
});

test("rate limits respect seconds and HTTP-date Retry-After", () => {
  assert.throws(() => decodeResponse(429, { "retry-after": "600" }, ""),
    error => error.retryMs === 600000 && error.code === "RATE_LIMIT");
  assert.equal(retryAfter("2"), 60000);
  assert.equal(retryAfter("bad"), 300000);
  assert.equal(retryAfter("Fri, 02 Oct 2026 12:10:00 GMT", Date.parse("2026-10-02T12:00:00Z")), 600000);
});

test("request uses the right path and bearer header without leaking token to output", async () => {
  let options;
  const request = (opts, cb) => {
    options = opts;
    const req = new EventEmitter();
    req.end = () => {
      const res = new EventEmitter();
      res.statusCode = 200;
      res.headers = { "content-type": "application/json" };
      cb(res);
      res.emit("data", Buffer.from(JSON.stringify({ members: [member()] })));
      res.emit("end");
    };
    return req;
  };
  const result = await fetchMembers("circle-123", "test-private-token", request);
  assert.equal(options.hostname, "api-cloudfront.life360.com");
  assert.equal(options.path, "/v3/circles/circle-123/members");
  assert.equal(options.headers.Authorization, "Bearer test-private-token");
  assert.equal(result.length, 1);
  assert.ok(!JSON.stringify(result).includes("test-private-token"));
  await assert.rejects(fetchMembers("../bad", "token", request), /circleId/);
});

test("poller prevents simultaneous fetches and permits the next request after 5 seconds", async () => {
  let now = 100000, calls = 0, release;
  const poller = new CirclePoller({ now: () => now, loadToken: async () => "test-token",
    fetch: async () => { calls++; return new Promise(resolve => { release = resolve; }); } });
  const first = poller.poll("circle-1");
  const second = poller.poll("circle-1");
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(calls, 1);
  release([normalizeMember(member())]);
  assert.deepEqual(await first, await second);
  now += 4999;
  await poller.poll("circle-1");
  assert.equal(calls, 1);
  now += 1;
  const next = poller.poll("circle-1");
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(calls, 2);
  release([]);
  await next;
});

test("poller backs off after rate limits and reloads replaced credentials", async () => {
  let now = 0, calls = 0, token = "old";
  const poller = new CirclePoller({ now: () => now, loadToken: async () => token,
    fetch: async (circleId, actualToken) => {
      calls++;
      if (actualToken === "old") throw new Life360Error("RATE_LIMIT", "Rate limited", 300000);
      return [];
    } });
  const result = await poller.poll("circle-1");
  assert.equal(result.error.retryAt, 300000);
  token = "new";
  now = 60000;
  await poller.poll("circle-1");
  assert.equal(calls, 1);
  now = 300000;
  assert.equal((await poller.poll("circle-1")).error, null);
  assert.equal(calls, 2);
});

test("failed refresh is not marked as fresh data", async () => {
  let now = 0;
  const poller = new CirclePoller({ now: () => now, loadToken: async () => "test-token",
    fetch: async () => { if (now) throw Error("PRIVATE TOKEN"); return []; } });
  assert.equal((await poller.poll("circle-1")).fetchedAt, 0);
  now = 60000;
  const failed = await poller.poll("circle-1");
  assert.equal(failed.members, undefined);
  assert.equal(failed.fetchedAt, undefined);
  assert.ok(!JSON.stringify(failed).includes("PRIVATE TOKEN"));
});
