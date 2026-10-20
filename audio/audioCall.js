import {
  createPeerConnection,
  createOffer,
  handleOffer,
  handleAnswer,
  handleIceCandidate,
} from "./audioConnection.js";

export function setupAudioCall(localStream, socket) {
  const peerConnections = new Map();

  async function callUser(targetUserId) {
    if (!localStream || !targetUserId) return;

    const peerConnection = createPeerConnection(
      localStream,
      socket,
      targetUserId
    );

    peerConnections.set(targetUserId, peerConnection);

    try {
      await createOffer(peerConnection, socket, targetUserId);
    } catch (error) {
      console.error("Could not start audio call:", error);
    }
  }

  async function onOffer({ senderUserId, offer }) {
    try {
      let peerConnection = peerConnections.get(senderUserId);

      if (!peerConnection) {
        peerConnection = createPeerConnection(
          localStream,
          socket,
          senderUserId
        );

        peerConnections.set(senderUserId, peerConnection);
      }

      await handleOffer(
        peerConnection,
        socket,
        senderUserId,
        offer
      );
    } catch (error) {
      console.error("Could not handle WebRTC offer:", error);
    }
  }

  async function onAnswer({ senderUserId, answer }) {
    const peerConnection = peerConnections.get(senderUserId);

    if (!peerConnection) return;

    try {
      await handleAnswer(peerConnection, answer);
    } catch (error) {
      console.error("Could not handle WebRTC answer:", error);
    }
  }

  async function onIceCandidate({ senderUserId, candidate }) {
    const peerConnection = peerConnections.get(senderUserId);

    if (!peerConnection || !candidate) return;

    try {
      await handleIceCandidate(peerConnection, candidate);
    } catch (error) {
      console.error("Could not add ICE candidate:", error);
    }
  }

  socket.on("webrtc-offer", onOffer);
  socket.on("webrtc-answer", onAnswer);
  socket.on("webrtc-ice-candidate", onIceCandidate);

  return {
    callUser,
    peerConnections,

    cleanup() {
      socket.off("webrtc-offer", onOffer);
      socket.off("webrtc-answer", onAnswer);
      socket.off("webrtc-ice-candidate", onIceCandidate);

      peerConnections.forEach((peerConnection) => {
        peerConnection.close();
      });

      peerConnections.clear();
    },
  };
}