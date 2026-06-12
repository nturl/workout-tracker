"use client";

import { createContext, useContext, useState, useCallback, useRef } from "react";

const AnnounceContext = createContext<(message: string) => void>(() => {});

export function useAnnounce() {
  return useContext(AnnounceContext);
}

export function LiveRegionProvider({ children }: { children: React.ReactNode }) {
  const [message, setMessage] = useState("");
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const announce = useCallback((msg: string) => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    setMessage(msg);
    timeoutRef.current = setTimeout(() => setMessage(""), 1500);
  }, []);

  return (
    <AnnounceContext.Provider value={announce}>
      {children}
      <div
        role="status"
        aria-live="assertive"
        aria-atomic="true"
        className="sr-only"
        style={{ position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0,0,0,0)", whiteSpace: "nowrap" }}
      >
        {message}
      </div>
    </AnnounceContext.Provider>
  );
}
