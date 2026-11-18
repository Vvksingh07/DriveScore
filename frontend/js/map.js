let driveMap, routeLine, currentMarker;
function initMap() {
  driveMap = L.map("map").setView([19.076, 72.8777], 12);
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
  }).addTo(driveMap);
  routeLine = L.polyline([], { color: "#16aaa8", weight: 5, opacity: .9 }).addTo(driveMap);
}
function updateMapPoint(lat, lon, first = false) {
  const point = [lat, lon];
  routeLine.addLatLng(point);
  if (!currentMarker) currentMarker = L.circleMarker(point, { radius: 8, color: "#062d30", fillColor: "#56d6d0", fillOpacity: 1 }).addTo(driveMap);
  else currentMarker.setLatLng(point);
  if (first) driveMap.setView(point, 16);
  else driveMap.panTo(point, { animate: true, duration: .4 });
}
function resetMapRoute() {
  routeLine.setLatLngs([]);
  if (currentMarker) { driveMap.removeLayer(currentMarker); currentMarker = null; }
}
function fitRoute(points) {
  if (points.length > 1) driveMap.fitBounds(routeLine.getBounds(), { padding: [25, 25] });
}