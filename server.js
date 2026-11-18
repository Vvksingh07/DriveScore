"use strict";
const express = require("express");
const path = require("path");
const visitor = require("./backend/visitor");
const tripsRouter = require("./backend/routes/trips");

const app = express();
app.disable("x-powered-by");
app.set("trust proxy", 1); // Railway HTTPS proxy.
const PORT = Number(process.env.PORT) || 3000;

app.use((_req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  next();
});
app.use(express.json({ limit: "2mb" }));
app.use(express.static(path.join(__dirname, "frontend")));

app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", application: "DriveScore API", time: new Date().toISOString() });
});

// Separate trips per browser; the app is a public demonstration, not an account system.
app.use("/api/trips", visitor, tripsRouter);

// Optional sitemap once the public URL is known.
app.get("/sitemap.xml", (req, res) => {
  const configured = process.env.PUBLIC_BASE_URL;
  const host = req.get("host") || "localhost";
  const safeHost = /^[a-z0-9.-]+(?::\d+)?$/i.test(host) ? host : "localhost";
  const origin = configured && /^https:\/\/[a-z0-9.-]+(?::\d+)?\/?$/i.test(configured)
    ? configured.replace(/\/$/, "")
    : `${req.protocol}://${safeHost}`;
  res.type("application/xml").send(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>${origin}/</loc></url></urlset>`);
});

app.get("*", (_req, res) => {
  res.sendFile(path.join(__dirname, "frontend", "index.html"));
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`DriveScore running on port ${PORT}`);
  if (process.env.NODE_ENV === "production" &&
      !process.env.RAILWAY_VOLUME_MOUNT_PATH && !process.env.DATA_DIR && !process.env.DATABASE_PATH) {
    console.warn("WARNING: No persistent database directory configured. Add a hosting volume before saving real trips.");
  }
});
