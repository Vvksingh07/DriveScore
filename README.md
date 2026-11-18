# DriveScore — public-website edition

DriveScore is a working GPS driving-safety college project using HTML/CSS/JavaScript,
Leaflet/OpenStreetMap, Node.js/Express, and SQLite (`better-sqlite3`). This package
preserves the existing scoring rules and the **Simulate Hard Acceleration** control.

## Running on your Mac

1. Install **Node.js 22**.
2. In the project folder run `npm ci` then `npm start`.
3. Open `http://localhost:3000` in the browser.
4. Keep **GPS demo mode** checked for a simulated trip; on a phone using the
   public HTTPS website you may turn off demo mode and grant GPS permission.

## Demo behaviour

- Every trip starts with **100 points**.
- Possible hard acceleration (>2.5 m/s²): **−4 points**.
- Possible sudden braking (<−3 m/s²): **−6 points**.
- Above 80 km/h **demo threshold**: **−8 points** (NOT a legal speed limit).
- Each same-type event has a **10-second cooldown**.
- **Simulate Hard Acceleration** is enabled only during demo trips and deducts
  **4 points** when clicked (subject to its own cooldown).
- Finish Trip saves the summary, accepted GPS points, and events to SQLite.

## Public website deployment on Railway

**Important:** DO NOT upload your original trip database or `.env` to GitHub.
The uploaded source archive already excludes them.

1. Create a new **GitHub repository** and upload the contents of this folder
   (the `package.json` and `server.js` files must be at the repository root).
2. Open [Railway](https://railway.com/) → New Project → Deploy from GitHub repo,
   connect GitHub if prompted, and select the repository.
3. Railway's Railpack builds Node.js projects. This project declares Node.js 22
   and a `start` script. No separate frontend host is needed: Express serves
   both the page and `/api` endpoints.
4. In Railway, add a **persistent volume** to the DriveScore service.
   Set **Mount Path = `/data`**; the app uses Railway's
   `RAILWAY_VOLUME_MOUNT_PATH` automatically. **Add the volume BEFORE storing trips.**
   (If preferred, set `DATA_DIR=/data` as an environment variable.)
5. In the service Variables, set `NODE_ENV=production`.
   Optional: after obtaining your public HTTPS domain, set
   `PUBLIC_BASE_URL=https://your-real-domain` to make the sitemap's public URL
   explicit. Do **not** copy that placeholder literally.
6. Generate a public domain in Railway's service **Settings → Networking**.
   Verify `https://YOUR-DOMAIN/api/health` returns a JSON `status: ok`.
7. Open the domain in a browser and test demo Start Trip → Simulate Hard
   Acceleration → Finish Trip → refresh history.
8. Optional search listing: verify the public URL in
   [Google Search Console](https://search.google.com/search-console/about),
   then request indexing for your homepage and submit `/sitemap.xml`.
   Search indexing is **not guaranteed** and may take days or weeks.

### IMPORTANT: Persistence and privacy

- Without a Railway volume, the SQLite file is on an **ephemeral container** and
  data may vanish during redeployment. Only one app instance should write to this
  SQLite file; don't scale this demonstration across replicas.
- Trip history is **separated by anonymous HttpOnly per-browser cookies**.
  A visitor cannot list or delete another visitor's trips via this API using a
  different browser cookie, but this is NOT a full account system.
- Visitors with different browsers/devices do not share trip history.
  Clearing cookies means losing access to history attached to that cookie.
- The backend still receives and stores GPS points when Finish Trip is clicked.
  Avoid uploading sensitive real routes for an educational demonstration.
- Do not mistake the simulated route for a verified real driving trip.
- The original local database (if one exists) stays in your original folder.
  This public edition uses a new database, and earlier unowned legacy trip
  records are deliberately hidden by its privacy migration.
- Before a serious multi-user launch, add real user login, data deletion/export,
  abuse prevention, an explicit privacy policy and backup/retention controls.

## Google visibility

The homepage has metadata, descriptive visible text, `robots.txt`, and a
`sitemap.xml` endpoint. It will be *accessible by direct URL immediately after
hosting*, but Google may not display it in search results until indexed.

## File layout

```
backend/
  controllers/tripController.js    # SQLite CRUD / input validation / owner filtering
  routes/trips.js                 # Express API routes
  database.js                    # SQLite initialization & volume support
  visitor.js                     # Anonymous browser cookie partition
frontend/
  css/style.css
  js/app.js                      # Dashboard, score, events, trip saves
  js/gps.js                      # Phone GPS / simulated route
  js/map.js                      # Leaflet map
  js/api.js                      # Fetch API helper
  index.html
  robots.txt
server.js
package.json
package-lock.json
```

## Smoke test

Run `npm test` after `npm ci` to check the health endpoint, trip save/read,
visitor separation, score persistence and sitemap.
