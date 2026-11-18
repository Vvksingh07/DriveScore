"use strict";
const crypto = require("crypto");

// The prototype has no login system. A random, HttpOnly visitor cookie separates
// each browser's trips so a public visitor cannot list other visitors' journeys.
// Clearing browser cookies loses access to that browser's existing history.
function visitor(req, res, next) {
  const match = (req.headers.cookie || "").match(/(?:^|;\s*)ds_visitor=([a-f0-9]{64})(?:;|$)/);
  let token = match ? match[1] : undefined;
  if (!token) {
    token = crypto.randomBytes(32).toString("hex");
    const isHttps = process.env.NODE_ENV === "production";
    res.cookie("ds_visitor", token, {
      httpOnly: true,
      secure: isHttps,
      sameSite: "lax",
      path: "/",
      maxAge: 180 * 24 * 60 * 60 * 1000
    });
  }
  req.ownerKey = crypto.createHash("sha256").update(token).digest("hex");
  res.setHeader("Cache-Control", "no-store");
  next();
}

module.exports = visitor;
