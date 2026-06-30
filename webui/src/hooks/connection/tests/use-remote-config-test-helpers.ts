// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import {
  type RenderHookResult,
  renderHook,
  waitFor,
} from "@testing-library/preact";
import { expect, vi } from "vitest";
import {
  type UseRemoteConfigReturn,
  useRemoteConfig,
} from "#webui/hooks/connection/use-remote-config";

interface RemoteConfig {
  smallModelMode?: boolean;
  liveApiEnabled?: boolean;
  // string (not Notation) so tests can also feed invalid values to exercise the
  // hook's isNotation fallback.
  notation?: string;
}

/**
 * Build a Response-like object whose `.json()` resolves to the given config.
 *
 * @param config - Server config to embed in the mock response body
 * @returns Mock Response
 */
export function mockConfigResponse(config: RemoteConfig): Response {
  return {
    ok: true,
    json: () => Promise.resolve(config),
  } as Response;
}

/**
 * Stub `fetch` to return the given config, render `useRemoteConfig`, and
 * wait for the hook's server-state to reflect the initial values.
 *
 * @param initial - Initial server-config values to seed and assert on
 * @returns The rendered hook's `{ result }` once mount-time fetch has settled
 */
export async function setupRemoteConfigHook(
  initial: RemoteConfig,
): Promise<RenderHookResult<UseRemoteConfigReturn, unknown>> {
  vi.spyOn(globalThis, "fetch").mockResolvedValue(mockConfigResponse(initial));

  const rendered = renderHook(() => useRemoteConfig("connected"));

  await waitFor(() => {
    if (initial.smallModelMode != null) {
      expect(rendered.result.current.serverSmallModelMode).toBe(
        initial.smallModelMode,
      );
    }

    if (initial.liveApiEnabled != null) {
      expect(rendered.result.current.serverLiveApiEnabled).toBe(
        initial.liveApiEnabled,
      );
    }

    if (initial.notation != null) {
      expect(rendered.result.current.serverNotation).toBe(initial.notation);
    }
  });

  return rendered;
}
