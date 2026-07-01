// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// Shared payloads for the App tests' context-dependency mocks. Any test that
// renders the real <App> MUST mock these two: App mounts ContextTabs, whose
// use-doc-memory hooks fetch a same-origin endpoint on mount AND on a 5s poll
// interval. Left unmocked under happy-dom (origin http://localhost:3000) those
// fire real network requests that surface as unhandled ECONNREFUSED errors —
// only under the slower coverage run, where the poll interval has time to fire.
//
// The `vi.mock()` calls stay per-file (they are hoisted and cannot live in a
// helper), but the factory payloads are shared here so the two App test files
// can't drift apart.

import { vi } from "vitest";
import { type UseDocMemoryReturn } from "#webui/hooks/context/use-doc-memory";

/**
 * Ready useSystemPromptMemory value so App tests don't fetch /system-prompt.
 * @returns A stable, no-op doc-memory hook return in the "ready" state
 */
export function systemPromptMemoryMock(): UseDocMemoryReturn {
  return {
    status: { kind: "ready", content: "" },
    saveStatus: "idle",
    saveError: null,
    save: vi.fn(),
    clear: vi.fn(),
    refresh: vi.fn(),
  };
}

/**
 * Inert ContextTabs stub (real one wires CodeMirror + polling server fetches).
 * @param props - Component props
 * @param props.onClose - Invoked when the stubbed close button is clicked
 * @returns A minimal stand-in exposing only the close button
 */
export function ContextTabsStub(
  props: { onClose?: () => void } = {},
): preact.JSX.Element {
  return (
    <div data-testid="context-stub">
      <button
        type="button"
        aria-label="Close context editor"
        onClick={props.onClose}
      >
        close
      </button>
    </div>
  );
}
