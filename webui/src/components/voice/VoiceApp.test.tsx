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
  useMcpConnection: vi.fn(),
  useUpdateCheck: vi.fn(),
  useVoicePersistence: vi.fn(),
  useConversationTransfer: vi.fn(),
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

vi.mock(import("#webui/hooks/connection/use-mcp-connection"), () => ({
  useMcpConnection: mocks.useMcpConnection,
}));

vi.mock(import("#webui/hooks/use-update-check"), () => ({
  useUpdateCheck: mocks.useUpdateCheck,
}));

vi.mock(import("#webui/hooks/voice/use-voice-persistence"), () => ({
  useVoicePersistence: mocks.useVoicePersistence,
}));

vi.mock(import("#webui/hooks/chat/use-conversation-transfer"), () => ({
  useConversationTransfer: mocks.useConversationTransfer,
}));

import { type ConversationSummary } from "#webui/lib/conversation-db";
import { createTestSummary } from "#webui/test-utils/conversation-test-helpers";
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

interface PersistenceStub {
  conversations: ConversationSummary[];
  activeConversationId: string | null;
  savedItems: RealtimeItem[];
  refreshList: ReturnType<typeof vi.fn>;
  switchConversation: ReturnType<typeof vi.fn>;
  startNewConversation: ReturnType<typeof vi.fn>;
  deleteConversation: ReturnType<typeof vi.fn>;
  renameConversation: ReturnType<typeof vi.fn>;
  toggleBookmark: ReturnType<typeof vi.fn>;
}

function basePersistence(
  overrides: Partial<PersistenceStub> = {},
): PersistenceStub {
  return {
    conversations: [],
    activeConversationId: null,
    savedItems: [],
    refreshList: vi.fn(),
    switchConversation: vi.fn(),
    startNewConversation: vi.fn(),
    deleteConversation: vi.fn(),
    renameConversation: vi.fn(),
    toggleBookmark: vi.fn(),
    ...overrides,
  };
}

beforeEach(() => {
  mocks.loadProviderSettings.mockReturnValue({ apiKey: "sk-test" });
  mocks.loadEnabledTools.mockReturnValue({});
  mocks.getMcpUrl.mockReturnValue("http://localhost:3350/mcp");
  mocks.isFirefox.mockReturnValue(false);
  mocks.useMcpConnection.mockReturnValue({
    mcpStatus: "connected",
    mcpError: null,
    mcpTools: [
      { id: "ppal-connect", name: "Connect to Ableton" },
      { id: "ppal-read-live-set", name: "Read Live Set" },
    ],
    checkMcpConnection: vi.fn(),
  });
  mocks.useUpdateCheck.mockReturnValue(null);
  mocks.useVoicePersistence.mockReturnValue(basePersistence());
  mocks.useConversationTransfer.mockReturnValue({
    notification: null,
    dismissNotification: vi.fn(),
    handleExport: vi.fn(),
    handleExportOne: vi.fn(),
    handleImport: vi.fn(),
  });
});

