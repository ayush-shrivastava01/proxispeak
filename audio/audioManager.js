export async function getMicrophoneStream() {
  try {
    const stream =
      await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: false,
      });

    console.log("Microphone connected successfully");

    return stream;
  } catch (error) {
    console.error("Microphone access failed:", error);
    throw error;
  }
}
export function checkMicrophoneSupport() {
  return !!(
    navigator.mediaDevices &&
    navigator.mediaDevices.getUserMedia
  );
}