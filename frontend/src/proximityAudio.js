// Proximity audio for ProxiSpeak.
//
// - Opens a WebRTC audio connection with every user who is within earshot
//   (the server only relays signaling between users within 100 px).
// - Volume follows the distance, left/right balance follows the position, and
//   users behind a sound-blocking obstacle are much quieter.

const EARSHOT_RADIUS = 100; // must match PROXIMITY_RADIUS_PX on the server
const BLOCKED_VOLUME = 0.15; // volume factor behind a sound-blocking obstacle
const CLOSE_DELAY_MS = 1500; // keep a connection a little after leaving earshot
const OFFER_RETRY_MS = 3000; // re-send the offer until the other side answers
const ICE_SERVERS = [{ urls: "stun:stun.l.google.com:19302" }];

// Volume (0..1) and stereo pan (-1 left .. 1 right) for another avatar.
export function computeAudioParams(me, other, blocked = false) {
  const dx = other.x - me.x;
  const dy = other.y - me.y;
  const distance = Math.hypot(dx, dy);

  let gain = Math.max(0, 1 - distance / EARSHOT_RADIUS);
  if (blocked) gain *= BLOCKED_VOLUME;

  const pan = Math.max(-1, Math.min(1, dx / EARSHOT_RADIUS));

  return { gain, pan, distance };
}

