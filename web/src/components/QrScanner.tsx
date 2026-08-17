import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import jsQR from "jsqr";
import { X, CameraOff } from "lucide-react";
import { parsePairingUrl, type Connection } from "../lib/api";

/** Decoding a full 1080p frame every tick is wasted work; this is plenty. */
const DECODE_WIDTH = 480;

/**
 * Camera viewfinder that watches for the agent's pairing QR.
 *
 * This exists for the installed app. In a phone's browser you never need it —
 * the camera app opens the link itself — but the app is a bundle served from
 * localhost, so a link cannot reach it and the scan has to happen in here.
 *
 * That difference also decides where it works: `getUserMedia` is only exposed
 * on a secure origin. Capacitor's `http://localhost` counts as one, whereas
 * this same page loaded from the agent over plain HTTP does not, and the API
 * is simply absent there. Hence the explicit unsupported state rather than a
 * camera that silently never starts.
 */
export function QrScanner({
  onResult,
  onClose,
}: {
  onResult: (connection: Connection) => void;
  onClose: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);

  // Held in a ref so the decode loop can stop itself the moment it finds a
  // code, without waiting for a re-render to tear the stream down.
  const doneRef = useRef(false);
  const onResultRef = useRef(onResult);
  onResultRef.current = onResult;

  useEffect(() => {
    let stream: MediaStream | null = null;
    let frame = 0;
    doneRef.current = false;

    const stop = () => {
      cancelAnimationFrame(frame);
      for (const track of stream?.getTracks() ?? []) track.stop();
    };

    const decode = () => {
      frame = requestAnimationFrame(decode);
      if (doneRef.current) return;

      const video = videoRef.current;
      const canvas = canvasRef.current;
      if (!video || !canvas || video.readyState < video.HAVE_CURRENT_DATA) return;
      if (!video.videoWidth || !video.videoHeight) return;

      const scale = Math.min(1, DECODE_WIDTH / video.videoWidth);
      const width = Math.round(video.videoWidth * scale);
      const height = Math.round(video.videoHeight * scale);
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
      }

      const context = canvas.getContext("2d", { willReadFrequently: true });
      if (!context) return;
      context.drawImage(video, 0, 0, width, height);

      const found = jsQR(context.getImageData(0, 0, width, height).data, width, height, {
        inversionAttempts: "dontInvert",
      });
      if (!found) return;

      const connection = parsePairingUrl(found.data);
      if (!connection) {
        // Some other QR wandered into frame. Say so, but keep looking.
        setError("That is not a LoL Remote code — scan the one in the agent window.");
        return;
      }

      doneRef.current = true;
      stop();
      onResultRef.current(connection);
    };

    void (async () => {
      if (!navigator.mediaDevices?.getUserMedia) {
        setError(
          "This browser will not open the camera over a plain HTTP address. " +
            "Point your phone's camera at the QR code instead — it opens the remote directly.",
        );
        return;
      }
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" } },
        });
        if (doneRef.current) {
          stop();
          return;
        }
        const video = videoRef.current;
        if (video) {
          video.srcObject = stream;
          await video.play();
        }
        setScanning(true);
        frame = requestAnimationFrame(decode);
      } catch (cause) {
        const name = (cause as { name?: string }).name;
        setError(
          name === "NotAllowedError"
            ? "Camera permission was denied. Allow it in your phone's settings, or type the address in."
            : "Could not open the camera on this device.",
        );
      }
    })();

    return () => {
      doneRef.current = true;
      stop();
    };
  }, []);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 bg-black flex flex-col"
    >
      <video
        ref={videoRef}
        playsInline
        muted
        className="absolute inset-0 h-full w-full object-cover"
      />
      <canvas ref={canvasRef} className="hidden" />

      <div className="relative z-10 flex-1 flex flex-col items-center justify-center px-8">
        {scanning ? (
          <Reticle />
        ) : (
          !error && <p className="text-ink-dim text-sm">Opening the camera…</p>
        )}
      </div>

      <div className="relative z-10 px-8 pb-10 space-y-4">
        {error ? (
          <div className="glass rounded-2xl p-4 flex gap-3">
            <CameraOff className="h-4 w-4 shrink-0 text-danger mt-0.5" />
            <p className="text-ink-muted text-xs leading-relaxed">{error}</p>
          </div>
        ) : (
          <p className="text-center text-ink-muted text-sm">
            Point at the QR code in the agent window on your PC.
          </p>
        )}

        <button
          type="button"
          onClick={onClose}
          className="mx-auto flex items-center gap-2 rounded-full glass px-5 py-2.5 text-sm font-semibold text-ink"
        >
          <X className="h-4 w-4" />
          Cancel
        </button>
      </div>
    </motion.div>
  );
}

function Reticle() {
  return (
    <div className="relative h-60 w-60">
      {[
        "top-0 left-0 border-l-2 border-t-2 rounded-tl-2xl",
        "top-0 right-0 border-r-2 border-t-2 rounded-tr-2xl",
        "bottom-0 left-0 border-l-2 border-b-2 rounded-bl-2xl",
        "bottom-0 right-0 border-r-2 border-b-2 rounded-br-2xl",
      ].map((corner) => (
        <span key={corner} className={`absolute h-10 w-10 border-hextech ${corner}`} />
      ))}
      <motion.span
        animate={{ top: ["8%", "92%", "8%"] }}
        transition={{ duration: 2.6, repeat: Infinity, ease: "easeInOut" }}
        className="absolute left-3 right-3 h-px bg-hextech shadow-[0_0_12px_rgba(10,200,185,0.9)]"
      />
    </div>
  );
}
