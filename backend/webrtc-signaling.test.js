const { test } = require("node:test");
const assert = require("node:assert/strict");
const { io: createClient } = require("socket.io-client");
const { spawn } = require("node:child_process");
const path = require("node:path");

const TEST_PORT = 5101;
const TEST_URL = `http://127.0.0.1:${TEST_PORT}`;

function waitForEvent(socket, eventName, timeout = 5000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.off(eventName, handler);
      reject(new Error(`Timed out waiting for ${eventName}`));
    }, timeout);

    function handler(payload) {
      clearTimeout(timer);
      resolve(payload);
    }

    socket.once(eventName, handler);
  });
}

test(
  "WebRTC signaling forwards offer, answer, and ICE candidate",
  async () => {
    const serverPath = path.join(__dirname, "server.js");

    const child = spawn(process.execPath, [serverPath], {
            env: {
        ...process.env,
        PORT: String(TEST_PORT),
        MONGODB_URI: "",
      },
      
      stdio: ["ignore", "pipe", "pipe"],
    });

    let clientA;
    let clientB;
    let startupOutput = "";

    try {
      await new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          reject(
            new Error(
              `Server startup timed out. Output: ${startupOutput}`
            )
          );
        }, 5000);

        child.stdout.on("data", (chunk) => {
          startupOutput += chunk.toString();

          if (startupOutput.includes(`port ${TEST_PORT}`)) {
            clearTimeout(timer);
            resolve();
          }
        });

        child.stderr.on("data", (chunk) => {
          startupOutput += chunk.toString();
        });

        child.once("error", (error) => {
          clearTimeout(timer);
          reject(error);
        });

        child.once("exit", (code) => {
          clearTimeout(timer);
          reject(
            new Error(
              `Test server exited early with code ${code}. ${startupOutput}`
            )
          );
        });
      });

      clientA = createClient(TEST_URL, {
        autoConnect: false,
        transports: ["websocket"],
        reconnection: false,
      });

      clientB = createClient(TEST_URL, {
        autoConnect: false,
        transports: ["websocket"],
        reconnection: false,
      });

      const connectedA = waitForEvent(clientA, "connect");
      const connectedB = waitForEvent(clientB, "connect");

      clientA.connect();
      clientB.connect();

      await Promise.all([connectedA, connectedB]);

      // Test 1: Offer from A to B
      const offer = {
        type: "offer",
        sdp: "test-offer-sdp",
      };

      const receivedOffer = waitForEvent(
        clientB,
        "webrtc-offer"
      );

      clientA.emit("webrtc-offer", {
        targetUserId: clientB.id,
        offer,
      });

      const offerPayload = await receivedOffer;

      assert.equal(offerPayload.senderUserId, clientA.id);
      assert.deepEqual(offerPayload.offer, offer);

      // Test 2: Answer from B to A
      const answer = {
        type: "answer",
        sdp: "test-answer-sdp",
      };

      const receivedAnswer = waitForEvent(
        clientA,
        "webrtc-answer"
      );

      clientB.emit("webrtc-answer", {
        targetUserId: clientA.id,
        answer,
      });

      const answerPayload = await receivedAnswer;

      assert.equal(answerPayload.senderUserId, clientB.id);
      assert.deepEqual(answerPayload.answer, answer);

      // Test 3: ICE candidate from A to B
      const candidate = {
        candidate: "test-ice-candidate",
        sdpMid: "0",
        sdpMLineIndex: 0,
      };

      const receivedCandidate = waitForEvent(
        clientB,
        "webrtc-ice-candidate"
      );

      clientA.emit("webrtc-ice-candidate", {
        targetUserId: clientB.id,
        candidate,
      });

      const candidatePayload = await receivedCandidate;

      assert.equal(candidatePayload.senderUserId, clientA.id);
      assert.deepEqual(candidatePayload.candidate, candidate);

      console.log("Offer, answer, and ICE candidate tests passed.");
    } finally {
      clientA?.disconnect();
      clientB?.disconnect();

      if (child.exitCode === null && child.signalCode === null) {
        child.kill();
      }
    }
  }
);