// @vitest-environment happy-dom
import React from "react";
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { SyncIndicator } from "@/components/ui/SyncIndicator";

describe("SyncIndicator", () => {
  it("renders idle state", () => {
    render(<SyncIndicator status="idle" />);
    expect(screen.getByTitle("Synced")).toBeTruthy();
  });

  it("renders syncing state", () => {
    render(<SyncIndicator status="syncing" />);
    expect(screen.getByTitle("Syncing...")).toBeTruthy();
  });

  it("renders error state with text", () => {
    render(<SyncIndicator status="error" />);
    expect(screen.getByTitle("Sync failed")).toBeTruthy();
    expect(screen.getByText("Sync failed")).toBeTruthy();
  });

  it("does not show error text for idle state", () => {
    render(<SyncIndicator status="idle" />);
    expect(screen.queryByText("Sync failed")).toBeNull();
  });

  it("does not show error text for syncing state", () => {
    render(<SyncIndicator status="syncing" />);
    expect(screen.queryByText("Sync failed")).toBeNull();
  });
});
