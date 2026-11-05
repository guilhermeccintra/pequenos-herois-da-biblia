// Keep a full-story recording in place when navigating, but never carry its
// playback position (or autoplay) over to a different part's recording.
export function captureReaderAudio(audio) {
  if (!audio) return null;
  const snapshot = {
    key: audio.dataset.audioKey,
    time: audio.currentTime,
    paused: audio.paused,
    rate: audio.playbackRate,
  };
  audio.pause();
  return snapshot;
}

export function restoreReaderAudio(audio, snapshot, speedControl) {
  if (!audio || !snapshot) return;
  audio.playbackRate = snapshot.rate;
  if (speedControl) speedControl.value = String(snapshot.rate);
  if (!snapshot.key || audio.dataset.audioKey !== snapshot.key) return;
  if (snapshot.time === 0 && snapshot.paused) return;
  const restore = () => {
    if (Number.isFinite(snapshot.time)) {
      audio.currentTime = Number.isFinite(audio.duration)
        ? Math.min(snapshot.time, audio.duration)
        : snapshot.time;
    }
    if (!snapshot.paused) audio.play().catch(() => {});
  };
  if (audio.readyState >= 1) restore();
  else audio.addEventListener("loadedmetadata", restore, { once: true });
}
