export function createPeerConnection(localStream, socket, targetUserId) {
  const peerConnection = new RTCPeerConnection({
    iceServers: [
      {
        urls: "stun:stun.l.google.com:19302",
      },
    ],
  });

  // Add microphone audio tracks
  if (localStream) {
    localStream.getAudioTracks().forEach((track) => {
      peerConnection.addTrack(track, localStream);
    });
  }

  // Send ICE candidates to the other user
  peerConnection.onicecandidate = (event) => {
    if (event.candidate && targetUserId) {
      socket.emit("webrtc-ice-candidate", {
        targetUserId,
        candidate: event.candidate,
      });
    }
  };

  // Receive remote audio
  peerConnection.ontrack = (event) => {
    let remoteAudio = document.getElementById("remoteAudio");

    if (!remoteAudio) {
      remoteAudio = document.createElement("audio");
      remoteAudio.id = "remoteAudio";
      remoteAudio.autoplay = true;
      document.body.appendChild(remoteAudio);
    }

    remoteAudio.srcObject = event.streams[0];

    remoteAudio.play().catch((error) => {
      console.log("Audio playback needs user interaction:", error);
    });
  };

  peerConnection.onconnectionstatechange = () => {
    console.log("WebRTC connection state:", peerConnection.connectionState);
  };

  return peerConnection;
}

// Create and send an offer
export async function createOffer(peerConnection, socket, targetUserId) {
  const offer = await peerConnection.createOffer();

  await peerConnection.setLocalDescription(offer);

  socket.emit("webrtc-offer", {
    targetUserId,
    offer,
  });
}

// Receive and answer an offer
export async function handleOffer(
  peerConnection,
  socket,
  senderUserId,
  offer
) {
  await peerConnection.setRemoteDescription(
    new RTCSessionDescription(offer)
  );

  const answer = await peerConnection.createAnswer();

  await peerConnection.setLocalDescription(answer);

  socket.emit("webrtc-answer", {
    targetUserId: senderUserId,
    answer,
  });
}

// Receive an answer
export async function handleAnswer(peerConnection, answer) {
  await peerConnection.setRemoteDescription(
    new RTCSessionDescription(answer)
  );
}

// Receive an ICE candidate
export async function handleIceCandidate(peerConnection, candidate) {
  if (!candidate) return;

  await peerConnection.addIceCandidate(
    new RTCIceCandidate(candidate)
  );
}