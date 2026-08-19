// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// Shared vi.mock setup for the VoiceApp tests. Import this file at the top of
// each test file; the mock bag itself lives in voice-app-test-helpers.
import { vi } from "vitest";

vi.mock(import("#webui/utils/mcp-url"), async () => {
  const { voiceAppMocks } = await import("./voice-app-test-helpers");

  return { getMcpUrl: voiceAppMocks.getMcpUrl };
});

vi.mock(import("#webui/utils/browser-detect"), async () => {
  const { voiceAppMocks } = await import("./voice-app-test-helpers");

  return { isFirefox: voiceAppMocks.isFirefox };
});

vi.mock(import("#webui/hooks/voice/use-voice-session"), async () => {
  const { voiceAppMocks } = await import("./voice-app-test-helpers");

  return { useVoiceSession: voiceAppMocks.useVoiceSession };
});

vi.mock(
  import("#webui/hooks/voice/gemini/use-gemini-voice-session"),
  async () => {
    const { voiceAppMocks } = await import("./voice-app-test-helpers");

    return { useGeminiVoiceSession: voiceAppMocks.useGeminiVoiceSession };
  },
);

vi.mock(import("#webui/hooks/connection/use-update-check"), async () => {
  const { voiceAppMocks } = await import("./voice-app-test-helpers");

  return { useUpdateCheck: voiceAppMocks.useUpdateCheck };
});

vi.mock(import("#webui/hooks/voice/use-voice-persistence"), async () => {
  const { voiceAppMocks } = await import("./voice-app-test-helpers");

  return { useVoicePersistence: voiceAppMocks.useVoicePersistence };
});

vi.mock(import("#webui/hooks/chat/use-conversation-transfer"), async () => {
  const { voiceAppMocks } = await import("./voice-app-test-helpers");

  return { useConversationTransfer: voiceAppMocks.useConversationTransfer };
});