afterEach(() => {
  mocks.loadProviderSettings.mockReset();
  mocks.loadEnabledTools.mockReset();
  mocks.getMcpUrl.mockReset();
  mocks.useVoiceSession.mockReset();
  mocks.isFirefox.mockReset();
  mocks.useMcpConnection.mockReset();
  mocks.useUpdateCheck.mockReset();
  mocks.useVoicePersistence.mockReset();
  mocks.useConversationTransfer.mockReset();
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

  it("renders Restart and Listening indicator when connected, click calls disconnect()", () => {
    const session = baseSession({ status: "connected" });

    mocks.useVoiceSession.mockReturnValue(session);

    render(<VoiceApp />);

    const restart = screen.getByRole("button", { name: "Restart" });

    fireEvent.click(restart);
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

  describe("transcript rendering", () => {
    it("shows the empty-state placeholder when history is empty", () => {
      mocks.useVoiceSession.mockReturnValue(baseSession());

      render(<VoiceApp />);

      expect(
        screen.getByText(
          /conversation will appear here once you start talking/i,
        ),
      ).toBeDefined();
      expect(screen.queryByTestId("message-list")).toBeNull();
    });

    it("renders the chat MessageList when history has items", () => {
      const history: RealtimeItem[] = [
        {
          itemId: "u1",
          type: "message",
          role: "user",
          status: "completed",
          content: [{ type: "input_audio", transcript: "hello pal" }],
        },
        {
          itemId: "a1",
          type: "message",
          role: "assistant",
          status: "completed",
          content: [{ type: "output_audio", transcript: "hi there" }],
        },
      ];

      mocks.useVoiceSession.mockReturnValue(
        baseSession({ status: "connected", history }),
      );

      render(<VoiceApp />);

      expect(screen.getByTestId("message-list")).toBeDefined();
      expect(screen.getByText("hello pal")).toBeDefined();
      expect(screen.getByText("hi there")).toBeDefined();
      expect(screen.queryByText(/conversation will appear here/i)).toBeNull();
    });

    it("clicking Edit and Save on a transcribed user message resolves the voice no-op handler", async () => {
      const history: RealtimeItem[] = [
        {
          itemId: "u1",
          type: "message",
          role: "user",
          status: "completed",
          content: [{ type: "input_audio", transcript: "rename track 1" }],
        },
        {
          itemId: "a1",
          type: "message",
          role: "assistant",
          status: "completed",
          content: [{ type: "output_audio", transcript: "done" }],
        },
      ];

      mocks.useVoiceSession.mockReturnValue(
        baseSession({ status: "connected", history }),
      );

      render(<VoiceApp />);

      fireEvent.click(screen.getByLabelText(/edit message/i));
      // Save & Send commits via the voice no-op edit handler (returns void Promise)
      await act(async () => {
        fireEvent.click(screen.getByRole("button", { name: /save & send/i }));
      });

      // Editor closes after save — original message text re-appears in display mode
      expect(screen.getByText("rename track 1")).toBeDefined();
    });

    it("clicking Retry on an assistant bubble invokes the voice no-op retry handler", async () => {
      const history: RealtimeItem[] = [
        {
          itemId: "u1",
          type: "message",
          role: "user",
          status: "completed",
          content: [{ type: "input_audio", transcript: "do it" }],
        },
        {
          itemId: "a1",
          type: "message",
          role: "assistant",
          status: "completed",
          content: [{ type: "output_audio", transcript: "ok" }],
        },
      ];

      mocks.useVoiceSession.mockReturnValue(
        baseSession({ status: "connected", history }),
      );

      render(<VoiceApp />);

      const retryBtn = screen.getByRole("button", { name: /retry/i });

      await act(async () => {
        fireEvent.click(retryBtn);
      });

      // No throw — handler resolves silently. Bubble still rendered.
      expect(screen.getByText("ok")).toBeDefined();
    });
  });

  describe("AppShell integration", () => {
    it("renders the shared chat header with the GPT Realtime model name", () => {
      mocks.useVoiceSession.mockReturnValue(baseSession());

      render(<VoiceApp />);

      expect(screen.getByTitle(/producer pal website/i)).toBeDefined();
      expect(screen.getByText(/gpt realtime/i)).toBeDefined();
    });

    it("renders header tool counts as 0 when the MCP tools list is unavailable", () => {
      mocks.useMcpConnection.mockReturnValue({
        mcpStatus: "connecting",
        mcpError: null,
        mcpTools: null,
        checkMcpConnection: vi.fn(),
      });
      mocks.useVoiceSession.mockReturnValue(baseSession());

      render(<VoiceApp />);

      // Page renders without throwing — counts fall back to 0
      expect(screen.getByTitle(/producer pal website/i)).toBeDefined();
    });

    it("toggles the conversation panel open via the header button", () => {
      mocks.useVoiceSession.mockReturnValue(baseSession());

      const { container } = render(<VoiceApp />);

      const toggleBtn = screen.getByLabelText(/toggle conversation history/i);

      // Panel sits in a wrapper whose horizontal-size classes flip with isOpen
      // — w-0 collapsed → w-full expanded. Toggling once must expand it.
      const findPanel = () =>
        container.querySelector('[class*="basis-0"]') ??
        container.querySelector('[class*="basis-64"]');

      expect(findPanel()?.className).toContain("w-0");
      fireEvent.click(toggleBtn);
      expect(findPanel()?.className).toContain("w-full");
    });

    it("wires the conversation sidebar buttons to persistence + transfer", () => {
      const persistence = basePersistence();
      const transfer = {
        notification: null,
        dismissNotification: vi.fn(),
        handleExport: vi.fn(),
        handleExportOne: vi.fn(),
        handleImport: vi.fn(),
      };

      mocks.useVoiceSession.mockReturnValue(baseSession());
      mocks.useVoicePersistence.mockReturnValue(persistence);
      mocks.useConversationTransfer.mockReturnValue(transfer);

      render(<VoiceApp />);

      fireEvent.click(screen.getByLabelText(/toggle conversation history/i));
      fireEvent.click(screen.getByText(/new conversation/i));
      fireEvent.click(screen.getByLabelText(/export conversations/i));
      fireEvent.click(screen.getByLabelText(/import conversations/i));

      expect(persistence.startNewConversation).toHaveBeenCalled();
      expect(transfer.handleExport).toHaveBeenCalled();
      expect(transfer.handleImport).toHaveBeenCalled();
    });

    it("disconnects an active session and clears state when New Conversation is clicked", () => {
      const persistence = basePersistence();
      const session = baseSession({ status: "connected" });

      mocks.useVoiceSession.mockReturnValue(session);
      mocks.useVoicePersistence.mockReturnValue(persistence);

      render(<VoiceApp />);
      fireEvent.click(screen.getByLabelText(/toggle conversation history/i));
      fireEvent.click(screen.getByText(/new conversation/i));

      expect(session.disconnect).toHaveBeenCalled();
      expect(persistence.startNewConversation).toHaveBeenCalled();
    });

    it("renders saved voice items when there is no live history", () => {
      const savedItems = [
        {
          itemId: "u1",
          type: "message",
          role: "user",
          status: "completed",
          content: [{ type: "input_audio", transcript: "from saved record" }],
        },
      ] as unknown as RealtimeItem[];

      mocks.useVoiceSession.mockReturnValue(baseSession());
      mocks.useVoicePersistence.mockReturnValue(
        basePersistence({
          savedItems,
          activeConversationId: "saved-id",
        }),
      );

      render(<VoiceApp />);

      expect(screen.getByText("from saved record")).toBeDefined();
    });

    it("clearing the saved transcript when starting a new live session via Talk", () => {
      const persistence = basePersistence();
      const session = baseSession();

      mocks.useVoiceSession.mockReturnValue(session);
      mocks.useVoicePersistence.mockReturnValue(persistence);

      render(<VoiceApp />);
      fireEvent.click(screen.getByRole("button", { name: "Talk" }));

      expect(persistence.startNewConversation).toHaveBeenCalled();
      expect(session.connect).toHaveBeenCalled();
    });

    it("opens chat when the settings button is clicked", () => {
      mocks.useVoiceSession.mockReturnValue(baseSession());
      const originalHref = window.location.href;
      const setHref = vi.fn();

      Object.defineProperty(window.location, "href", {
        configurable: true,
        get: () => originalHref,
        set: setHref,
      });

      try {
        render(<VoiceApp />);
        fireEvent.click(screen.getByLabelText("Settings"));
        expect(setHref).toHaveBeenCalledWith("/chat");
      } finally {
        Object.defineProperty(window.location, "href", {
          configurable: true,
          value: originalHref,
          writable: true,
        });
      }
    });

    it("wires per-conversation sidebar item handlers (select/delete/rename/bookmark)", () => {
      const summary = createTestSummary({
        id: "voice-conv-1",
        title: "Voice Chat",
        sessionType: "voice",
      });
      const persistence = basePersistence({ conversations: [summary] });

      mocks.useVoiceSession.mockReturnValue(baseSession());
      mocks.useVoicePersistence.mockReturnValue(persistence);

      render(<VoiceApp />);
      fireEvent.click(screen.getByLabelText(/toggle conversation history/i));

      fireEvent.click(screen.getByText("Voice Chat"));
      expect(persistence.switchConversation).toHaveBeenCalledWith(
        "voice-conv-1",
      );

      // Header also renders a (disabled) "Bookmark conversation" button —
      // the per-item one is the last match in document order.
      const bookmarkButtons = screen.getAllByLabelText(
        /^bookmark conversation$/i,
      );

      fireEvent.click(bookmarkButtons.at(-1) as Element);
      expect(persistence.toggleBookmark).toHaveBeenCalledWith("voice-conv-1");

      fireEvent.click(screen.getByLabelText(/^rename conversation$/i));
      const renameInput = screen.getByDisplayValue("Voice Chat");

      fireEvent.input(renameInput, { target: { value: "Renamed Chat" } });
      fireEvent.blur(renameInput);
      expect(persistence.renameConversation).toHaveBeenCalledWith(
        "voice-conv-1",
        "Renamed Chat",
      );

      fireEvent.click(screen.getByLabelText(/^delete conversation$/i));
      expect(persistence.deleteConversation).toHaveBeenCalledWith(
        "voice-conv-1",
      );
    });

    it("disconnects an active session when selecting a different conversation", () => {
      const summary = createTestSummary({
        id: "other-conv",
        title: "Other",
        sessionType: "voice",
      });
      const persistence = basePersistence({ conversations: [summary] });
      const session = baseSession({ status: "connected" });

      mocks.useVoiceSession.mockReturnValue(session);
      mocks.useVoicePersistence.mockReturnValue(persistence);

      render(<VoiceApp />);
      fireEvent.click(screen.getByLabelText(/toggle conversation history/i));
      fireEvent.click(screen.getByText("Other"));

      expect(session.disconnect).toHaveBeenCalled();
      expect(persistence.switchConversation).toHaveBeenCalledWith("other-conv");
    });
  });
});
