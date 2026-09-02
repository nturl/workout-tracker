// @vitest-environment happy-dom
//
// BUG-H1: the collapsed-timer / countdown-invisible bug.
//
// Report: notes/bugs/lane-h.md
//
// Root cause in one sentence: SessionCard's outer card (`glass-card ...
// anim-fade-up`, src/components/dashboard/SessionCard.tsx:220) and its
// expanded-content wrapper (`anim-fade-up` when expanded,
// src/components/dashboard/SessionCard.tsx:324) both carry the `.anim-fade-up`
// class, whose keyframes end on `transform: translateY(0)` (globals.css:236-238)
// held forever by `animation-fill-mode: both` (globals.css:252-254). A CSS
// transform value other than `none` establishes a new containing block for
// `position: fixed` descendants (CSS Transforms Level 1, "Containing Block
// for All Descendants"). CountdownIntro renders `fixed inset-0` (
// src/components/tracking/CountdownIntro.tsx:77), intending a full-viewport
// overlay; once nested under either transformed ancestor it is contained
// (and clipped, since SessionCard's root also carries `overflow-hidden`)
// to that ancestor's box instead of the viewport. That box is the whole
// expanded accordion (timer + warmup + instructions + key points + exercise
// list + log button), which is why the "session card" renders as one huge
// (~800pt) near-black rectangle: it's CountdownIntro's `bg-black/80
// backdrop-blur-md` overlay, sized to the accordion instead of the screen,
// blurring the real (correctly-colored) content behind it into faint blobs.
//
// This test can't reproduce real browser containing-block/layout math in
// happy-dom, so it verifies the two halves of the mechanism directly:
//   1. (CSS fact) .anim-fade-up's keyframes end on a non-`none` transform
//      held by fill-mode: both — the condition that creates a containing
//      block for `position: fixed` descendants.
//   2. (DOM fact) CountdownIntro's `fixed` overlay, as actually mounted by
//      RepTimer/CircuitTimer inside SessionCard's expanded card, sits under
//      an ancestor carrying `.anim-fade-up` — so in a real browser it is
//      NOT positioned relative to the viewport.
// Both must be true for the bug to manifest; either being false would kill it.

import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import path from "path";
import React from "react";
import { render, fireEvent, act } from "@testing-library/react";
import { SessionCard } from "@/components/dashboard/SessionCard";
import type { WorkoutSession } from "@/lib/workoutData";

const GLOBALS_CSS = readFileSync(
  path.join(process.cwd(), "src/app/globals.css"),
  "utf-8"
);

describe("BUG-H1: anim-fade-up leaves a permanent non-none transform", () => {
  // NOTE (fix-s2): the original two-step regex here (match the whole
  // @keyframes block lazily, then search *that* capture for `to { ... }`)
  // had its own bug independent of the production CSS: the outer lazy
  // `[\s\S]*?}\s*}` capture group excludes the trailing `}\s*}` it matches
  // against, which is exactly the `to` block's own closing brace - so the
  // inner `to\s*{([^}]*)}` search could never find a match, on HEAD or
  // after the fix. As `it.fails` this went unnoticed (the test failed for
  // the wrong reason - a missing `to` block - never actually reaching the
  // transform-value assertion below). Rewritten to capture the `from`/`to`
  // blocks directly in one pass.
  it("fade-up keyframes should end on transform: none (no held transform)", () => {
    const kfMatch = GLOBALS_CSS.match(/@keyframes fade-up\s*{\s*from\s*{[^}]*}\s*to\s*{([^}]*)}\s*}/);
    expect(kfMatch, "expected to find @keyframes fade-up's `to { ... }` block").toBeTruthy();
    const toBody = kfMatch![1];
    // This is what SHOULD be true for CSS to NOT create a containing block:
    // the ending transform should be `none` (or the property absent).
    const hasNoneOrAbsentTransform =
      !/transform\s*:/.test(toBody) || /transform\s*:\s*none\b/.test(toBody);
    expect(hasNoneOrAbsentTransform).toBe(true);
  });

  it(".anim-fade-up should not hold its final transform forever (fill-mode should not be 'both'/'forwards')", () => {
    const ruleMatch = GLOBALS_CSS.match(/\.anim-fade-up\s*{([^}]*)}/);
    expect(ruleMatch, "expected to find .anim-fade-up rule").toBeTruthy();
    const body = ruleMatch![1];
    // animation shorthand: `fade-up var(--dur-slow) var(--ease-out-quart) both`
    const holdsFinalState = /\bboth\b|\bforwards\b/.test(body);
    expect(holdsFinalState).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// S3 (pre-ship review): `.anim-scale-in` still had the exact defect BUG-H1 /
// BUG-29 fixed for `.anim-fade-up` above — `@keyframes scale-in` ended on
// `transform: scale(1)` (non-`none`), held forever by `fill-mode: both`.
// Latent today (no `.anim-scale-in` call site currently wraps an
// un-portaled `position: fixed` overlay), but the same class of bug, fixed
// the same way, for the same reason. Mirrors the two CSS-fact checks above.
// ---------------------------------------------------------------------------
describe("S3: anim-scale-in should not leave a permanent non-none transform", () => {
  it("scale-in keyframes should end on transform: none (no held transform)", () => {
    const kfMatch = GLOBALS_CSS.match(/@keyframes scale-in\s*{\s*from\s*{[^}]*}\s*to\s*{([^}]*)}\s*}/);
    expect(kfMatch, "expected to find @keyframes scale-in's `to { ... }` block").toBeTruthy();
    const toBody = kfMatch![1];
    const hasNoneOrAbsentTransform =
      !/transform\s*:/.test(toBody) || /transform\s*:\s*none\b/.test(toBody);
    expect(hasNoneOrAbsentTransform).toBe(true);
  });

  it(".anim-scale-in should not hold its final transform forever (fill-mode should not be 'both'/'forwards')", () => {
    const ruleMatch = GLOBALS_CSS.match(/\.anim-scale-in\s*{([^}]*)}/);
    expect(ruleMatch, "expected to find .anim-scale-in rule").toBeTruthy();
    const body = ruleMatch![1];
    const holdsFinalState = /\bboth\b|\bforwards\b/.test(body);
    expect(holdsFinalState).toBe(false);
  });
});

