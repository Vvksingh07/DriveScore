# DriveScore — Final College Project

A mobile-first, installable web app that tracks a driving trip using the phone's GPS, draws the driven route on a map, estimates speed and distance, flags possible harsh driving events, and stores trip summaries on the device.

## Features
- Live phone GPS location while a trip is recording
- Interactive map using Leaflet + OpenStreetMap
- Route polyline drawn as GPS points arrive
- Approximate speed, distance, duration and maximum speed
- Heuristic event detection: sudden braking, hard acceleration, sharp turns and a demo overspeed alert
- Driving score starting at 100, with event deductions
- Local trip history stored in browser `localStorage`
- Export trip summaries as CSV
- Installable PWA shell and basic offline app-shell caching

## Run it

GPS access requires a secure context: **HTTPS** or `localhost`.

### Quick local test
1. Extract the ZIP.
2. Open a terminal in the extracted `DriveScore_Final` folder.
3. Run a local server, for example:
   - Python: `python -m http.server 8000`
   - Node: `npx serve`
4. On the same device, open `http://localhost:8000` (or use your computer's LAN IP from a phone only if served over HTTPS; plain LAN HTTP usually will not qualify as a secure context).
5. Allow location permission and press **Start trip**.

### Put it on your phone
Deploy the folder to a static HTTPS host such as GitHub Pages, Netlify, or Vercel. Open the HTTPS URL in your phone browser, allow location permission, then use the browser's **Add to Home Screen** option. On iPhone, use Safari's Share → Add to Home Screen.

## Important limitations
- This is a student prototype, not a certified driver-safety or vehicle telemetry system.
- Browser GPS accuracy varies with device, signal, buildings and weather. GPS speed can be noisy; event detection is approximate and may produce false positives or miss events.
- The 80 km/h overspeed alert is only a demo threshold. It is **not** a legal speed limit and is not aware of local road speed limits.
- Browser/PWA GPS tracking may pause or stop when the app is backgrounded, the screen locks, battery saver activates, or the OS suspends the browser. Keep the app visible during testing; do not rely on it for unattended/background trip tracking.
- Map tiles are served by OpenStreetMap's public tile service. Keep attribution visible and follow its usage policy. This project does not include a paid map API key.
- Trip data is stored locally in the browser on that device. Clearing browser data or uninstalling may remove it. There is no account, cloud sync, or leaderboard.
- For safety, mount the phone securely and start/stop before driving. Never handle the phone while moving.

## Tech stack
HTML · CSS · JavaScript · Geolocation API · Leaflet · OpenStreetMap · localStorage · PWA Service Worker
