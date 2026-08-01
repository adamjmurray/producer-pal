// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * @vitest-environment happy-dom
 */
import { render, screen } from "@testing-library/preact";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getMcpUrl: vi.fn(),
  useVoiceSession: vi.fn(),
  useGeminiVoiceSession: vi.fn(),
  isFirefox: vi.fn(),
  useUpdateCheck: vi.fn(),
  useVoicePersistence: vi.fn(),
  useConversationTransfer: vi.fn(),
}));

vi.mock(import("#webui/utils/mcp-url"), () => ({
  getMcpUrl: mocks.getMcpUrl,
}));

vi.mock(import("#webui/utils/browser-detect"), () => ({
  isFirefox: mocks.isFirefox,
}));

vi.mock(import("#webui/hooks/voice/use-voice-session"), () => ({
  useVoiceSession: mocks.useVoiceSession,
}));

vi.mock(import("#webui/hooks/voice/gemini/use-gemini-voice-session"), () => ({
  useGeminiVoiceSession: mocks.useGeminiVoiceSession,
}));

vi.mock(import("#webui/hooks/connection/use-update-check"), () => ({
  useUpdateCheck: mocks.useUpdateCheck,
}));

vi.mock(import("#webui/hooks/voice/use-voice-persistence"), () => ({
  useVoicePersistence: mocks.useVoicePersistence,
}));

vi.mock(import("#webui/hooks/chat/use-conversation-transfer"), () => ({
  useConversationTransfer: mocks.useConversationTransfer,
}));

import { GEMINI_REALTIME_MODEL } from "#webui/lib/constants/models";
import {
  basePersistence,
  installVoiceAppMockDefaults,
  makeProps,
  type PropOverrides,
  resetVoiceAppMocks,
} from "./voice-app-test-helpers";
import { VoiceApp } from "./VoiceApp";

beforeEach(() => installVoiceAppMockDefaults(mocks));
afterEach(() => resetVoiceAppMocks(mocks));

/**
 * Render VoiceApp with a saved record loaded into persistence.
 * @param recordProvider - Stored provider on the loaded record
 * @param recordModel - Stored model id on the loaded record
 * @param overrides - Settings/key overrides forwarded to makeProps
 */
function renderWithLoadedRecord(
  recordProvider: string,
  recordModel: string,
  overrides: PropOverrides,
): void {
  mocks.useVoicePersistence.mockReturnValue(
    basePersistence({
      activeConversationId: "loaded-id",
      activeRecordModel: recordModel,
      activeRecordProvider: recordProvider,
    }),
  );
  render(<VoiceApp {...makeProps(overrides)} />);
}

/** Current Settings select Gemini, but both provider keys are saved. */
const SETTINGS_GEMINI_BOTH_KEYS: PropOverrides = {
  provider: "gemini",
  apiKey: "gem-key",
  model: GEMINI_REALTIME_MODEL,
  openaiApiKey: "sk-openai",
  geminiApiKey: "gem-key",
};

/** Current Settings select OpenAI, but both provider keys are saved. */
const SETTINGS_OPENAI_BOTH_KEYS: PropOverrides = {
  provider: "openai",
  apiKey: "sk-openai",
  openaiApiKey: "sk-openai",
  geminiApiKey: "gem-key",
};

/**
 * Read the params the OpenAI backend was last mounted with.
 * @returns The most recent useVoiceSession params
 */
function lastOpenAiCall(): { openAiKey: string | null; model: string } {
  return mocks.useVoiceSession.mock.calls.at(-1)?.[0] as {
    openAiKey: string | null;
    model: string;
  };
}

/**
 * Read the params the Gemini backend was last mounted with.
 * @returns The most recent useGeminiVoiceSession params
 */
function lastGeminiCall(): { geminiKey: string | null; model: string } {
  return mocks.useGeminiVoiceSession.mock.calls.at(-1)?.[0] as {
    geminiKey: string | null;
    model: string;
  };
}

/**
 * Assert the Talk button is live and no key-required warning is showing.
 */
function expectReadyToTalk(): void {
  expect(screen.queryByText(/api key required/i)).toBeNull();
  expect(
    (screen.getByRole("button", { name: "Talk" }) as HTMLButtonElement)
      .disabled,
  ).toBe(false);
}

// Loading an OpenAI voice record while current Settings select Gemini must
// resume on OpenAI (not silently mount the Gemini backend with the wrong model
// and a missing-key state). Mirror for the inverse below.
describe("VoiceApp record-aware routing", () => {
  it("routes a loaded OpenAI record to the OpenAI backend even when current settings are Gemini", () => {
    renderWithLoadedRecord(
      "openai",
      "gpt-realtime-2",
      SETTINGS_GEMINI_BOTH_KEYS,
    );

    const openAiCall = lastOpenAiCall();

    expect(openAiCall.openAiKey).toBe("sk-openai");
    expect(openAiCall.model).toBe("gpt-realtime-2");
    expectReadyToTalk();
  });

  it("routes a loaded Gemini record to the Gemini backend even when current settings are OpenAI", () => {
    renderWithLoadedRecord(
      "gemini",
      GEMINI_REALTIME_MODEL,
      SETTINGS_OPENAI_BOTH_KEYS,
    );

    const geminiCall = lastGeminiCall();

    expect(geminiCall.geminiKey).toBe("gem-key");
    expect(geminiCall.model).toBe(GEMINI_REALTIME_MODEL);
    expectReadyToTalk();
  });

  // Older voice records were previously saved without a `provider` field —
  // routing has to fall back to sniffing the model id so they don't all
  // accidentally route to OpenAI.
  it("routes a legacy record (no stored provider) on its model id — Gemini side", () => {
    renderWithLoadedRecord(
      // empty provider on the record (string-typed so the stub stays JSON-shaped)
      "",
      GEMINI_REALTIME_MODEL,
      SETTINGS_OPENAI_BOTH_KEYS,
    );

    expect(lastGeminiCall().geminiKey).toBe("gem-key");
  });

  it("routes a legacy record (no stored provider) on its model id — OpenAI side", () => {
    renderWithLoadedRecord("", "gpt-realtime-2", SETTINGS_GEMINI_BOTH_KEYS);

    expect(lastOpenAiCall().openAiKey).toBe("sk-openai");
  });

  it("a fresh session (no loaded record) routes on current settings", () => {
    // No activeRecordModel/Provider — falls back to settings.
    render(
      <VoiceApp
        {...makeProps({
          provider: "openai",
          apiKey: "sk-openai",
          openaiApiKey: "sk-openai",
          geminiApiKey: "",
        })}
      />,
    );

    const openAiCall = lastOpenAiCall();

    expect(openAiCall.openAiKey).toBe("sk-openai");
    expect(openAiCall.model).toBe("gpt-realtime-2");
  });
});
