// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// Shared vi.mock setup for the App tests: App's hook dependencies, plus the two
// context modules that would otherwise fetch a same-origin endpoint. Import
// this file at the top of each App test file.
import { vi } from "vitest";

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
vi.mock(import("#webui/hooks/context/use-system-prompt"), async () => {
  const { systemPromptDocMock } = await import("./App-context-mocks");

  return { useSystemPrompt: systemPromptDocMock };
});
vi.mock(import("#webui/components/context/ContextTabs"), async () => {
  const { ContextTabsStub } = await import("./App-context-mocks");

  return { ContextTabs: ContextTabsStub };
});
