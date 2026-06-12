// @vitest-environment happy-dom
import React from "react";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { render, screen, act } from "@testing-library/react";
import { OfflineBanner } from "@/components/ui/OfflineBanner";

describe("OfflineBanner", () => {
  let originalOnLine: boolean;

  beforeEach(() => {
    originalOnLine = navigator.onLine;
  });

  afterEach(() => {
    Object.defineProperty(navigator, "onLine", { value: originalOnLine, configurable: true });
  });

  it("does not render when online", () => {
    Object.defineProperty(navigator, "onLine", { value: true, configurable: true });
    render(<OfflineBanner />);
    expect(screen.queryByText(/offline/i)).toBeNull();
  });

  it("renders when offline", () => {
    Object.defineProperty(navigator, "onLine", { value: false, configurable: true });
    render(<OfflineBanner />);
    expect(screen.getByText(/offline/i)).toBeTruthy();
  });

  it("shows banner when going offline", () => {
    Object.defineProperty(navigator, "onLine", { value: true, configurable: true });
    render(<OfflineBanner />);
    expect(screen.queryByText(/offline/i)).toBeNull();

    act(() => {
      Object.defineProperty(navigator, "onLine", { value: false, configurable: true });
      window.dispatchEvent(new Event("offline"));
    });
    expect(screen.getByText(/offline/i)).toBeTruthy();
  });

  it("hides banner when coming back online", () => {
    Object.defineProperty(navigator, "onLine", { value: false, configurable: true });
    render(<OfflineBanner />);
    expect(screen.getByText(/offline/i)).toBeTruthy();

    act(() => {
      Object.defineProperty(navigator, "onLine", { value: true, configurable: true });
      window.dispatchEvent(new Event("online"));
    });
    expect(screen.queryByText(/offline/i)).toBeNull();
  });
});
