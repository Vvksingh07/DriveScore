const API = {
  async request(url, options = {}) {
    const response = await fetch(url, {
      headers: { "Content-Type": "application/json", ...(options.headers || {}) },
      ...options
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || `Request failed (${response.status})`);
    return data;
  },
  health() { return this.request("/api/health"); },
  getTrips() { return this.request("/api/trips"); },
  getTrip(id) { return this.request(`/api/trips/${id}`); },
  saveTrip(payload) { return this.request("/api/trips", { method: "POST", body: JSON.stringify(payload) }); },
  deleteTrip(id) { return this.request(`/api/trips/${id}`, { method: "DELETE" }); }
};