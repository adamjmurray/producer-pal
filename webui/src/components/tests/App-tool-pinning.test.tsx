// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * @vitest-environment happy-dom
 */
import { render, screen } from "@testing-library/preact";
import { describe, expect, it, vi, beforeEach } from "vitest";

// Mock App's hook dependencies (vi.mock must be per-file, mirrors App.test.tsx)
vi.mock(import("#webui/hooks/chat/use-chat"), () => ({ useChat: vi.fn() }));
vi.mock(import("#webui/hooks/chat/use-conversations"), () => ({
  useConversations: vi.fn(),
}));
vi.mock(import("#webui/hooks/connection/use-mcp-connection"), () => ({
  useMcpConnection: vi.fn(),
}));
vi.mock(import("#webui/hooks/connection/use-remote-config"), () => ({
  useRemoteConfig: vi.fn(),
}));
vi.mock(import("#webui/hooks/settings/use-settings"), () => ({
  useSettings: vi.fn(),
}));
vi.mock(import("#webui/hooks/theme/use-theme"), () => ({ useTheme: vi.fn() }));
vi.mock(import("#webui/hooks/connection/use-update-check"), () => ({
  useUpdateCheck: () => ({ update: null, dismissUpdate: () => {} }),
}));
vi.mock(import("#webui/hooks/view-state/use-view-state"), () => ({
  useViewState: vi.fn(),
}));

// App renders the real ContextTabs + system-prompt hook, both of which fetch a
// same-origin endpoint; stub them so these tests don't leak real localhost
// fetches. See App-context-mocks for details.
vi.mock(import("#webui/hooks/context/use-system-prompt"), () => ({
  useSystemPrompt: systemPromptDocMock,
}));
vi.mock(import("#webui/components/context/ContextTabs"), () => ({
  ContextTabs: ContextTabsStub,
}));

// The stub module must load before anything that pulls in App's tree — the
// mock factories above close over its exports (see App-conversations.test.tsx).
import { ContextTabsStub, systemPromptDocMock } from "./App-context-mocks";
import { useChat } from "#webui/hooks/chat/use-chat";
import { useMcpConnection } from "#webui/hooks/connection/use-mcp-connection";
import { useRemoteConfig } from "#webui/hooks/connection/use-remote-config";
import { LIVE_API_TOOL_ID } from "#webui/lib/utils/enabled-tools";
import { mockChatHook, setupDefaultMocks } from "./App-test-helpers";
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

    expect(
      screen.getByTitle("Locked: 2/3 tools enabled (default is now 3/3)"),
    ).toBeTruthy();
  });

  it("leaves a conversation pinned before the stamp existed undisturbed", () => {
    // No entry is exactly what such a record reconnects on: it follows the
    // flag, so there is nothing to report as having diverged from it.
    // The server only lists the tool while the flag is on, so the catalog
    // follows it here the way it does on the device.
    for (const [liveApiEnabled, count] of [
      [true, "3/3"],
      [false, "2/2"],
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
      expect(screen.getByTitle(`${count} tools enabled`)).toBeTruthy();
      unmount();
    }
  });
});
