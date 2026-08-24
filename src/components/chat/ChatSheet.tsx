"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { LazyMotion, domAnimation, m, AnimatePresence } from "framer-motion";

function formatMessage(text: string) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return <strong key={i}>{part.slice(2, -2)}</strong>;
    }
    return part;
  });
}

interface Message {
  role: "user" | "assistant";
  text: string;
}

export interface ChatContext {
  biomarkerId: string;
  name: string;
  value: number;
  unit: string;
  status: string;
  optimalRange?: string;
  standardRange?: string;
  question: string;
  goalContext?: {
    title: string;
    summary: string;
    biomarkers: string[];
  };
}

interface ChatSheetProps {
  open: boolean;
  onClose: () => void;
  initialContext?: ChatContext | null;
}

const GREETING: Message = {
  role: "assistant",
  text: "Hey! I'm Coach - your AI workout buddy. Ask me anything about your training, recovery, or your program.",
};
const STORAGE_KEY = "coach-chat-history-v1";
const HISTORY_LIMIT = 20; // cap messages sent to server

export function ChatSheet({ open, onClose, initialContext }: ChatSheetProps) {
  const [messages, setMessages] = useState<Message[]>([GREETING]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [viewport, setViewport] = useState<{ height: number; offsetTop: number } | null>(null);
  const hydratedRef = useRef(false);

  // Load persisted history on mount
  useEffect(() => {
    if (hydratedRef.current) return;
    hydratedRef.current = true;
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Message[];
        if (Array.isArray(parsed) && parsed.length > 0) {
          setMessages(parsed);
        }
      }
    } catch {
      // ignore corrupt storage
    }
  }, []);

  // Persist messages on every change (skip the very first render when only greeting is present)
  useEffect(() => {
    if (!hydratedRef.current) return;
    if (messages.length <= 1) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(messages.slice(-50)));
    } catch {
      // ignore quota errors
    }
  }, [messages]);

  // Track visual viewport for mobile keyboard handling.
  // iOS shifts the layout viewport up by offsetTop when the keyboard opens,
  // so a fixed panel at top:0 leaves a strip of the page exposed at the bottom.
  // Pin to offsetTop + height instead.
  useEffect(() => {
    if (!open) return;
    const vv = window.visualViewport;
    if (!vv) return;

    const update = () => setViewport({ height: vv.height, offsetTop: vv.offsetTop });
    update();
    vv.addEventListener("resize", update);
    vv.addEventListener("scroll", update);
    return () => {
      vv.removeEventListener("resize", update);
      vv.removeEventListener("scroll", update);
    };
  }, [open]);

  // Auto-scroll on new messages
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, loading]);

  // Lock body scroll when open
  useEffect(() => {
    if (open) {
      document.body.style.overflow = "hidden";
      // Small delay to let animation finish before focusing
      const t = setTimeout(() => inputRef.current?.focus(), 350);
      return () => { document.body.style.overflow = ""; clearTimeout(t); };
    }
    document.body.style.overflow = "";
  }, [open]);

  // Track whether initial context has been sent
  const contextSentRef = useRef(false);

  // Auto-send initial context question
  useEffect(() => {
    if (!open || !initialContext || contextSentRef.current || loading) return;
    contextSentRef.current = true;
    sendMessage(initialContext.question, initialContext);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initialContext]);

  // Reset context sent flag when closed
  useEffect(() => {
    if (!open) contextSentRef.current = false;
  }, [open]);

  const sendMessage = useCallback(async (text: string, context?: ChatContext | null) => {
    if (!text || loading) return;

    // Snapshot history BEFORE appending the new user message so it isn't double-counted
    const historySnapshot = messages
      .filter((m) => m.text !== GREETING.text || m.role !== "assistant")
      .slice(-HISTORY_LIMIT)
      .map((m) => ({ role: m.role, content: m.text }));

    setMessages((prev) => [...prev, { role: "user", text }]);
    setLoading(true);

    const payload: Record<string, unknown> = { message: text, history: historySnapshot };
    if (context?.goalContext) {
      payload.goalContext = context.goalContext;
    } else if (context) {
      payload.biomarkerContext = {
        biomarkerId: context.biomarkerId,
        name: context.name,
        value: context.value,
        unit: context.unit,
        status: context.status,
        optimalRange: context.optimalRange,
        standardRange: context.standardRange,
      };
    }

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Requested-With": "fetch" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (data.reply) {
        setMessages((prev) => [...prev, { role: "assistant", text: data.reply }]);
      } else {
        setMessages((prev) => [...prev, { role: "assistant", text: data.error || "Something went wrong. Try again." }]);
      }
    } catch {
      setMessages((prev) => [...prev, { role: "assistant", text: "Connection error. Try again." }]);
    }
    setLoading(false);
    // Re-focus input after send for quick follow-ups
    setTimeout(() => inputRef.current?.focus(), 50);
  }, [loading, messages]);

  const clearChat = useCallback(() => {
    setMessages([GREETING]);
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      // ignore
    }
  }, []);

  const send = useCallback(() => {
    const text = input.trim();
    if (!text) return;
    setInput("");
    sendMessage(text);
  }, [input, sendMessage]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  };

  // Use visual viewport on mobile (handles iOS keyboard), fallback to dvh
  const chatHeight = viewport ? `${viewport.height}px` : "100dvh";
  const chatTop = viewport ? `${viewport.offsetTop}px` : 0;

  return (
    <LazyMotion features={domAnimation} strict>
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[60]">
          {/* Backdrop covers the full layout viewport so nothing bleeds through */}
          <m.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="absolute inset-0"
            style={{ backgroundColor: "var(--modal-overlay)" }}
            onClick={onClose}
          />
          {/* Chat panel pinned to the visible viewport (above the iOS keyboard) */}
          <m.div
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", damping: 30, stiffness: 300 }}
            className="absolute left-0 right-0 sm:left-auto sm:right-0 flex flex-col"
            style={{
              background: "var(--bg-card)",
              top: chatTop,
              height: chatHeight,
              maxWidth: "100%",
            }}
          >
            {/* Header */}
            <div className="shrink-0 px-4 py-3 border-b flex items-center justify-between safe-area-top"
              style={{ borderColor: "var(--border)", background: "var(--bg-card)" }}>
              <div className="flex items-center gap-3">
                <button onClick={onClose} className="w-10 h-10 rounded-button flex items-center justify-center text-sm pressable"
                  style={{ background: "var(--bg-elevated)", color: "var(--text-secondary)" }}
                  aria-label="Close chat">
                  {"\u2190"}
                </button>
                <div>
                  <h2 className="text-base font-display font-bold" style={{ color: "var(--text-primary)" }}>Coach</h2>
                  <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>
                    {initialContext ? `Discussing ${initialContext.name}` : "AI workout assistant"}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {messages.length > 1 && (
                  <button
                    onClick={clearChat}
                    className="text-[11px] font-bold px-2.5 py-1.5 rounded-full pressable"
                    style={{ background: "var(--bg-elevated)", color: "var(--text-secondary)" }}
                    aria-label="Clear chat history"
                  >
                    Clear
                  </button>
                )}
                <div
                  className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold"
                  style={{ background: "linear-gradient(135deg, var(--accent), var(--accent-light))", color: "var(--accent-contrast)" }}
                >
                  AI
                </div>
              </div>
            </div>

            {/* Messages */}
            <div ref={scrollRef} className="flex-1 overflow-y-auto overscroll-contain px-4 py-3 space-y-3">
              {messages.map((msg, i) => (
                <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                  <div
                    className={`max-w-[85%] rounded-card px-4 py-2.5 text-[15px] leading-relaxed ${
                      msg.role === "user" ? "rounded-br-md" : "rounded-bl-md"
                    }`}
                    style={{
                      background: msg.role === "user" ? "var(--accent)" : "var(--bg-elevated)",
                      color: msg.role === "user" ? "var(--accent-contrast)" : "var(--text-primary)",
                    }}
                  >
                    {msg.role === "assistant" ? formatMessage(msg.text) : msg.text}
                  </div>
                </div>
              ))}
              {loading && (
                <div className="flex justify-start">
                  <div className="rounded-card rounded-bl-md px-4 py-2.5 text-sm"
                    style={{ background: "var(--bg-elevated)", color: "var(--text-muted)" }}>
                    <span className="inline-flex gap-1">
                      <span className="animate-pulse">.</span>
                      <span className="animate-pulse" style={{ animationDelay: "0.2s" }}>.</span>
                      <span className="animate-pulse" style={{ animationDelay: "0.4s" }}>.</span>
                    </span>
                  </div>
                </div>
              )}
            </div>

            {/* Input area - stays above keyboard */}
            <div className="shrink-0 border-t px-3 py-2 safe-area-bottom" style={{ borderColor: "var(--border)", background: "var(--bg-card)" }}>
              <div className="flex gap-2 items-end">
                <input
                  ref={inputRef}
                  type="text"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Ask about your workouts..."
                  enterKeyHint="send"
                  autoComplete="off"
                  className="input-field flex-1 h-11 px-3 rounded-button border text-[15px] outline-none"
                  style={{ background: "var(--bg-input)", borderColor: "var(--border)", color: "var(--text-primary)" }}
                />
                <button
                  onClick={send}
                  disabled={loading || !input.trim()}
                  className="shrink-0 w-11 h-11 rounded-button flex items-center justify-center text-sm font-semibold pressable disabled:opacity-30"
                  style={{ background: "var(--accent)", color: "var(--accent-contrast)" }}
                  aria-label="Send message"
                >
                  {loading ? (
                    <span className="animate-spin text-xs">...</span>
                  ) : (
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <line x1="22" y1="2" x2="11" y2="13" />
                      <polygon points="22 2 15 22 11 13 2 9 22 2" />
                    </svg>
                  )}
                </button>
              </div>
            </div>
          </m.div>
        </div>
      )}
    </AnimatePresence>
    </LazyMotion>
  );
}
