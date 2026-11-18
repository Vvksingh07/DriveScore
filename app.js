const $ = id => document.getElementById(id);
let active = false, startedAt = null, timerId = null;
let points = [], events = [], distanceMeters = 0, maxSpeed = 0, score = 100;
let previousPoint = null, lastEventAt = {};
const OVERSPEED_DEMO_THRESHOLD = 80; // Demonstration threshold only; not a legal road limit.

function haversine(a, b) {
  const rad = d => d * Math.PI / 180, R = 6371000;
  const dLat = rad(b.latitude - a.latitude), dLon = rad(b.longitude - a.longitude);
  const lat1 = rad(a.latitude), lat2 = rad(b.latitude);
  const h = Math.sin(dLat/2)**2 + Math.cos(lat1)*Math.cos(lat2)*Math.sin(dLon/2)**2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
function elapsedSeconds() { return startedAt ? Math.floor((Date.now() - startedAt) / 1000) : 0; }
function formatDuration(s) { return `${String(Math.floor(s/60)).padStart(2,"0")}:${String(s%60).padStart(2,"0")}`; }
function updateDuration() { $("duration").textContent = formatDuration(elapsedSeconds()); }
function addEvent(type, penalty, severity = "medium") {
  const now = Date.now();
  if (lastEventAt[type] && now - lastEventAt[type] < 10000) return;
  lastEventAt[type] = now;
  events.push({ type, penalty, severity, recordedAt: new Date().toISOString() });
  score = Math.max(0, score - penalty);
  renderScore(); renderEvents();
}
function simulateHardAcceleration() {
  if (!active) {
    alert("Please start a trip first.");
    return;
  }

  if (!$("demoToggle").checked) {
    alert("Enable GPS demo mode first.");
    return;
  }

  const type = "Demo: Hard Acceleration";

  if (lastEventAt[type] && Date.now() - lastEventAt[type] < 10000) {
    alert("Please wait 10 seconds before testing again.");
    return;
  }

  addEvent(type, 4, "medium");
  alert("Simulated hard acceleration: 4 points deducted.");
}
function detectEvents(point) {
  if (point.speedKmh != null && point.speedKmh > OVERSPEED_DEMO_THRESHOLD) addEvent("Demo overspeed alert", 8, "high");
  if (!previousPoint || point.speedKmh == null || previousPoint.speedKmh == null) return;
  const dt = (Date.parse(point.recordedAt) - Date.parse(previousPoint.recordedAt)) / 1000;
  if (dt <= 0 || dt > 8) return;
  const acceleration = (point.speedKmh - previousPoint.speedKmh) / 3.6 / dt;
  if (acceleration < -3.0) addEvent("Possible sudden braking", 6, "high");
  if (acceleration > 2.5) addEvent("Possible hard acceleration", 4, "medium");
}
function handlePoint(point) {
  if (!active) return;
  if (point.accuracy && point.accuracy > 70) {
    $("locationText").textContent = "GPS accuracy is low; waiting for a better fix";
    return;
  }
  if (previousPoint) {
    const segment = haversine(previousPoint, point);
    const seconds = (Date.parse(point.recordedAt) - Date.parse(previousPoint.recordedAt)) / 1000;
    // Ignore obvious GPS jumps and stationary GPS noise.
    if (segment > 2 && segment < 250 && seconds > 0 && seconds < 30) distanceMeters += segment;
  }
  points.push(point);
  if (point.speedKmh != null) maxSpeed = Math.max(maxSpeed, point.speedKmh);
  detectEvents(point);
  previousPoint = point;
  updateMapPoint(point.latitude, point.longitude, points.length === 1);
  $("speed").textContent = point.speedKmh == null ? "—" : Math.round(point.speedKmh);
  $("distance").textContent = (distanceMeters / 1000).toFixed(2);
  $("maxSpeed").textContent = Math.round(maxSpeed);
  $("speedStatus").textContent = point.speedKmh == null ? "Speed unavailable" : point.speedKmh > OVERSPEED_DEMO_THRESHOLD ? "Above demo threshold" : "GPS speed estimate";
  $("locationText").textContent = `${point.latitude.toFixed(5)}, ${point.longitude.toFixed(5)}`;
  $("gpsAccuracy").textContent = `Accuracy ±${Math.round(point.accuracy || 0)} m`;
  renderScore();
}
function renderScore() {
  $("score").textContent = score;
  $("scoreBar").style.width = `${score}%`;
  $("scoreMessage").textContent = score >= 90 ? "Great driving habits" : score >= 70 ? "Room to improve" : "Review your driving events";
  $("scoreBar").style.background = score >= 80 ? "var(--green)" : score >= 60 ? "#e6b85c" : "var(--red)";
}
function renderEvents() {
  $("eventCount").textContent = `${events.length} event${events.length === 1 ? "" : "s"}`;
  $("events").innerHTML = events.length ? events.map(e => `<div class="event-item"><span>${escapeHtml(e.type)}</span><span>−${e.penalty} pts</span></div>`).join("") : "No events recorded yet.";
}
function escapeHtml(s) { return String(s).replace(/[&<>"']/g, c => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[c])); }

async function startTrip() {
  if (active) return;
  active = true; startedAt = Date.now(); points = []; events = []; distanceMeters = 0; maxSpeed = 0; score = 100; previousPoint = null; lastEventAt = {};
  resetMapRoute(); renderScore(); renderEvents();
  const usingDemo = $("demoToggle").checked;
  $("demoToggle").disabled = true;
  $("startBtn").disabled = true;
  $("stopBtn").disabled = false;
  $("simulateAccelerationBtn").disabled = !usingDemo;
  $("speed").textContent = "—"; $("distance").textContent = "0.00"; $("maxSpeed").textContent = "0";
  timerId = setInterval(updateDuration, 1000); updateDuration();
  GPS.start(handlePoint, err => {
    alert(`Location error: ${err.message}. If you are using the real GPS option, allow location access and use localhost/HTTPS.`);
    finishTrip();
  }, usingDemo);
}
async function finishTrip() {
  if (!active) return;
  GPS.stop(); clearInterval(timerId); active = false;
  $("startBtn").disabled = false;
  $("stopBtn").disabled = true;
  $("demoToggle").disabled = false;
  $("simulateAccelerationBtn").disabled = true;
  if (!points.length) { alert("No GPS points were recorded, so this trip was not saved."); return; }
  const payload = {
    startedAt: new Date(startedAt).toISOString(), endedAt: new Date().toISOString(),
    durationSeconds: elapsedSeconds(), distanceMeters, maxSpeedKmh: maxSpeed,
    score, points, events
  };
  try {
    const result = await API.saveTrip(payload);
    alert(`Trip saved to SQLite database. Trip ID: ${result.id}`);
    await loadHistory();
  } catch (err) {
    alert(`Backend could not save the trip: ${err.message}`);
  }
}
async function loadHistory() {
  try {
    const trips = await API.getTrips();
    $("history").innerHTML = trips.length ? trips.map(t => `
      <div class="trip-row">
        <div><b>Trip #${t.id}</b><small>${new Date(t.started_at).toLocaleString()}</small></div>
        <div><b>${(t.distance_meters/1000).toFixed(2)} km</b><small>Distance</small></div>
        <div><b>${t.score}/100</b><small>Score</small></div>
        <div class="hide-mobile"><b>${formatDuration(t.duration_seconds)}</b><small>Duration</small></div>
        <button data-delete="${t.id}">Delete</button>
      </div>`).join("") : '<div class="history-empty">No trips saved yet. Start a trip to create your first record.</div>';
    document.querySelectorAll("[data-delete]").forEach(btn => btn.addEventListener("click", async () => {
      if (confirm("Delete this saved trip?")) { await API.deleteTrip(btn.dataset.delete); loadHistory(); }
    }));
  } catch (err) {
    $("history").textContent = `Could not load trip history: ${err.message}`;
  }
}
async function checkBackend() {
  try { await API.health(); $("apiDot").className = "dot ok"; $("apiStatus").textContent = "Backend connected"; }
  catch { $("apiDot").className = "dot bad"; $("apiStatus").textContent = "Backend offline"; }
}
document.addEventListener("DOMContentLoaded", () => {
  initMap(); $("year").textContent = new Date().getFullYear();
  $("startBtn").addEventListener("click", startTrip);
  $("stopBtn").addEventListener("click", finishTrip);
  $("simulateAccelerationBtn").addEventListener("click", simulateHardAcceleration);
  $("refreshBtn").addEventListener("click", loadHistory);
  checkBackend(); loadHistory();
});