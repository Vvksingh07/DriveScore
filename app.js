(() => {
  "use strict";

  const $ = (id) => document.getElementById(id);
  const STORAGE_KEY = "drivescore_trips_v2";
  const DEMO_SPEED_LIMIT = 80; // Demonstration threshold only; not a legal road limit.
  const MAX_ACCURACY_METERS = 45;
  const MIN_POINT_DISTANCE_METERS = 4;

  let map, routeLine, currentMarker, accuracyCircle;
  let watchId = null;
  let activeTrip = null;
  let lastFix = null;
  let lastEventAt = { brake: 0, acceleration: 0, turn: 0, overspeed: 0 };
  let timerHandle = null;
  let deferredInstallPrompt = null;
  let trips = loadTrips();

  const ui = {
    score: $("scoreValue"), speed: $("speedValue"), speedBar: $("speedBar"),
    distance: $("distanceValue"), duration: $("durationValue"), events: $("eventsValue"),
    state: $("tripState"), gps: $("gpsStatus"), start: $("startBtn"), stop: $("stopBtn"),
    controlTitle: $("controlTitle"), controlHint: $("controlHint"), indicator: $("recordIndicator"),
    eventList: $("eventList"), eventSummary: $("eventSummary"), history: $("historyList"),
    toast: $("toast")
  };

  function initMap() {
    map = L.map("map", { zoomControl: true, scrollWheelZoom: false }).setView([19.076, 72.8777], 11);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors'
    }).addTo(map);
    routeLine = L.polyline([], { color: "#18aebe", weight: 5, opacity: .9, lineCap: "round", lineJoin: "round" }).addTo(map);
  }

  function loadTrips() {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || []; }
    catch { return []; }
  }
  function saveTrips() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(trips));
  }
  function toast(message) {
    ui.toast.textContent = message;
    ui.toast.classList.add("show");
    clearTimeout(toast.timeout);
    toast.timeout = setTimeout(() => ui.toast.classList.remove("show"), 2600);
  }
  function haversine(a, b) {
    const R = 6371000, rad = Math.PI / 180;
    const dLat = (b.lat - a.lat) * rad, dLon = (b.lng - a.lng) * rad;
    const x = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLon / 2) ** 2;
    return 2 * R * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
  }
  function bearing(a, b) {
    const rad = Math.PI / 180;
    const y = Math.sin((b.lng - a.lng) * rad) * Math.cos(b.lat * rad);
    const x = Math.cos(a.lat * rad) * Math.sin(b.lat * rad) -
      Math.sin(a.lat * rad) * Math.cos(b.lat * rad) * Math.cos((b.lng - a.lng) * rad);
    return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
  }
  function angleDiff(a, b) { return Math.abs(((b - a + 540) % 360) - 180); }
  function elapsedSeconds() {
    return activeTrip ? Math.max(0, Math.floor((Date.now() - activeTrip.startedAt) / 1000)) : 0;
  }
  function formatDuration(seconds) {
    const h = Math.floor(seconds / 3600), m = Math.floor((seconds % 3600) / 60), s = seconds % 60;
    return h ? `${String(h).padStart(2,"0")}:${String(m).padStart(2,"0")}:${String(s).padStart(2,"0")}` :
      `${String(m).padStart(2,"0")}:${String(s).padStart(2,"0")}`;
  }
  function currentScore() { return activeTrip ? Math.max(0, 100 - activeTrip.deductions) : 100; }
  function updateUI() {
    const speed = activeTrip?.currentSpeed || 0;
    ui.score.textContent = currentScore();
    ui.speed.textContent = Math.round(speed);
    ui.speedBar.style.width = `${Math.min(100, speed / 120 * 100)}%`;
    ui.speedBar.style.background = speed > DEMO_SPEED_LIMIT ? "var(--red)" : "var(--lime)";
    ui.distance.textContent = `${((activeTrip?.distanceMeters || 0) / 1000).toFixed(2)} `;
    ui.duration.textContent = formatDuration(elapsedSeconds());
    ui.events.textContent = activeTrip?.events.length || 0;
    ui.state.textContent = activeTrip ? "Recording" : "Ready";
    ui.gps.textContent = activeTrip ? "GPS ACTIVE" : "GPS OFF";
    ui.gps.style.color = activeTrip ? "var(--lime)" : "var(--muted)";
    ui.start.disabled = !!activeTrip;
    ui.stop.disabled = !activeTrip;
    ui.controlTitle.textContent = activeTrip ? "Trip in progress" : "Ready to roll?";
    ui.controlHint.textContent = activeTrip ? "Drive safely. Your route is being recorded." : "Allow location access, then start your trip.";
    ui.indicator.classList.toggle("active", !!activeTrip);
  }
  function resetMap() {
    routeLine.setLatLngs([]);
    if (currentMarker) { map.removeLayer(currentMarker); currentMarker = null; }
    if (accuracyCircle) { map.removeLayer(accuracyCircle); accuracyCircle = null; }
  }
  function startTrip() {
    if (!("geolocation" in navigator)) return toast("This browser does not support GPS location.");
    if (!window.isSecureContext) return toast("GPS needs HTTPS or localhost. Open the hosted secure link.");
    if (activeTrip) return;
    activeTrip = {
      id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now()),
      startedAt: Date.now(), endedAt: null, distanceMeters: 0, currentSpeed: 0,
      maxSpeed: 0, deductions: 0, events: [], points: [], lastBearing: null
    };
    lastFix = null;
    lastEventAt = { brake: 0, acceleration: 0, turn: 0, overspeed: 0 };
    resetMap();
    updateUI();
    watchId = navigator.geolocation.watchPosition(onPosition, onPositionError, {
      enableHighAccuracy: true, maximumAge: 1000, timeout: 15000
    });
    timerHandle = setInterval(updateUI, 1000);
    toast("Trip started. GPS is connecting…");
  }
  function onPosition(position) {
    if (!activeTrip) return;
    const c = position.coords;
    if (c.accuracy && c.accuracy > MAX_ACCURACY_METERS) {
      ui.gps.textContent = "WEAK GPS";
      return;
    }
    const fix = {
      lat: c.latitude, lng: c.longitude, time: position.timestamp || Date.now(),
      accuracy: c.accuracy || 0,
      speed: Number.isFinite(c.speed) && c.speed >= 0 ? c.speed * 3.6 : null,
      heading: Number.isFinite(c.heading) ? c.heading : null
    };
    if (lastFix) {
      const distance = haversine(lastFix, fix);
      const dt = Math.max(.5, (fix.time - lastFix.time) / 1000);
      if (distance > 250 || dt > 60) { lastFix = fix; updatePositionVisuals(fix); return; } // Ignore GPS jumps.
      if (distance >= MIN_POINT_DISTANCE_METERS) activeTrip.distanceMeters += distance;

      const calculatedSpeed = distance / dt * 3.6;
      const speed = fix.speed !== null ? fix.speed : calculatedSpeed;
      const previousSpeed = lastFix.speed ?? 0;
      const acceleration = (speed - previousSpeed) / dt;
      const turnAngle = bearing(lastFix, fix);
      const headingChange = activeTrip.lastBearing === null ? 0 : angleDiff(activeTrip.lastBearing, turnAngle);

      activeTrip.currentSpeed = speed;
      activeTrip.maxSpeed = Math.max(activeTrip.maxSpeed, speed);
      detectEvents(speed, acceleration, headingChange, fix.time);
      if (distance >= MIN_POINT_DISTANCE_METERS) {
        activeTrip.points.push([fix.lat, fix.lng, fix.time]);
        routeLine.addLatLng([fix.lat, fix.lng]);
      }
      activeTrip.lastBearing = turnAngle;
    } else {
      activeTrip.currentSpeed = fix.speed || 0;
      activeTrip.points.push([fix.lat, fix.lng, fix.time]);
      routeLine.addLatLng([fix.lat, fix.lng]);
      map.setView([fix.lat, fix.lng], 16);
    }
    lastFix = fix;
    updatePositionVisuals(fix);
    updateUI();
  }
  function updatePositionVisuals(fix) {
    const point = [fix.lat, fix.lng];
    if (!currentMarker) {
      currentMarker = L.circleMarker(point, { radius: 8, color: "#13251a", weight: 3, fillColor: "#b7f36b", fillOpacity: 1 }).addTo(map);
      accuracyCircle = L.circle(point, { radius: Math.min(fix.accuracy || 15, 60), color: "#b7f36b", weight: 1, fillOpacity: .07 }).addTo(map);
    } else {
      currentMarker.setLatLng(point);
      accuracyCircle.setLatLng(point).setRadius(Math.min(fix.accuracy || 15, 60));
    }
  }
  function detectEvents(speed, acceleration, turnAngle, now) {
    // Thresholds are heuristics from phone GPS samples; they are not vehicle-grade measurements.
    if (acceleration < -3.0 && now - lastEventAt.brake > 12000) {
      addEvent("brake", "Sudden braking", "A sharp GPS speed drop was detected.", 8, now);
    } else if (acceleration > 3.2 && now - lastEventAt.acceleration > 12000) {
      addEvent("acceleration", "Hard acceleration", "A rapid GPS speed increase was detected.", 5, now);
    }
    if (turnAngle > 65 && speed > 18 && now - lastEventAt.turn > 15000) {
      addEvent("turn", "Sharp turn", "A large heading change was detected.", 5, now);
    }
    if (speed > DEMO_SPEED_LIMIT && now - lastEventAt.overspeed > 20000) {
      addEvent("overspeed", "Demo speed alert", `GPS speed was above ${DEMO_SPEED_LIMIT} km/h.`, 10, now);
    }
  }
  function addEvent(type, title, detail, points, now) {
    lastEventAt[type] = now;
    activeTrip.deductions += points;
    activeTrip.events.unshift({ type, title, detail, points, time: now });
    renderEvents(activeTrip.events);
    toast(`${title}: -${points} points`);
    updateUI();
  }
  function onPositionError(error) {
    const messages = {
      1: "Location permission denied. Allow location access in browser settings.",
      2: "GPS position unavailable. Try moving to an open area.",
      3: "GPS timed out. Waiting for another location update."
    };
    toast(messages[error.code] || "Unable to read GPS location.");
    ui.gps.textContent = "GPS ISSUE";
  }
  function stopTrip() {
    if (!activeTrip) return;
    if (watchId !== null) navigator.geolocation.clearWatch(watchId);
    clearInterval(timerHandle);
    activeTrip.endedAt = Date.now();
    activeTrip.currentSpeed = 0;
    const saved = { ...activeTrip, score: currentScore() };
    if (saved.points.length > 1 || saved.distanceMeters > 0) {
      trips.unshift(saved);
      trips = trips.slice(0, 30);
      saveTrips();
      toast(`Trip saved · score ${saved.score}/100`);
    } else {
      toast("Trip ended. Not enough GPS data to save a route.");
    }
    activeTrip = null; watchId = null; lastFix = null;
    renderHistory(); renderEvents([]);
    updateUI();
  }
  function renderEvents(events) {
    if (!events.length) {
      ui.eventList.innerHTML = '<div class="empty-state">Your driving events will appear here during a trip.</div>';
      ui.eventSummary.textContent = "No events yet"; return;
    }
    ui.eventSummary.textContent = `${events.length} detected`;
    ui.eventList.innerHTML = events.slice(0, 6).map(e => `
      <div class="event-item">
        <div class="event-left"><span class="event-symbol ${e.type === "brake" || e.type === "overspeed" ? "bad" : ""}">${eventIcon(e.type)}</span>
          <div><strong>${escapeHTML(e.title)}</strong><small>${new Date(e.time).toLocaleTimeString([], {hour:"2-digit",minute:"2-digit"})} · ${escapeHTML(e.detail)}</small></div>
        </div><span class="event-deduction">-${e.points}</span>
      </div>`).join("");
  }
  function eventIcon(type) { return ({ brake:"■", acceleration:"⚡", turn:"↪", overspeed:"!" })[type] || "•"; }
  function renderHistory() {
    if (!trips.length) {
      ui.history.innerHTML = '<div class="empty-state">Completed trips will be saved on this device.</div>'; return;
    }
    ui.history.innerHTML = trips.slice(0, 6).map(t => `
      <div class="trip-item">
        <div class="trip-left"><span class="event-symbol">↗</span><div>
          <strong>${(t.distanceMeters / 1000).toFixed(2)} km · ${formatDuration(Math.floor((t.endedAt-t.startedAt)/1000))}</strong>
          <small>${new Date(t.startedAt).toLocaleDateString()} · ${t.events.length} events · Max ${Math.round(t.maxSpeed || 0)} km/h</small>
        </div></div>
        <div class="trip-actions"><span class="trip-score">${t.score ?? Math.max(0,100-(t.deductions||0))}</span>
        <button class="delete-trip" data-delete="${escapeHTML(t.id)}" aria-label="Delete trip">×</button></div>
      </div>`).join("");
  }
  function escapeHTML(value) {
    return String(value).replace(/[&<>"']/g, c => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" })[c]);
  }
  function exportCSV() {
    if (!trips.length) return toast("No saved trips to export.");
    const rows = [["Date","Distance km","Duration seconds","Score","Max speed km/h","Events","Route points"]];
    trips.forEach(t => rows.push([
      new Date(t.startedAt).toISOString(), (t.distanceMeters/1000).toFixed(3),
      Math.floor((t.endedAt-t.startedAt)/1000), t.score ?? 100-(t.deductions||0),
      Math.round(t.maxSpeed||0), t.events.length, t.points.length
    ]));
    const csv = rows.map(row => row.map(v => `"${String(v).replace(/"/g,'""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], {type:"text/csv;charset=utf-8"});
    const url = URL.createObjectURL(blob), a = document.createElement("a");
    a.href = url; a.download = "drivescore-trips.csv"; a.click(); URL.revokeObjectURL(url);
    toast("Trip summary exported.");
  }

  $("startBtn").addEventListener("click", startTrip);
  $("stopBtn").addEventListener("click", stopTrip);
  $("centerMapBtn").addEventListener("click", () => {
    if (currentMarker) map.setView(currentMarker.getLatLng(), 16);
    else if (lastFix) map.setView([lastFix.lat,lastFix.lng], 16);
    else toast("Start a trip to center on your GPS location.");
  });
  $("exportBtn").addEventListener("click", exportCSV);
  ui.history.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-delete]");
    if (!btn) return;
    trips = trips.filter(t => t.id !== btn.dataset.delete);
    saveTrips(); renderHistory(); toast("Trip deleted.");
  });
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault(); deferredInstallPrompt = e; $("installBtn").hidden = false;
  });
  $("installBtn").addEventListener("click", async () => {
    if (!deferredInstallPrompt) return;
    deferredInstallPrompt.prompt();
    await deferredInstallPrompt.userChoice;
    deferredInstallPrompt = null; $("installBtn").hidden = true;
  });
  if ("serviceWorker" in navigator && location.protocol.startsWith("http")) {
    window.addEventListener("load", () => navigator.serviceWorker.register("./sw.js").catch(() => {}));
  }

  initMap();
  renderHistory();
  updateUI();
})();