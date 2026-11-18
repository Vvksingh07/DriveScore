"use strict";
const fs = require("fs");
const path = require("path");
const Database = require("better-sqlite3");

// For Railway, attach a persistent volume at /data. It exposes
// RAILWAY_VOLUME_MOUNT_PATH. Never store the DB inside the ephemeral app image.
const defaultDir = path.join(__dirname, "..", "data");
const dataDir = process.env.DATA_DIR || process.env.RAILWAY_VOLUME_MOUNT_PATH || defaultDir;
const dbPath = process.env.DATABASE_PATH || path.join(dataDir, "drivescore.db");
fs.mkdirSync(path.dirname(dbPath), { recursive: true });

const db = new Database(dbPath);
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

db.exec(`
  CREATE TABLE IF NOT EXISTS trips (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    owner_key TEXT NOT NULL,
    started_at TEXT NOT NULL,
    ended_at TEXT NOT NULL,
    duration_seconds INTEGER NOT NULL DEFAULT 0,
    distance_meters REAL NOT NULL DEFAULT 0,
    max_speed_kmh REAL NOT NULL DEFAULT 0,
    score INTEGER NOT NULL DEFAULT 100,
    event_count INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS gps_points (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    trip_id INTEGER NOT NULL,
    latitude REAL NOT NULL,
    longitude REAL NOT NULL,
    speed_kmh REAL,
    accuracy REAL,
    recorded_at TEXT NOT NULL,
    FOREIGN KEY (trip_id) REFERENCES trips(id) ON DELETE CASCADE
  );
  CREATE TABLE IF NOT EXISTS driving_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    trip_id INTEGER NOT NULL,
    event_type TEXT NOT NULL,
    severity TEXT NOT NULL DEFAULT 'medium',
    penalty INTEGER NOT NULL DEFAULT 0,
    recorded_at TEXT NOT NULL,
    FOREIGN KEY (trip_id) REFERENCES trips(id) ON DELETE CASCADE
  );
`);

// Compatibility with an earlier localhost-only database: unowned existing
// records are intentionally not exposed publicly. Keep a backup of that DB.
const tripColumns = db.prepare("PRAGMA table_info(trips)").all();
if (!tripColumns.some(column => column.name === "owner_key")) {
  db.exec("ALTER TABLE trips ADD COLUMN owner_key TEXT NOT NULL DEFAULT 'legacy_unassigned'");
}
db.exec("CREATE INDEX IF NOT EXISTS idx_trips_owner_id ON trips(owner_key, id DESC)");

module.exports = db;
