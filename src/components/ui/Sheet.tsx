"use client";

import { useEffect, useRef, useCallback } from "react";
import { LazyMotion, domAnimation, m, AnimatePresence } from "framer-motion";
import { spring } from "@/lib/motion";
import { Icon } from "@/components/ui/Icon";

interface SheetProps {
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
  title?: string;
  subtitle?: string;
}

const FOCUSABLE_SELECTOR = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

export function Sheet({ open, onClose, children, title, subtitle }: SheetProps) {
  const contentRef = useRef<HTMLDivElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const titleId = title ? `sheet-title-${title.replace(/\s+/g, "-").toLowerCase()}` : undefined;

  // Handle keyboard events
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === "Escape") {
      onClose();
      return;
    }
    // Focus trap
    if (e.key === "Tab" && contentRef.current) {
      const focusable = contentRef.current.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR);
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
  }, [onClose]);

  useEffect(() => {
    if (open) {
      previousFocusRef.current = document.activeElement as HTMLElement;
      document.body.style.overflow = "hidden";
      document.addEventListener("keydown", handleKeyDown);

      // Focus first focusable element after animation
      requestAnimationFrame(() => {
        const focusable = contentRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR);
        if (focusable?.length) focusable[0].focus();
      });
    } else {
      document.body.style.overflow = "";
      document.removeEventListener("keydown", handleKeyDown);
      // Restore focus
      previousFocusRef.current?.focus();
    }
    return () => {
      document.body.style.overflow = "";
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open, handleKeyDown]);

  return (
    <LazyMotion features={domAnimation} strict>
      <AnimatePresence>
        {open && (
          <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center" role="dialog" aria-modal="true" aria-labelledby={titleId}>
            <m.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="absolute inset-0 backdrop-blur-sm"
              style={{ backgroundColor: "var(--modal-overlay)" }}
              onClick={onClose}
              aria-hidden="true"
            />
            <m.div
              ref={contentRef}
              initial={{ y: "100%", opacity: 0.5 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: "100%", opacity: 0 }}
              transition={spring.snappy}
              className="relative rounded-t-sheet sm:rounded-sheet w-full max-w-md max-h-[92vh] overflow-y-auto shadow-2xl glass"
              style={{ borderTop: "1px solid var(--glass-border)" }}
            >
              {/* Grab handle - mobile sheet affordance */}
              <div className="absolute top-2 left-1/2 -translate-x-1/2 w-9 h-1 rounded-full sm:hidden" style={{ background: "var(--text-muted)", opacity: 0.35 }} aria-hidden="true" />
              {title && (
                <div className="sticky top-0 z-10 px-5 pt-6 pb-4 border-b flex items-center justify-between glass" style={{ borderColor: "var(--border)" }}>
                  <div>
                    <h2 id={titleId} className="text-lg font-display font-bold" style={{ color: "var(--text-primary)" }}>{title}</h2>
                    {subtitle && <p className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>{subtitle}</p>}
                  </div>
                  <button onClick={onClose} aria-label="Close" className="w-10 h-10 rounded-full flex items-center justify-center pressable"
                    style={{ background: "var(--bg-elevated)", color: "var(--text-secondary)" }}>
                    <Icon name="close" size={16} strokeWidth={2.4} />
                  </button>
                </div>
              )}
              <div className="pb-[env(safe-area-inset-bottom)]">
                {children}
              </div>
            </m.div>
          </div>
        )}
      </AnimatePresence>
    </LazyMotion>
  );
}
