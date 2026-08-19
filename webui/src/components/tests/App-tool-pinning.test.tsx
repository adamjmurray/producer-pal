// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * @vitest-environment happy-dom
 */
import { render, screen } from "@testing-library/preact";
import { describe, expect, it, vi, beforeEach } from "vitest";
import "./App-mocks-test-helpers";
import { useChat } from "#webui/hooks/chat/use-chat";
import { useMcpConnection } from "#webui/hooks/connection/use-mcp-connection";
import { useRemoteConfig } from "#webui/hooks/connection/use-remote-config";
import { LIVE_API_TOOL_ID } from "#src/shared/tool-groups";
import { useSettings } from "#webui/hooks/settings/use-settings";
import { SPAWN_SUBAGENT_TOOL_NAME } from "#webui/lib/utils/enabled-tools";
import {
  mockChatHook,
  mockSettingsHook,
  setupDefaultMocks,
} from "./App-test-helpers";
import { App } from "#webui/components/App";

/** The catalog the server returns while Direct Live API is switched on. */
const TOOLS_WITH_LIVE_API = [
  { id: "ppal-connect", name: "Connect to Ableton" },
  { id: "ppal-read-live-set", name: "Read Live Set" },
  { id: LIVE_API_TOOL_ID, name: "Live API" },
];

/**
 * Point the mocked hooks at a device flag state, a tool catalog, and the
 * toolset the active conversation is pinned to.
 * @param options - Scenario inputs
 * @param options.liveApiEnabled - The device's Direct Live API flag
 * @param options.tools - The server's tool catalog
 * @param options.pinned - The active conversation's pinned toolset (null = none)
 */
function setup(options: {
  liveApiEnabled: boolean;
  tools?: { id: string; name: string }[];
  pinned?: Record<string, boolean> | null;
}): void {
  const { liveApiEnabled, tools, pinned = null } = options;

  (useRemoteConfig as ReturnType<typeof vi.fn>).mockReturnValue({
    serverSmallModelMode: false,
    serverLiveApiEnabled: liveApiEnabled,
    serverLiveApiForcedOn: false,
    serverNotation: "barbeat",
    postSmallModelMode: vi.fn(),
    postLiveApiEnabled: vi.fn().mockResolvedValue(undefined),
    postNotation: vi.fn(),
  });

  if (tools) {
    (useMcpConnection as ReturnType<typeof vi.fn>).mockReturnValue({
      mcpStatus: "connected",
      mcpError: null,
      mcpTools: tools,
      checkMcpConnection: vi.fn(),
    });
  }

  (useChat as ReturnType<typeof vi.fn>).mockReturnValue({
    ...mockChatHook,
    activeEnabledTools: pinned,
  });
}

/** The toolset map App handed to useChat on the latest render. */
function pinnedToolset(): Record<string, boolean> {
  const props = (useChat as ReturnType<typeof vi.fn>).mock.calls.at(-1)?.[0] as
    | { enabledTools: Record<string, boolean> }
    | undefined;

  return props?.enabledTools ?? {};
}

describe("App Direct Live API pinning", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupDefaultMocks();
  });

  it("stamps the device flag into the toolset a conversation pins", () => {
    // The Tools tab writes no entry for this one — its checkbox flips the
    // device flag — so without the stamp it would be the only tool that
    // follows the device instead of the conversation.
    setup({ liveApiEnabled: true });
    render(<App />);

    expect(pinnedToolset()[LIVE_API_TOOL_ID]).toBe(true);

    vi.clearAllMocks();
    setupDefaultMocks();
    setup({ liveApiEnabled: false });
    render(<App />);

    expect(pinnedToolset()[LIVE_API_TOOL_ID]).toBe(false);
  });

  it("flags a divergence once the flag moves past a pinned toolset", () => {
    // Pinned while the tool was off, and the device has since switched it on:
    // the conversation keeps running without it, and the header says so.
    setup({
      liveApiEnabled: true,
      tools: TOOLS_WITH_LIVE_API,
      pinned: { [LIVE_API_TOOL_ID]: false },
    });
    render(<App />);

    // 4, not 3: the denominator is the full catalog, so it also counts the
    // Subagent tool the server never lists.
    expect(
      screen.getByTitle(/^Locked: 2\/4 tools enabled \(default is now 3\/4\)/),
    ).toBeTruthy();
  });

  it("leaves a conversation pinned before the stamp existed undisturbed", () => {
    // No entry is exactly what such a record reconnects on: it follows the
    // flag, so there is nothing to report as having diverged from it.
    // The denominator holds at 4 either way — the flag moves the numerator, not
    // the size of the catalog.
    for (const [liveApiEnabled, count] of [
      [true, "3/4"],
      [false, "2/4"],
    ] as const) {
      vi.clearAllMocks();
      setupDefaultMocks();
      setup({
        liveApiEnabled,
        tools: liveApiEnabled ? TOOLS_WITH_LIVE_API : undefined,
        pinned: {},
      });

      const { unmount } = render(<App />);

      // Scoped to the tools indicator: the model display carries its own
      // "Locked:" title, which these mocks always diverge on.
      expect(screen.queryByTitle(/^Locked:.*tools enabled/)).toBeNull();
      expect(
        screen.getByTitle(new RegExp(`^${count} tools enabled`)),
      ).toBeTruthy();
      unmount();
    }
  });

  it("counts the Subagent tool the server never lists", () => {
    // The whole point of the fixed denominator: switching Subagent on has to
    // move the number, or the setting looks like it did nothing.
    setup({ liveApiEnabled: false });
    render(<App />);

    expect(screen.getByTitle(/^2\/4 tools enabled/)).toBeTruthy();

    vi.clearAllMocks();
    setupDefaultMocks();
    (useSettings as ReturnType<typeof vi.fn>).mockReturnValue({
      ...mockSettingsHook,
      enabledTools: { [SPAWN_SUBAGENT_TOOL_NAME]: true },
    });
    setup({ liveApiEnabled: false });
    render(<App />);

    expect(screen.getByTitle(/^3\/4 tools enabled/)).toBeTruthy();
  });
});
