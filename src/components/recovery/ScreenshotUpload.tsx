"use client";

import { useState, useRef } from "react";
import NextImage from "next/image";

export function ScreenshotUpload({ label, source, currentUrl, onUpload, onClear, onMetricsExtracted }: {
  label: string;
  source: "eightSleep" | "oura";
  currentUrl?: string;
  onUpload: (dataUrl: string) => void;
  onClear: () => void;
  onMetricsExtracted: (metrics: Record<string, unknown>) => void;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);

  const scanImage = async (dataUrl: string) => {
    setScanning(true);
    setScanError(null);
    try {
      const res = await fetch("/api/extract-metrics", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Requested-With": "fetch" },
        body: JSON.stringify({ imageDataUrl: dataUrl, source }),
      });
      const data = await res.json();
      if (res.ok && data.metrics) {
        onMetricsExtracted(data.metrics);
      } else {
        const err = data.error || "Could not extract metrics";
        // Show user-friendly messages for known errors
        if (err.includes("credit balance")) {
          setScanError("API credits needed - enter metrics manually below");
        } else if (err.includes("not configured")) {
          setScanError("AI scanning not configured - enter metrics manually");
        } else {
          setScanError(err);
        }
      }
    } catch {
      setScanError("Failed to connect to scanning service");
    }
    setScanning(false);
  };

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      alert("Image must be under 5MB");
      return;
    }
    const reader = new FileReader();
    reader.onload = (ev) => {
      const result = ev.target?.result as string;
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        const maxW = 800;
        const scale = Math.min(1, maxW / img.width);
        canvas.width = img.width * scale;
        canvas.height = img.height * scale;
        const ctx = canvas.getContext("2d");
        if (ctx) {
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          const compressed = canvas.toDataURL("image/jpeg", 0.8);
          onUpload(compressed);
          // Auto-scan the uploaded image
          scanImage(compressed);
        }
      };
      img.src = result;
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  };

  return (
    <div aria-busy={scanning}>
      <p className="text-xs font-semibold tracking-wide mb-2" style={{ color: "var(--text-muted)" }}>
        {label} Screenshot
      </p>
      {currentUrl ? (
        <div className="relative">
          {scanning && (
            <div className="absolute inset-0 z-10 flex items-center justify-center rounded-xl"
              role="status" aria-label="Scanning image"
              style={{ background: "rgba(0,0,0,0.6)" }}>
              <div className="text-center text-white">
                <div className="animate-spin w-6 h-6 border-2 border-white border-t-transparent rounded-full mx-auto mb-2" />
                <p className="text-xs font-medium">Scanning metrics with AI...</p>
              </div>
            </div>
          )}
          <button onClick={() => setPreviewOpen(!previewOpen)}
            className="w-full rounded-xl overflow-hidden border transition-all hover:opacity-90"
            style={{ borderColor: "var(--border)" }}>
            <NextImage src={currentUrl} alt={label} width={800} height={450} unoptimized className="w-full h-auto" style={{ maxHeight: previewOpen ? "none" : "120px", objectFit: "cover" }} />
          </button>
          <div className="flex gap-2 mt-2">
            <button onClick={() => fileInputRef.current?.click()}
              className="flex-1 text-xs py-2 rounded-lg border font-medium transition-all hover:opacity-80 inline-touch"
              style={{ borderColor: "var(--border)", color: "var(--text-secondary)" }}>
              Replace
            </button>
            <button onClick={() => scanImage(currentUrl)}
              disabled={scanning}
              className="flex-1 text-xs py-2 rounded-lg border font-medium transition-all hover:opacity-80 disabled:opacity-50 inline-touch"
              style={{ borderColor: "var(--border)", color: "var(--text-secondary)" }}>
              {scanning ? "Scanning..." : "Re-scan"}
            </button>
            <button onClick={onClear}
              className="text-xs py-2 px-3 rounded-lg font-medium text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-all inline-touch">
              Remove
            </button>
          </div>
          {scanError && (
            <p className="text-xs text-red-500 mt-2">{scanError}</p>
          )}
        </div>
      ) : (
        <button onClick={() => fileInputRef.current?.click()}
          className="w-full py-6 rounded-xl border-2 border-dashed flex flex-col items-center gap-2 transition-all hover:opacity-80"
          style={{ borderColor: "var(--border)", color: "var(--text-muted)" }}>
          <span className="text-2xl">📸</span>
          <span className="text-sm font-medium">Tap to upload screenshot</span>
          <span className="text-xs">AI auto-scans metrics from your {label} app</span>
        </button>
      )}
      <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleFile} />
    </div>
  );
}
