// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * @vitest-environment happy-dom
 */
import { render } from "@testing-library/preact";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  type LeaveGuard,
  LeaveGuardContext,
  useDraftLeaveGuard,
  useLeaveGuard,
  useLeaveGuardContext,
} from "#webui/components/context/collection/leave-guard";
import { makeManualGuard } from "./leave-guard-test-helpers";

afterEach(() => {
  vi.unstubAllGlobals();
});

// A probe that activates useDraftLeaveGuard, so its registration + beforeunload
// wiring can be exercised through an ambient provider.
const DraftGuardProbe = (props: { active: boolean; message: string }): null => {
  useDraftLeaveGuard(props.active, props.message);

  return null;
};

// Capture a hook's return during render so the test can drive it afterward (the
// guard object is stable and ref-backed, so calling its methods post-render is
// what the real navigators do).
const Capture = (props: {
  use: () => LeaveGuard;
  onReady: (g: LeaveGuard) => void;
}): null => {
  props.onReady(props.use());

  return null;
};

/**
 * Render a capturing probe for a guard hook and return the captured guard.
 * @param use - The hook to invoke (useLeaveGuard or useLeaveGuardContext)
 * @param wrap - Optional wrapper (e.g. a context provider) around the probe
 * @returns The captured guard
 */
function captureGuard(
  use: () => LeaveGuard,
  wrap?: (probe: preact.JSX.Element) => preact.JSX.Element,
): LeaveGuard {
  let captured: LeaveGuard | undefined;
  const probe = (
    <Capture
      use={use}
      onReady={(g) => {
        captured = g;
      }}
    />
  );

  render(wrap ? wrap(probe) : probe);

  if (captured == null) throw new Error("guard was not captured");

  return captured;
}

describe("useLeaveGuard", () => {
  it("permits leaving with nothing registered, then defers to the registered guard", () => {
    const guard = captureGuard(useLeaveGuard);

    // Nothing registered → free to leave.
    expect(guard.confirmLeave()).toBe(true);

    // A registered guard decides the answer.
    guard.register(() => false);
    expect(guard.confirmLeave()).toBe(false);
    guard.register(() => true);
    expect(guard.confirmLeave()).toBe(true);

    // Cleared → free again.
    guard.register(null);
    expect(guard.confirmLeave()).toBe(true);
  });
});

describe("useLeaveGuardContext", () => {
  it("falls back to a permissive no-op guard when no provider is present", () => {
    const guard = captureGuard(useLeaveGuardContext);

    // The NOOP guard: register is a no-op and confirmLeave is always true.
    guard.register(() => false);
    expect(guard.confirmLeave()).toBe(true);
  });

  it("returns the provided guard under a provider", () => {
    const provided: LeaveGuard = {
      register: () => {},
      confirmLeave: () => false,
    };
    const guard = captureGuard(useLeaveGuardContext, (probe) => (
      <LeaveGuardContext.Provider value={provided}>
        {probe}
      </LeaveGuardContext.Provider>
    ));

    expect(guard).toBe(provided);
    expect(guard.confirmLeave()).toBe(false);
  });
});

describe("useDraftLeaveGuard", () => {
  it("registers a discard confirm only while active", () => {
    vi.stubGlobal("confirm", vi.fn().mockReturnValue(true));
    const guard = makeManualGuard();
    const { rerender } = render(
      <LeaveGuardContext.Provider value={guard}>
        <DraftGuardProbe active={false} message="Discard?" />
      </LeaveGuardContext.Provider>,
    );

    // Inactive → nothing registered, so leaving is free and silent.
    expect(guard.confirmLeave()).toBe(true);
    expect(window.confirm).not.toHaveBeenCalled();

    // Active → the registered guard asks for confirmation.
    rerender(
      <LeaveGuardContext.Provider value={guard}>
        <DraftGuardProbe active={true} message="Discard?" />
      </LeaveGuardContext.Provider>,
    );

    expect(guard.confirmLeave()).toBe(true);
    expect(window.confirm).toHaveBeenCalledWith("Discard?");
  });

  it("prompts (preventDefault) on beforeunload while active", () => {
    render(
      <LeaveGuardContext.Provider value={makeManualGuard()}>
        <DraftGuardProbe active={true} message="Discard?" />
      </LeaveGuardContext.Provider>,
    );

    const event = new Event("beforeunload", { cancelable: true });

    window.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(true);
  });

  it("does not block a browser-tab close while inactive", () => {
    render(
      <LeaveGuardContext.Provider value={makeManualGuard()}>
        <DraftGuardProbe active={false} message="Discard?" />
      </LeaveGuardContext.Provider>,
    );

    const event = new Event("beforeunload", { cancelable: true });

    window.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(false);
  });
});
