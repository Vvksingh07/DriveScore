const GPS = {
  watchId: null,
  demoTimer: null,
  demoIndex: 0,
  demoRoute: [
    [19.07600, 72.87770], [19.07635, 72.87810], [19.07675, 72.87855],
    [19.07715, 72.87900], [19.07755, 72.87950], [19.07795, 72.88005],
    [19.07830, 72.88055], [19.07865, 72.88110], [19.07905, 72.88160],
    [19.07945, 72.88205], [19.07985, 72.88255], [19.08020, 72.88300]
  ],
  start(onPoint, onError, demo) {
    if (demo) return this.startDemo(onPoint);
    if (!navigator.geolocation) return onError(new Error("Geolocation is not supported."));
    this.watchId = navigator.geolocation.watchPosition(
      pos => onPoint({
        latitude: pos.coords.latitude,
        longitude: pos.coords.longitude,
        speedKmh: pos.coords.speed == null ? null : Math.max(0, pos.coords.speed * 3.6),
        accuracy: pos.coords.accuracy,
        recordedAt: new Date(pos.timestamp).toISOString()
      }),
      err => onError(new Error(err.message)),
      { enableHighAccuracy: true, maximumAge: 1000, timeout: 15000 }
    );
  },
  startDemo(onPoint) {
    this.demoIndex = 0;
    const emit = () => {
      const p = this.demoRoute[this.demoIndex % this.demoRoute.length];
      const speed = [28, 32, 35, 31, 38, 42, 36, 33, 29, 34, 39, 30][this.demoIndex % 12];
      onPoint({ latitude: p[0], longitude: p[1], speedKmh: speed, accuracy: 5, recordedAt: new Date().toISOString() });
      this.demoIndex++;
    };
    emit();
    this.demoTimer = setInterval(emit, 2500);
  },
  stop() {
    if (this.watchId !== null) navigator.geolocation.clearWatch(this.watchId);
    if (this.demoTimer) clearInterval(this.demoTimer);
    this.watchId = null;
    this.demoTimer = null;
  }
};