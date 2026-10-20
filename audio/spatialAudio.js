export function createProximityAudio(remoteStream) {
  const audioContext = new AudioContext();

  const source =
    audioContext.createMediaStreamSource(remoteStream);

  const gainNode = audioContext.createGain();
  const pannerNode = audioContext.createStereoPanner();

  source.connect(gainNode);
  gainNode.connect(pannerNode);
  pannerNode.connect(audioContext.destination);

  return {
    audioContext,
    gainNode,
    pannerNode,
  };
}

export function updateProximityAudio(
  audio,
  distance,
  relativeX,
  maxDistance = 500
) {
  if (!audio || maxDistance <= 0 || distance < 0) {
    return;
  }

  const volume = Math.max(
    0,
    Math.min(1, 1 - distance / maxDistance)
  );

  const pan = Math.max(
    -1,
    Math.min(1, relativeX / maxDistance)
  );

  const now = audio.audioContext.currentTime;

  audio.gainNode.gain.setTargetAtTime(
    volume,
    now,
    0.05
  );

  audio.pannerNode.pan.setTargetAtTime(
    pan,
    now,
    0.05
  );
}