// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * @vitest-environment happy-dom
 */
import { act, renderHook } from "@testing-library/preact";
import { waitForHookState } from "#webui/test-utils/async-test-helpers";
import { describe, expect, it } from "vitest";
import { useSystemPrompt } from "#webui/hooks/context/use-system-prompt";
import {
  describeDocTransport,
  installFetchMock,
  jsonResponse,
} from "./doc-transport-test-helpers";

// happy-dom defaults to http://localhost:3000/, so the same-origin endpoint
// resolves to localhost:3000/system-prompt.
describeDocTransport({
  hookName: "useSystemPrompt",
  useHook: useSystemPrompt,
  url: "http://localhost:3000/system-prompt",
  readError: "System prompt request failed",
  writeError: "System prompt update failed",
});

// The system prompt overrides a shipped built-in, so its endpoint also carries
// fork-time drift state — unlike the plain content endpoints (global context).
describe("useSystemPrompt drift", () => {
  const fetchMock = installFetchMock();

  it("surfaces drift state from the /system-prompt response", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        content: "my fork",
        drifted: true,
        forkedFromVersion: "1.4.0",
      }),
    );

    const { result } = renderHook(useSystemPrompt);

    await waitForHookState(() => {
      expect(result.current.status.kind).toBe("ready");
    });

    expect(result.current.drift).toStrictEqual({
      drifted: true,
      forkedFromVersion: "1.4.0",
    });
  });

  it("refreshes drift after a save echoes fresh provenance", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        content: "my fork",
        drifted: true,
        forkedFromVersion: "1.0.0",
      }),
    );

    const { result } = renderHook(useSystemPrompt);

    await waitForHookState(() => {
      expect(result.current.drift?.drifted).toBe(true);
    });

    // Re-saving re-stamps against the current built-in, clearing the drift.
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        content: "my fork",
        drifted: false,
        forkedFromVersion: "1.5.0",
      }),
    );

    await act(async () => {
      await result.current.save("my fork");
    });

    expect(result.current.drift).toStrictEqual({
      drifted: false,
      forkedFromVersion: "1.5.0",
    });
  });
});
