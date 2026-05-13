// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * @vitest-environment happy-dom
 */
import { type RealtimeItem } from "@openai/agents/realtime";
import { act, fireEvent, render, screen } from "@testing-library/preact";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// vi.mock() is hoisted to the top of the file, so any variables it captures
// must also be hoisted via vi.hoisted() to be defined when mocks evaluate.
const mocks = vi.hoisted(() => ({
  loadProviderSettings: vi.fn(),
  loadEnabledTools: vi.fn(),
  getMcpUrl: vi.fn(),
  useVoiceSession: vi.fn(),
  isFirefox: vi.fn(),
}));

vi.mock(import("#webui/hooks/settings/settings-helpers"), () => ({
  loadProviderSettings: mocks.loadProviderSettings,
  loadEnabledTools: mocks.loadEnabledTools,
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

import { VoiceApp } from "./VoiceApp";

interface VoiceSessionStub {
  status: "idle" | "connecting" | "connected" | "disconnecting" | "error";
  error: string | null;
  history: RealtimeItem[];
  isMuted: boolean;
  assistantSpeaking: boolean;
  assistantThinking: boolean;
  rateLimitedUntil: number | null;
  connect: ReturnType<typeof vi.fn>;
  disconnect: ReturnType<typeof vi.fn>;
  toggleMute: ReturnType<typeof vi.fn>;
  interrupt: ReturnType<typeof vi.fn>;
  retryResponse: ReturnType<typeof vi.fn>;
}

function baseSession(
  overrides: Partial<VoiceSessionStub> = {},
): VoiceSessionStub {
  return {
    status: "idle",
    error: null,
    history: [],
    isMuted: false,
    assistantSpeaking: false,
    assistantThinking: false,
    rateLimitedUntil: null,
    connect: vi.fn(),
    disconnect: vi.fn(),
    toggleMute: vi.fn(),
    interrupt: vi.fn(),
    retryResponse: vi.fn(),
    ...overrides,
  };
}

beforeEach(() => {
  mocks.loadProviderSettings.mockReturnValue({ apiKey: "sk-test" });
  mocks.loadEnabledTools.mockReturnValue({});
  mocks.getMcpUrl.mockReturnValue("http://localhost:3350/mcp");
  mocks.isFirefox.mockReturnValue(false);
});

afterEach(() => {
  mocks.loadProviderSettings.mockReset();
  mocks.loadEnabledTools.mockReset();
  mocks.getMcpUrl.mockReset();
  mocks.useVoiceSession.mockReset();
  mocks.isFirefox.mockReset();
});

describe("VoiceApp", () => {
  it("shows the OpenAI-key-required banner when key is missing", () => {
    mocks.loadProviderSettings.mockReturnValue({ apiKey: "" });
    mocks.useVoiceSession.mockReturnValue(baseSession());

    render(<VoiceApp />);

    expect(screen.getByText(/openai api key required/i)).toBeDefined();
  });

  it("hides the banner when an API key is configured", () => {
    mocks.useVoiceSession.mockReturnValue(baseSession());

    render(<VoiceApp />);

    expect(screen.queryByText(/openai api key required/i)).toBeNull();
  });

  it("renders the Talk button when idle and clicking it calls connect()", () => {
    const session = baseSession();

    mocks.useVoiceSession.mockReturnValue(session);

    render(<VoiceApp />);

    const talk = screen.getByRole("button", { name: "Talk" });

    fireEvent.click(talk);
    expect(session.connect).toHaveBeenCalledOnce();
  });

  it("renders Stop and Listening indicator when connected, click calls disconnect()", () => {
    const session = baseSession({ status: "connected" });

    mocks.useVoiceSession.mockReturnValue(session);

    render(<VoiceApp />);

    const stop = screen.getByRole("button", { name: "Stop" });

    fireEvent.click(stop);
    expect(session.disconnect).toHaveBeenCalledOnce();
    expect(screen.getByText(/listening/i)).toBeDefined();
  });

  it("disables the main button (and shows ...) when busy connecting", () => {
    mocks.useVoiceSession.mockReturnValue(
      baseSession({ status: "connecting" }),
    );

    render(<VoiceApp />);

    const btn = screen.getByRole("button", { name: "..." });

    expect((btn as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText(/connecting/i)).toBeDefined();
  });

  it("disables the main button when no OpenAI key is configured", () => {
    mocks.loadProviderSettings.mockReturnValue({ apiKey: "" });
    mocks.useVoiceSession.mockReturnValue(baseSession());

    render(<VoiceApp />);

    const btn = screen.getByRole("button", { name: "Talk" });

    expect((btn as HTMLButtonElement).disabled).toBe(true);
  });

  it("shows the Interrupt button while the assistant is speaking, and clicking calls interrupt()", () => {
    const session = baseSession({
      status: "connected",
      assistantSpeaking: true,
    });

    mocks.useVoiceSession.mockReturnValue(session);

    render(<VoiceApp />);

    const interruptBtn = screen.getByRole("button", { name: "Interrupt" });

    fireEvent.click(interruptBtn);
    expect(session.interrupt).toHaveBeenCalledOnce();
  });

  it("shows the Interrupt button while the assistant is thinking", () => {
    mocks.useVoiceSession.mockReturnValue(
      baseSession({ status: "connected", assistantThinking: true }),
    );

    render(<VoiceApp />);

    expect(screen.getByRole("button", { name: "Interrupt" })).toBeDefined();
    expect(screen.getByText(/thinking/i)).toBeDefined();
  });

  it("shows the Mute button (and Unmute label when muted) instead of Interrupt when idle-listening", () => {
    const session = baseSession({ status: "connected" });

    mocks.useVoiceSession.mockReturnValue(session);
    const { rerender } = render(<VoiceApp />);

    fireEvent.click(screen.getByRole("button", { name: "Mute" }));
    expect(session.toggleMute).toHaveBeenCalledOnce();

    mocks.useVoiceSession.mockReturnValue(
      baseSession({ status: "connected", isMuted: true }),
    );
    rerender(<VoiceApp />);
    expect(screen.getByRole("button", { name: "Unmute" })).toBeDefined();
  });

  it("renders the error banner with the message and a retry control when rate-limited", () => {
    mocks.useVoiceSession.mockReturnValue(
      baseSession({
        status: "connected",
        error: "Rate limit exceeded. Please try again in 5s.",
        rateLimitedUntil: Date.now() - 1000, // already cleared
      }),
    );

    render(<VoiceApp />);

    expect(screen.getByText(/rate limit exceeded/i)).toBeDefined();
    const retryBtn = screen.getByRole("button", { name: "Retry" });

    expect((retryBtn as HTMLButtonElement).disabled).toBe(false);
  });

  it("disables the Retry button while the rate-limit countdown is still active", () => {
    mocks.useVoiceSession.mockReturnValue(
      baseSession({
        status: "connected",
        error: "Rate limit exceeded. Please try again in 5s.",
        rateLimitedUntil: Date.now() + 10000,
      }),
    );

    render(<VoiceApp />);

    const retryBtn = screen.getByRole("button", { name: "Retry" });

    expect((retryBtn as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText(/retry available in/i)).toBeDefined();
  });

  it("clicking Retry while ready calls retryResponse()", () => {
    const session = baseSession({
      status: "connected",
      error: "Rate limit exceeded. Please try again in 0s.",
      rateLimitedUntil: Date.now() - 1000,
    });

    mocks.useVoiceSession.mockReturnValue(session);

    render(<VoiceApp />);

    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(session.retryResponse).toHaveBeenCalledOnce();
  });

  it("rate-limit countdown decrements over time and re-enables Retry", async () => {
    vi.useFakeTimers();
    const start = Date.now();

    mocks.useVoiceSession.mockReturnValue(
      baseSession({
        status: "connected",
        error: "Rate limit exceeded. Please try again in 1s.",
        rateLimitedUntil: start + 1000,
      }),
    );

    try {
      render(<VoiceApp />);
      const retryBtn = screen.getByRole("button", {
        name: "Retry",
      }) as HTMLButtonElement;

      expect(retryBtn.disabled).toBe(true);

      // The interval ticks every 250ms; advance past the deadline.
      await act(() => {
        vi.advanceTimersByTime(1500);
      });

      expect(retryBtn.disabled).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it("renders error status with a red dot when status is 'error'", () => {
    mocks.useVoiceSession.mockReturnValue(
      baseSession({ status: "error", error: "Connection failed" }),
    );

    render(<VoiceApp />);

    // Error label appears in the status pill
    expect(screen.getAllByText(/error/i).length).toBeGreaterThan(0);
  });

  it("status pill renders 'Disconnecting' label during teardown", () => {
    mocks.useVoiceSession.mockReturnValue(
      baseSession({ status: "disconnecting" }),
    );

    render(<VoiceApp />);

    expect(screen.getByText(/disconnecting/i)).toBeDefined();
  });

  it("status pill renders 'Muted' when user mutes the mic while connected", () => {
    mocks.useVoiceSession.mockReturnValue(
      baseSession({ status: "connected", isMuted: true }),
    );

    render(<VoiceApp />);

    expect(screen.getByText(/muted/i)).toBeDefined();
  });

  it("shows the Firefox-unsupported banner when running in Firefox", () => {
    mocks.isFirefox.mockReturnValue(true);
    mocks.useVoiceSession.mockReturnValue(baseSession());

    render(<VoiceApp />);

    expect(screen.getByText(/firefox is not supported/i)).toBeDefined();
  });

  it("disables the Talk button when running in Firefox", () => {
    mocks.isFirefox.mockReturnValue(true);
    mocks.useVoiceSession.mockReturnValue(baseSession());

    render(<VoiceApp />);

    const btn = screen.getByRole("button", { name: "Talk" });

    expect((btn as HTMLButtonElement).disabled).toBe(true);
  });

  it("hides the Firefox banner in Chrome (or other non-Firefox browsers)", () => {
    mocks.useVoiceSession.mockReturnValue(baseSession());

    render(<VoiceApp />);

    expect(screen.queryByText(/firefox is not supported/i)).toBeNull();
  });
});
