import { useCallback, useEffect, useRef, useState } from "react";

export type MobileScreenObservation = {
  timestamp: number;
  imageBase64: string;
};

const DEFAULT_FREQUENCY_SECONDS = 15;
const MAX_OBSERVATIONS = 20;

export function useMobileScreenShare(
  onObservation?: (observation: MobileScreenObservation) => void,
  frequencySeconds = DEFAULT_FREQUENCY_SECONDS,
) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [isSharing, setIsSharing] = useState(false);
  const [isSupported, setIsSupported] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [observations, setObservations] = useState<MobileScreenObservation[]>([]);
  const [secondsUntilNextFrame, setSecondsUntilNextFrame] = useState(frequencySeconds);
  const lastCaptureRef = useRef<number | null>(null);

  const captureFrame = useCallback((quality = 0.7): string | null => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || video.videoWidth === 0 || video.videoHeight === 0) return null;

    const maxDimension = 1920;
    const scale = Math.min(1, maxDimension / Math.max(video.videoWidth, video.videoHeight));
    canvas.width = Math.max(1, Math.round(video.videoWidth * scale));
    canvas.height = Math.max(1, Math.round(video.videoHeight * scale));

    const context = canvas.getContext("2d");
    if (!context) return null;
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/jpeg", quality);
  }, []);

  const captureObservation = useCallback(() => {
    const imageBase64 = captureFrame();
    if (!imageBase64) return null;

    const observation = { timestamp: Date.now(), imageBase64 };
    lastCaptureRef.current = observation.timestamp;
    setObservations((current) => [...current, observation].slice(-MAX_OBSERVATIONS));
    onObservation?.(observation);
    return observation;
  }, [captureFrame, onObservation]);

  const clearObservations = useCallback(() => {
    setObservations([]);
    lastCaptureRef.current = null;
    setSecondsUntilNextFrame(frequencySeconds);
  }, [frequencySeconds]);

  const stopSharing = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setIsSharing(false);
    lastCaptureRef.current = null;
    setSecondsUntilNextFrame(frequencySeconds);
  }, [frequencySeconds]);

  const startSharing = useCallback(async () => {
    setError(null);

    if (!navigator.mediaDevices?.getDisplayMedia) {
      setIsSupported(false);
      setError("Screen sharing is not supported by this browser.");
      return false;
    }

    try {
      // Keep the options to the widely-supported MediaTrackConstraints that
      // TypeScript and mobile browsers understand. The browser's native picker
      // controls whether the user shares a tab, window, or entire screen.
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: { frameRate: { ideal: 1, max: 5 } },
        audio: false,
      });

      streamRef.current = stream;
      const video = videoRef.current;
      if (!video) {
        stream.getTracks().forEach((track) => track.stop());
        throw new Error("Screen preview is not available.");
      }

      video.srcObject = stream;
      video.muted = true;
      await video.play();
      setIsSharing(true);

      const videoTrack = stream.getVideoTracks()[0];
      videoTrack?.addEventListener("ended", stopSharing, { once: true });
      return true;
    } catch (cause) {
      const message = cause instanceof DOMException && cause.name === "NotAllowedError"
        ? "Screen sharing was cancelled."
        : cause instanceof Error
          ? cause.message
          : "Unable to start screen sharing.";
      setError(message);
      setIsSharing(false);
      return false;
    }
  }, [stopSharing]);

  useEffect(() => {
    if (!isSharing) return;

    const timer = window.setInterval(() => {
      const last = lastCaptureRef.current;
      const elapsed = last ? (Date.now() - last) / 1000 : frequencySeconds;
      setSecondsUntilNextFrame(Math.max(0, frequencySeconds - elapsed));
      if (!last || elapsed >= frequencySeconds) captureObservation();
    }, 250);

    return () => window.clearInterval(timer);
  }, [captureObservation, frequencySeconds, isSharing]);

  useEffect(() => () => stopSharing(), [stopSharing]);

  return {
    videoRef,
    canvasRef,
    observations,
    isSharing,
    isSupported,
    error,
    secondsUntilNextFrame,
    startSharing,
    stopSharing,
    captureObservation,
    clearObservations,
    maxObservations: MAX_OBSERVATIONS,
  };
}