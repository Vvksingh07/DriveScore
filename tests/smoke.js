"use strict";
// Run after npm ci: npm test. No external test library required.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const net = require("node:net");
const { spawn } = require("node:child_process");

(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "drivescore-test-"));
  const socket = net.createServer();
  await new Promise(resolve => socket.listen(0, "127.0.0.1", resolve));
  const port = socket.address().port;
  await new Promise(resolve => socket.close(resolve));
  const proc = spawn(process.execPath, [path.join(__dirname, "..", "server.js")], {
    cwd: path.join(__dirname, ".."),
    env: { ...process.env, PORT: String(port), DATABASE_PATH: path.join(dir,"test.db"), NODE_ENV: "development" },
    stdio: ["ignore", "pipe", "pipe"]
  });
  let log = "";
  proc.stderr.on("data", chunk => { log += chunk.toString(); });
  const base = `http://127.0.0.1:${port}`;
  try {
    let ready = false;
    for (let i = 0; i < 80; i++) {
      try {
        const r = await fetch(`${base}/api/health`);
        if (r.ok) { ready = true; break; }
      } catch (_) { /* waiting for startup */ }
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    assert.ok(ready, `Server failed to start: ${log}`);
    const aInit = await fetch(`${base}/api/trips`);
    assert.equal(aInit.status, 200);
    const aCookie = aInit.headers.get("set-cookie").split(";")[0];
    assert.ok(aCookie.startsWith("ds_visitor="));
    assert.deepEqual(await aInit.json(), []);
    const bInit = await fetch(`${base}/api/trips`);
    const bCookie = bInit.headers.get("set-cookie").split(";")[0];
    assert.notEqual(aCookie, bCookie);
    const saved = await fetch(`${base}/api/trips`, {
      method: "POST", headers: { "content-type": "application/json", "cookie": aCookie },
      body: JSON.stringify({ startedAt: new Date().toISOString(), endedAt: new Date().toISOString(),
        durationSeconds: 13, distanceMeters: 100, maxSpeedKmh: 45, score: 90,
        points: [{ latitude: 19.076, longitude: 72.8777, speedKmh: 35, accuracy: 5, recordedAt: new Date().toISOString() }],
        events: [{ type: "Demo: Hard Acceleration", severity: "medium", penalty: 4, recordedAt: new Date().toISOString() },
        { type: "Possible sudden braking", severity: "high", penalty: 6, recordedAt: new Date().toISOString() }] })
    });
    assert.equal(saved.status, 201, `Unexpected create-trip HTTP status: ${saved.status}`);
    const { id } = await saved.json();
    const aHistory = await fetch(`${base}/api/trips`, { headers: { cookie: aCookie } });
    const ah = await aHistory.json();
    assert.equal(ah.length, 1);
    assert.equal(ah[0].score, 90);
    assert.equal(ah[0].event_count, 2);
    const bHistory = await fetch(`${base}/api/trips`, { headers: { cookie: bCookie } });
    assert.deepEqual(await bHistory.json(), []);
    const forbiddenRead = await fetch(`${base}/api/trips/${id}`, { headers: { cookie: bCookie } });
    assert.equal(forbiddenRead.status, 404);
    const forbiddenDelete = await fetch(`${base}/api/trips/${id}`, { method: "DELETE", headers: { cookie: bCookie } });
    assert.equal(forbiddenDelete.status, 404);
    const ownRead = await fetch(`${base}/api/trips/${id}`, { headers: { cookie: aCookie } });
    assert.equal((await ownRead.json()).events.length, 2);
    const sitemap = await fetch(`${base}/sitemap.xml`);
    assert.equal(sitemap.status, 200);
    const homepage = await fetch(base);
    assert.equal(homepage.status, 200);
    assert.ok((await homepage.text()).includes("Simulate Hard Acceleration"));
    console.log("PASS: homepage, health, save/read, score, ownership isolation, delete protection, sitemap");
  } finally {
    proc.kill("SIGTERM");
    fs.rmSync(dir, { recursive: true, force: true });
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
