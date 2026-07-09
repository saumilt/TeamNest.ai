import { useCallback, useEffect, useRef, useState } from "react";
import { Camera, X, RefreshCw, Check, ImagePlus } from "lucide-react";

/**
 * CameraCapture — in-browser webcam capture (works on desktop where a native
 * `capture` file input only opens a file dialog). Requests the camera via
 * getUserMedia, shows a live preview, captures a JPEG, and returns it as a File
 * through `onCapture`. Falls back to `onFallback` (a normal file/photo picker)
 * when no camera is available or permission is denied.
 */
export default function CameraCapture({ open, onClose, onCapture, onFallback }) {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const [status, setStatus] = useState("idle"); // idle | loading | live | denied | error
  const [shot, setShot] = useState(null); // { url, blob }

  const stop = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
  }, []);

  const start = useCallback(async () => {
    setShot(null);
    setStatus("loading");
    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        setStatus("error");
        return;
      }
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment" },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => {});
      }
      setStatus("live");
    } catch (e) {
      setStatus(e?.name === "NotAllowedError" ? "denied" : "error");
    }
  }, []);

  useEffect(() => {
    if (open) start();
    return () => stop();
  }, [open, start, stop]);

  const capture = () => {
    const video = videoRef.current;
    if (!video) return;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth || 1280;
    canvas.height = video.videoHeight || 720;
    canvas.getContext("2d").drawImage(video, 0, 0, canvas.width, canvas.height);
    canvas.toBlob(
      (blob) => {
        if (!blob) return;
        setShot({ url: URL.createObjectURL(blob), blob });
        stop();
      },
      "image/jpeg",
      0.9,
    );
  };

  const retake = () => {
    if (shot?.url) URL.revokeObjectURL(shot.url);
    start();
  };

  const usePhoto = () => {
    if (!shot?.blob) return;
    const file = new File([shot.blob], `photo-${Date.now()}.jpg`, { type: "image/jpeg" });
    onCapture(file);
    close();
  };

  const close = () => {
    stop();
    if (shot?.url) URL.revokeObjectURL(shot.url);
    setShot(null);
    setStatus("idle");
    onClose();
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm"
      data-testid="camera-capture"
    >
      <div className="w-full max-w-lg rounded-2xl bg-surface ring-1 ring-hairline overflow-hidden">
        <div className="flex items-center gap-2.5 px-4 py-3 border-b border-hairline">
          <Camera className="w-4.5 h-4.5 text-brand" style={{ width: 18, height: 18 }} />
          <div className="text-[14px] font-semibold text-ink flex-1">Take a photo</div>
          <button
            type="button"
            onClick={close}
            data-testid="camera-close"
            className="p-1.5 rounded-full text-ink-mute hover:text-ink hover:bg-surface-2"
          >
            <X style={{ width: 18, height: 18 }} />
          </button>
        </div>

        <div className="relative bg-black aspect-[4/3] flex items-center justify-center">
          {!shot && (
            <video
              ref={videoRef}
              playsInline
              muted
              data-testid="camera-video"
              className="w-full h-full object-cover"
            />
          )}
          {shot && (
            <img src={shot.url} alt="Captured" className="w-full h-full object-cover" data-testid="camera-preview" />
          )}

          {status === "loading" && (
            <div className="absolute inset-0 flex items-center justify-center text-white/80 text-[13px]">
              Starting camera…
            </div>
          )}

          {(status === "denied" || status === "error") && !shot && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-6 text-center">
              <div className="text-[13px] text-white/85">
                {status === "denied"
                  ? "Camera access was blocked. Allow it in your browser's address bar, or upload a photo instead."
                  : "No camera available on this device. Upload a photo instead."}
              </div>
              <button
                type="button"
                data-testid="camera-fallback"
                onClick={() => {
                  close();
                  onFallback?.();
                }}
                className="inline-flex items-center gap-2 h-10 px-4 rounded-pill bg-brand text-black font-semibold text-[13px] active:scale-95"
              >
                <ImagePlus className="w-4 h-4" />
                Upload a photo
              </button>
            </div>
          )}
        </div>

        <div className="px-4 py-3 border-t border-hairline flex items-center justify-center gap-3">
          {!shot && status === "live" && (
            <button
              type="button"
              data-testid="camera-shutter"
              onClick={capture}
              aria-label="Capture photo"
              className="w-14 h-14 rounded-full bg-brand text-black flex items-center justify-center ring-4 ring-brand/25 hover:bg-brand-deep active:scale-95"
            >
              <Camera className="w-6 h-6" />
            </button>
          )}
          {shot && (
            <>
              <button
                type="button"
                data-testid="camera-retake"
                onClick={retake}
                className="inline-flex items-center gap-2 h-10 px-4 rounded-pill bg-surface-2 text-ink hover:bg-surface-3 text-[13px] font-medium active:scale-95"
              >
                <RefreshCw className="w-4 h-4" />
                Retake
              </button>
              <button
                type="button"
                data-testid="camera-use"
                onClick={usePhoto}
                className="inline-flex items-center gap-2 h-10 px-5 rounded-pill bg-brand text-black font-semibold text-[13px] active:scale-95"
              >
                <Check className="w-4 h-4" />
                Use photo
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