// getMe() -> {x, y}; getOther(userId) -> {x, y} or null.
export function createProximityAudio({ socket, getMe, getOther }) {
  const peers = new Map(); // userId -> peer state
  const nearby = new Map(); // userId -> blocked (boolean)

  let localStream = null;
  let audioContext = null;
  let animationId = null;

  function sendOffer(userId, peer) {
    const { pc } = peer;

    return pc
      .createOffer()
      .then((offer) => pc.setLocalDescription(offer))
      .then(() => {
        socket.emit("webrtc-offer", {
          targetUserId: userId,
          offer: pc.localDescription,
        });
      })
      .catch((error) => console.error("Could not create offer:", error));
  }

  function attachRemoteStream(peer, stream) {
    // Chrome only delivers a remote stream to Web Audio if it is also attached
    // to a (muted) media element.
    peer.element = new Audio();
    peer.element.srcObject = stream;
    peer.element.muted = true;
    peer.element.play().catch(() => {});

    peer.source = audioContext.createMediaStreamSource(stream);
    peer.gain = audioContext.createGain();
    peer.gain.gain.value = 0;
    peer.source.connect(peer.gain);

    if (audioContext.createStereoPanner) {
      peer.pan = audioContext.createStereoPanner();
      peer.gain.connect(peer.pan);
      peer.pan.connect(audioContext.destination);
    } else {
      peer.gain.connect(audioContext.destination);
    }
  }

  function ensurePeer(userId) {
    if (peers.has(userId)) return peers.get(userId);

    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    const peer = {
      pc,
      answered: false,
      lastOfferSdp: null,
      pendingCandidates: [],
      closeTimer: null,
      retryTimer: null,
    };

    localStream.getTracks().forEach((track) => pc.addTrack(track, localStream));

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        socket.emit("webrtc-ice-candidate", {
          targetUserId: userId,
          candidate: event.candidate,
        });
      }
    };

    pc.ontrack = (event) => {
      if (!peer.source && event.streams[0]) {
        attachRemoteStream(peer, event.streams[0]);
      }
    };

    peers.set(userId, peer);
    return peer;
  }

  function closePeer(userId) {
    const peer = peers.get(userId);
    if (!peer) return;

    clearTimeout(peer.closeTimer);
    clearInterval(peer.retryTimer);

    try {
      peer.pc.close();
    } catch {
      // already closed
    }

    if (peer.element) {
      peer.element.pause();
      peer.element.srcObject = null;
    }
    peer.source?.disconnect();
    peer.gain?.disconnect();
    peer.pan?.disconnect();

    peers.delete(userId);
  }

  // Called with the server's nearbyAvatars list: [{ userId, distance, blocked }].
  function handleNearby(list) {
    if (!localStream || !Array.isArray(list)) return;

    const present = new Set();

    list.forEach((item) => {
      if (!item || typeof item.userId !== "string") return;

      present.add(item.userId);
      nearby.set(item.userId, item.blocked === true);

      const peer = ensurePeer(item.userId);
      clearTimeout(peer.closeTimer);
      peer.closeTimer = null;

      // The user with the smaller id makes the offer (no collisions). The offer
      // is repeated until the other side answers, because the other user may
      // turn the microphone on later.
      if (socket.id < item.userId && !peer.retryTimer) {
        sendOffer(item.userId, peer);
        peer.retryTimer = setInterval(() => {
          if (peer.answered || !peers.has(item.userId)) {
            clearInterval(peer.retryTimer);
            return;
          }
          sendOffer(item.userId, peer);
        }, OFFER_RETRY_MS);
      }
    });

    // Users who left earshot: close their connection after a short delay.
    peers.forEach((peer, userId) => {
      if (present.has(userId) || peer.closeTimer) return;

      nearby.delete(userId);
      peer.closeTimer = setTimeout(() => closePeer(userId), CLOSE_DELAY_MS);
    });
  }

  async function handleOffer({ senderUserId, offer } = {}) {
    if (!localStream || !senderUserId || !offer) return; // microphone is off

    const peer = ensurePeer(senderUserId);
    if (peer.lastOfferSdp === offer.sdp) return; // repeated offer
    peer.lastOfferSdp = offer.sdp;

    try {
      await peer.pc.setRemoteDescription(offer);
      await flushCandidates(peer);

      const answer = await peer.pc.createAnswer();
      await peer.pc.setLocalDescription(answer);

      socket.emit("webrtc-answer", {
        targetUserId: senderUserId,
        answer: peer.pc.localDescription,
      });
    } catch (error) {
      console.error("Could not answer offer:", error);
    }
  }

  async function handleAnswer({ senderUserId, answer } = {}) {
    const peer = peers.get(senderUserId);
    if (!peer || !answer || peer.pc.signalingState !== "have-local-offer") return;

    try {
      await peer.pc.setRemoteDescription(answer);
      peer.answered = true;
      clearInterval(peer.retryTimer);
      await flushCandidates(peer);
    } catch (error) {
      console.error("Could not apply answer:", error);
    }
  }

  async function handleCandidate({ senderUserId, candidate } = {}) {
    const peer = peers.get(senderUserId);
    if (!peer || !candidate) return;

    if (peer.pc.remoteDescription) {
      try {
        await peer.pc.addIceCandidate(candidate);
      } catch (error) {
        console.error("Could not add ICE candidate:", error);
      }
    } else {
      peer.pendingCandidates.push(candidate);
    }
  }

  async function flushCandidates(peer) {
    while (peer.pendingCandidates.length) {
      try {
        await peer.pc.addIceCandidate(peer.pendingCandidates.shift());
      } catch (error) {
        console.error("Could not add ICE candidate:", error);
      }
    }
  }

  // Update volume and balance of every connected user, once per frame.
  function updateVolumes() {
    const me = getMe();

    peers.forEach((peer, userId) => {
      if (!peer.gain) return;

      const other = getOther(userId);
      if (!other) return;

      const { gain, pan } = computeAudioParams(me, other, nearby.get(userId));
      const now = audioContext.currentTime;

      peer.gain.gain.setTargetAtTime(gain, now, 0.05);
      peer.pan?.pan.setTargetAtTime(pan, now, 0.05);
    });

    animationId = requestAnimationFrame(updateVolumes);
  }

  async function start() {
    localStream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true },
    });

    audioContext = new (window.AudioContext || window.webkitAudioContext)();
    await audioContext.resume();

    animationId = requestAnimationFrame(updateVolumes);
  }

  function stop() {
    cancelAnimationFrame(animationId);

    Array.from(peers.keys()).forEach(closePeer);
    nearby.clear();

    localStream?.getTracks().forEach((track) => track.stop());
    localStream = null;

    audioContext?.close();
    audioContext = null;
  }

  function setMuted(muted) {
    localStream?.getAudioTracks().forEach((track) => {
      track.enabled = !muted;
    });
  }

  return {
    start,
    stop,
    setMuted,
    handleNearby,
    handleOffer,
    handleAnswer,
    handleCandidate,
    removeUser: closePeer,
  };
}