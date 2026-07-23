// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// Shared payloads for the App tests' context-dependency mocks. Any test that
// renders the real <App> MUST mock these two: App mounts ContextTabs, whose
// use-doc hooks fetch a same-origin endpoint on mount AND on a 5s poll
// interval. Left unmocked under happy-dom (origin http://localhost:3000) those
// fire real network requests that surface as unhandled ECONNREFUSED errors —
// only under the slower coverage run, where the poll interval has time to fire.
//
// The `vi.mock()` calls stay per-file (they are hoisted and cannot live in a
// helper), but the factory payloads are shared here so the two App test files
// can't drift apart.

import { useEffect } from "preact/hooks";
import { vi } from "vitest";
import { type UseDocReturn } from "#webui/hooks/context/use-doc";

/**
 * Ready useSystemPrompt value so App tests don't fetch /system-prompt.
 * @returns A stable, no-op doc-memory hook return in the "ready" state
 */
export function systemPromptDocMock(): UseDocReturn {
  return {
    status: { kind: "ready", content: "" },
    saveStatus: "idle",
    saveError: null,
    save: vi.fn(),
    clear: vi.fn(),
    refresh: vi.fn(),
  };
}

// A test-settable leave guard the stubbed ContextTabs publishes into
// confirmLeaveRef, mirroring the real component — so App's Escape / backdrop
// guard paths can be exercised without the heavyweight real editor. Null (the
// default) means "no draft to protect": the ref stays null and closes proceed,
// matching most tests. Set it in a test; reset it (to null) between tests.
let stubLeaveGuard: (() => boolean) | null = null;

/**
 * Set the leave guard the stubbed ContextTabs publishes upward (null = none).
 * @param guard - The confirmLeave the App overlay should consult, or null
 */
export function setStubLeaveGuard(guard: (() => boolean) | null): void {
  stubLeaveGuard = guard;
}

/** Props for {@link ContextTabsStub}. */
interface ContextTabsStubProps {
  /** Invoked when the stubbed close button is clicked. */
  onClose?: () => void;
  /** Ref the real ContextTabs publishes confirmLeave into. */
  confirmLeaveRef?: { current: (() => boolean) | null };
}

/**
 * Inert ContextTabs stub (real one wires CodeMirror + polling server fetches).
 * Mirrors the real component's confirmLeaveRef contract so App's overlay-close
 * guard paths are testable; see {@link setStubLeaveGuard}.
 * @param props - Component props
 * @returns A minimal stand-in exposing only the close button
 */
export function ContextTabsStub(
  props: ContextTabsStubProps = {},
): preact.JSX.Element {
  const { onClose, confirmLeaveRef } = props;

  // Publish the test-set guard upward while mounted, as the real ContextTabs
  // does in an effect (setting a ref during render is disallowed).
  useEffect(() => {
    if (confirmLeaveRef == null) return;
    confirmLeaveRef.current = stubLeaveGuard;

    return () => {
      confirmLeaveRef.current = null;
    };
  }, [confirmLeaveRef]);

  return (
    <div data-testid="context-stub">
      <button type="button" aria-label="Close context editor" onClick={onClose}>
        close
      </button>
    </div>
  );
}
