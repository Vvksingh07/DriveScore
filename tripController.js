
const db = require("../database");

function validNumber(n) {
  return typeof n === "number" && Number.isFinite(n);
}

exports.listTrips = (req, res) => {
  const trips = db.prepare(
    "SELECT * FROM trips WHERE owner_key = ? ORDER BY id DESC"
  ).all(req.ownerKey);

  res.json(trips);
};

exports.getTrip = (req, res) => {
  const id = Number(req.params.id);

  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ error: "Invalid trip ID." });
  }

  const trip = db.prepare(
    "SELECT * FROM trips WHERE id = ? AND owner_key = ?"
  ).get(id, req.ownerKey);

  if (!trip) {
    return res.status(404).json({ error: "Trip not found." });
  }

  trip.points = db.prepare(
    "SELECT latitude, longitude, speed_kmh, accuracy, recorded_at FROM gps_points WHERE trip_id = ? ORDER BY id ASC"
  ).all(id);

  trip.events = db.prepare(
    "SELECT event_type, severity, penalty, recorded_at FROM driving_events WHERE trip_id = ? ORDER BY id ASC"
  ).all(id);

  res.json(trip);
};

exports.createTrip = (req, res) => {
  const b = req.body || {};
  const points = Array.isArray(b.points) ? b.points : [];
  const events = Array.isArray(b.events) ? b.events : [];

  if (!b.startedAt || !b.endedAt ||
      !validNumber(b.distanceMeters) || b.distanceMeters < 0 ||
      b.distanceMeters > 10000000 ||
      !validNumber(b.durationSeconds) || b.durationSeconds < 0 ||
      b.durationSeconds > 2592000 ||
      !validNumber(b.maxSpeedKmh) || b.maxSpeedKmh < 0 ||
      b.maxSpeedKmh > 500 ||
      !Number.isInteger(b.score) ||
      b.score < 0 || b.score > 100) {
    return res.status(400).json({
      error: "Missing or invalid trip summary fields."
    });
  }

  if (!Number.isFinite(Date.parse(b.startedAt)) || !Number.isFinite(Date.parse(b.endedAt))) {
    return res.status(400).json({ error: "Invalid trip dates." });
  }

  if (points.length > 10000 || events.length > 1000) {
    return res.status(413).json({
      error: "Trip contains too much data."
    });
  }

  for (const p of points) {
    if (!validNumber(p.latitude) ||
        p.latitude < -90 || p.latitude > 90 ||
        !validNumber(p.longitude) ||
        p.longitude < -180 || p.longitude > 180 ||
        (p.speedKmh != null && (!validNumber(p.speedKmh) || p.speedKmh < 0 || p.speedKmh > 500)) ||
        (p.accuracy != null && (!validNumber(p.accuracy) || p.accuracy < 0 || p.accuracy > 100000)) ||
        (p.recordedAt && !Number.isFinite(Date.parse(p.recordedAt)))) {
      return res.status(400).json({
        error: "A GPS point contains invalid coordinates."
      });
    }
  }

  for (const e of events) {
    if (!e || typeof e !== "object" ||
        (e.recordedAt && !Number.isFinite(Date.parse(e.recordedAt)))) {
      return res.status(400).json({ error: "Invalid driving event." });
    }
  }

  const insertTrip = db.prepare(`
    INSERT INTO trips
    (owner_key, started_at, ended_at, duration_seconds,
     distance_meters, max_speed_kmh, score, event_count)
    VALUES
    (@ownerKey, @startedAt, @endedAt, @durationSeconds,
     @distanceMeters, @maxSpeedKmh, @score, @eventCount)
  `);

  const insertPoint = db.prepare(`
    INSERT INTO gps_points
    (trip_id, latitude, longitude, speed_kmh, accuracy, recorded_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  const insertEvent = db.prepare(`
    INSERT INTO driving_events
    (trip_id, event_type, severity, penalty, recorded_at)
    VALUES (?, ?, ?, ?, ?)
  `);

  const saveAll = db.transaction(() => {
    const result = insertTrip.run({
      ownerKey: req.ownerKey,
      startedAt: b.startedAt,
      endedAt: b.endedAt,
      durationSeconds: Math.max(0, Math.round(b.durationSeconds)),
      distanceMeters: Math.max(0, b.distanceMeters),
      maxSpeedKmh: Math.max(0, b.maxSpeedKmh),
      score: b.score,
      eventCount: events.length
    });

    const tripId = result.lastInsertRowid;

    for (const p of points) {
      insertPoint.run(
        tripId,
        p.latitude,
        p.longitude,
        validNumber(p.speedKmh) ? p.speedKmh : null,
        validNumber(p.accuracy) ? p.accuracy : null,
        p.recordedAt || new Date().toISOString()
      );
    }

    for (const e of events) {
      insertEvent.run(
        tripId,
        String(e.type || "Driving event").slice(0, 60),
        String(e.severity || "medium").slice(0, 20),
        Math.max(0, Math.min(100, Number(e.penalty) || 0)),
        e.recordedAt || new Date().toISOString()
      );
    }

    return tripId;
  });

  try {
    const id = saveAll();

    res.status(201).json({
      message: "Trip saved successfully.",
      id
    });

  } catch (error) {
    console.error(error);

    res.status(500).json({
      error: "Could not save trip."
    });
  }
};

exports.deleteTrip = (req, res) => {
  const id = Number(req.params.id);

  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({
      error: "Invalid trip ID."
    });
  }

  const result = db.prepare(
    "DELETE FROM trips WHERE id = ? AND owner_key = ?"
  ).run(id, req.ownerKey);

  if (!result.changes) {
    return res.status(404).json({
      error: "Trip not found."
    });
  }

  res.json({ message: "Trip deleted." });
};