// Minimal fixture: one circuit-timed exercise so CircuitTimer mounts and its
// idle "play" button can be used to trigger the CountdownIntro overlay.
const session: WorkoutSession = {
  id: "test-session",
  title: "Test Circuit",
  icon: "🏋️",
  category: "strength",
  timeOfDay: "Morning",
  levels: {
    beginner: {
      instructions: "Do the thing.",
      exercises: [
        { name: "Jump squats (20s)", equipment: [] },
      ],
    },
  },
} as unknown as WorkoutSession;

describe("BUG-H1: CountdownIntro's fixed overlay is nested under a transformed ancestor", () => {
  it("CountdownIntro's fixed overlay has no anim-fade-up ancestor between it and <body>", async () => {
    const { container, getByRole } = render(
      <SessionCard
        session={session}
        level="beginner"
        completed={false}
        onToggle={() => {}}
        logKey="test-session-beginner"
        logs={{}}
        onOpenLog={() => {}}
        showTimer={true}
      />
    );

    // Expand the card (click the header row) so the timer mounts.
    const headerButton = container.querySelector('[role="button"][aria-label*="details"]');
    expect(headerButton, "expected the expandable header row").toBeTruthy();
    fireEvent.click(headerButton!);

    // Start the circuit timer -> mounts CountdownIntro ("Skip countdown" button).
    // CircuitTimer's play handler is async (it awaits requestWakeLock - BUG-06
    // fix, mirroring RepTimer) and CountdownIntro's portal target is also set
    // via an effect (BUG-29 fix), so this needs a couple of microtask/effect
    // flushes rather than a bare synchronous fireEvent.click.
    const playButton = getByRole("button", { name: /start timer/i });
    await act(async () => {
      fireEvent.click(playButton);
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    const overlay = getByRole("button", { name: /skip countdown/i });
    expect(overlay.className).toMatch(/\bfixed\b/);

    // Walk the ancestor chain looking for anim-fade-up. In a correct
    // implementation this chain should be clean, so the fixed overlay is
    // positioned against the real viewport. On HEAD, SessionCard's own root
    // (glass-card ... anim-fade-up) and/or its expanded wrapper
    // (anim-fade-up when expanded) sit in this chain.
    const offendingAncestors: string[] = [];
    let node: Element | null = overlay.parentElement;
    while (node && node !== document.body) {
      if (node.classList.contains("anim-fade-up")) {
        offendingAncestors.push(node.className);
      }
      node = node.parentElement;
    }

    expect(offendingAncestors).toEqual([]);
  });
});
