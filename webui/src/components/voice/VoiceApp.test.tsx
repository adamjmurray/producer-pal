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

const mocks = vi.hoisted(() => ({
  getMcpUrl: vi.fn(),
  useVoiceSession: vi.fn(),
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

vi.mock(import("#webui/hooks/use-update-check"), () => ({
  useUpdateCheck: mocks.useUpdateCheck,
}));

vi.mock(import("#webui/hooks/voice/use-voice-persistence"), () => ({
  useVoicePersistence: mocks.useVoicePersistence,
}));

vi.mock(import("#webui/hooks/chat/use-conversation-transfer"), () => ({
  useConversationTransfer: mocks.useConversationTransfer,
}));

import { type ModeContext } from "#webui/components/mode-context";
import { type ConversationSummary } from "#webui/lib/conversation-db";
import { createTestSummary } from "#webui/test-utils/conversation-test-helpers";
import { type UseSettingsReturn } from "#webui/types/settings";
import { VoiceApp, type VoiceAppProps } from "./VoiceApp";

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
  resetHistory: ReturnType<typeof vi.fn>;
  activeVoice: string | null;
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
    resetHistory: vi.fn(),
    activeVoice: null,
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
  deleteAllConversations: ReturnType<typeof vi.fn>;
  deleteUnbookmarkedConversations: ReturnType<typeof vi.fn>;
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
    deleteAllConversations: vi.fn(),
    deleteUnbookmarkedConversations: vi.fn(),
    renameConversation: vi.fn(),
    toggleBookmark: vi.fn(),
    ...overrides,
  };
}

interface PropOverrides {
  apiKey?: string;
  provider?: "openai" | "anthropic";
  onOpenSettings?: () => void;
  savedRealtimeVoice?: string;
}

// vi.fn() returns a Mock that includes a Constructable signature, which TS
// refuses to assign to a plain `() => void` parameter. Cast the result so
// the JSX spread typechecks against VoiceAppProps.
function makeProps(o: PropOverrides = {}): VoiceAppProps {
  const apiKey = o.apiKey ?? "sk-test";
  const provider = o.provider ?? "openai";

  return {
    settings: {
      provider,
      apiKey,
      model: "gpt-realtime-2",
      enabledTools: {},
      savedRealtimeVoice: o.savedRealtimeVoice ?? "marin",
    } as unknown as UseSettingsReturn,
    display: {
      showTimestamps: false,
      showHelpLinks: false,
      showTokenUsage: false,
      setShowTimestamps: vi.fn(),
      setShowHelpLinks: vi.fn(),
      setShowTokenUsage: vi.fn(),
    },
    viewState: {
      historyPanelOpen: false,
      settingsOpen: false,
      settingsTab: "connection",
    },
    setViewState: vi.fn(),
    mcpStatus: "connected",
    totalToolsCount: 2,
    enabledToolsCount: 2,
    onOpenSettings: o.onOpenSettings ?? vi.fn(),
    onOpenToolsSettings: vi.fn(),
    onOpenConnectionSettings: vi.fn(),
    onForeignRecord: vi.fn(),
    setModeContext: vi.fn(),
  } as unknown as VoiceAppProps;
}

function renderVoiceApp(overrides: PropOverrides = {}) {
  return render(<VoiceApp {...makeProps(overrides)} />);
}

beforeEach(() => {
  mocks.getMcpUrl.mockReturnValue("http://localhost:3350/mcp");
  mocks.isFirefox.mockReturnValue(false);
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
  mocks.getMcpUrl.mockReset();
  mocks.useVoiceSession.mockReset();
  mocks.isFirefox.mockReset();
  mocks.useUpdateCheck.mockReset();
  mocks.useVoicePersistence.mockReset();
  mocks.useConversationTransfer.mockReset();
});

describe("VoiceApp", () => {
  it("shows the OpenAI-key-required banner when key is missing", () => {
    mocks.useVoiceSession.mockReturnValue(baseSession());

    renderVoiceApp({ apiKey: "" });

    expect(screen.getByText(/openai api key required/i)).toBeDefined();
  });

  it("hides the banner when an API key is configured", () => {
    mocks.useVoiceSession.mockReturnValue(baseSession());

    renderVoiceApp();

    expect(screen.queryByText(/openai api key required/i)).toBeNull();
  });

  it("shows the OpenAI-key-required banner when current provider is not openai", () => {
    mocks.useVoiceSession.mockReturnValue(baseSession());

    renderVoiceApp({ provider: "anthropic", apiKey: "sk-ant" });

    expect(screen.getByText(/openai api key required/i)).toBeDefined();
  });

  it("renders the Talk button when idle and clicking it calls connect()", () => {
    const session = baseSession();

    mocks.useVoiceSession.mockReturnValue(session);

    renderVoiceApp();

    fireEvent.click(screen.getByRole("button", { name: "Talk" }));
    expect(session.connect).toHaveBeenCalledOnce();
  });

  it("renders Stop and Listening indicator when connected, click calls disconnect()", () => {
    const session = baseSession({ status: "connected" });

    mocks.useVoiceSession.mockReturnValue(session);

    renderVoiceApp();

    fireEvent.click(screen.getByRole("button", { name: "Stop" }));
    expect(session.disconnect).toHaveBeenCalledOnce();
    expect(screen.getByText(/listening/i)).toBeDefined();
  });

  it("disables the main button (and shows ...) when busy connecting", () => {
    mocks.useVoiceSession.mockReturnValue(
      baseSession({ status: "connecting" }),
    );

    renderVoiceApp();

    const btn = screen.getByRole("button", { name: "..." });

    expect((btn as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText(/connecting/i)).toBeDefined();
  });

  it("disables the main button when no OpenAI key is configured", () => {
    mocks.useVoiceSession.mockReturnValue(baseSession());

    renderVoiceApp({ apiKey: "" });

    const btn = screen.getByRole("button", { name: "Talk" });

    expect((btn as HTMLButtonElement).disabled).toBe(true);
  });

  it("shows the Interrupt button while assistant is speaking, click calls interrupt()", () => {
    const session = baseSession({
      status: "connected",
      assistantSpeaking: true,
    });

    mocks.useVoiceSession.mockReturnValue(session);

    renderVoiceApp();

    fireEvent.click(screen.getByRole("button", { name: "Interrupt" }));
    expect(session.interrupt).toHaveBeenCalledOnce();
  });

  it("shows the Interrupt button while the assistant is thinking", () => {
    mocks.useVoiceSession.mockReturnValue(
      baseSession({ status: "connected", assistantThinking: true }),
    );

    renderVoiceApp();

    expect(screen.getByRole("button", { name: "Interrupt" })).toBeDefined();
    expect(screen.getByText(/thinking/i)).toBeDefined();
  });

  it("shows Mute (and Unmute label when muted) instead of Interrupt when idle-listening", () => {
    const session = baseSession({ status: "connected" });

    mocks.useVoiceSession.mockReturnValue(session);
    const { rerender } = renderVoiceApp();

    fireEvent.click(screen.getByRole("button", { name: "Mute" }));
    expect(session.toggleMute).toHaveBeenCalledOnce();

    mocks.useVoiceSession.mockReturnValue(
      baseSession({ status: "connected", isMuted: true }),
    );
    rerender(<VoiceApp {...makeProps()} />);
    expect(screen.getByRole("button", { name: "Unmute" })).toBeDefined();
  });

  it("renders the error banner with the message and a retry control when rate-limited", () => {
    mocks.useVoiceSession.mockReturnValue(
      baseSession({
        status: "connected",
        error: "Rate limit exceeded. Please try again in 5s.",
        rateLimitedUntil: Date.now() - 1000,
      }),
    );

    renderVoiceApp();

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

    renderVoiceApp();

    expect(
      (screen.getByRole("button", { name: "Retry" }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
    expect(screen.getByText(/retry available in/i)).toBeDefined();
  });

  it("clicking Retry while ready calls retryResponse()", () => {
    const session = baseSession({
      status: "connected",
      error: "Rate limit exceeded. Please try again in 0s.",
      rateLimitedUntil: Date.now() - 1000,
    });

    mocks.useVoiceSession.mockReturnValue(session);

    renderVoiceApp();

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
      renderVoiceApp();
      const retryBtn = screen.getByRole("button", {
        name: "Retry",
      }) as HTMLButtonElement;

      expect(retryBtn.disabled).toBe(true);

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

    renderVoiceApp();

    expect(screen.getAllByText(/error/i).length).toBeGreaterThan(0);
  });

  it("status pill renders 'Disconnecting' label during teardown", () => {
    mocks.useVoiceSession.mockReturnValue(
      baseSession({ status: "disconnecting" }),
    );

    renderVoiceApp();

    expect(screen.getByText(/disconnecting/i)).toBeDefined();
  });

  it("status pill renders 'Muted' when user mutes the mic while connected", () => {
    mocks.useVoiceSession.mockReturnValue(
      baseSession({ status: "connected", isMuted: true }),
    );

    renderVoiceApp();

    expect(screen.getByText(/muted/i)).toBeDefined();
  });

  it("Voice label reflects the saved preference while idle", () => {
    mocks.useVoiceSession.mockReturnValue(baseSession());
    renderVoiceApp({ savedRealtimeVoice: "cedar" });

    expect(screen.getByText(/voice: cedar/i)).toBeDefined();
  });

  it("Voice label highlights when the live session diverges from the saved voice", () => {
    mocks.useVoiceSession.mockReturnValue(
      baseSession({ status: "connected", activeVoice: "marin" }),
    );

    renderVoiceApp({ savedRealtimeVoice: "cedar" });

    const label = screen.getByText(/voice: marin/i);

    expect(label.className).toMatch(/amber/);
    expect(label.getAttribute("title")).toMatch(/applies on next session/i);
  });

  it("shows the Firefox-unsupported banner when running in Firefox", () => {
    mocks.isFirefox.mockReturnValue(true);
    mocks.useVoiceSession.mockReturnValue(baseSession());

    renderVoiceApp();

    expect(screen.getByText(/firefox is not supported/i)).toBeDefined();
  });

  it("disables the Talk button when running in Firefox", () => {
    mocks.isFirefox.mockReturnValue(true);
    mocks.useVoiceSession.mockReturnValue(baseSession());

    renderVoiceApp();

    const btn = screen.getByRole("button", { name: "Talk" });

    expect((btn as HTMLButtonElement).disabled).toBe(true);
  });

  it("hides the Firefox banner in Chrome (or other non-Firefox browsers)", () => {
    mocks.useVoiceSession.mockReturnValue(baseSession());

    renderVoiceApp();

    expect(screen.queryByText(/firefox is not supported/i)).toBeNull();
  });

  describe("transcript rendering", () => {
    it("shows the empty-state placeholder when history is empty", () => {
      mocks.useVoiceSession.mockReturnValue(baseSession());

      renderVoiceApp();

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

      renderVoiceApp();

      expect(screen.getByTestId("message-list")).toBeDefined();
      expect(screen.getByText("hello pal")).toBeDefined();
      expect(screen.getByText("hi there")).toBeDefined();
      expect(screen.queryByText(/conversation will appear here/i)).toBeNull();
    });
  });

  describe("AppShell integration", () => {
    it("renders the shared chat header with the GPT Realtime model name", () => {
      mocks.useVoiceSession.mockReturnValue(baseSession());

      renderVoiceApp();

      expect(screen.getByTitle(/producer pal website/i)).toBeDefined();
      expect(screen.getByText(/gpt realtime/i)).toBeDefined();
    });

    it("opens settings via onOpenSettings callback when the settings button is clicked", () => {
      mocks.useVoiceSession.mockReturnValue(baseSession());
      const onOpenSettings = vi.fn();

      renderVoiceApp({ onOpenSettings });
      fireEvent.click(screen.getByLabelText("Settings"));
      expect(onOpenSettings).toHaveBeenCalled();
    });

    it("toggles the conversation panel via the header button", () => {
      mocks.useVoiceSession.mockReturnValue(baseSession());
      const props = makeProps();

      render(<VoiceApp {...props} />);
      fireEvent.click(screen.getByLabelText(/toggle conversation history/i));
      expect(props.setViewState).toHaveBeenCalledWith({
        historyPanelOpen: true,
      });
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
      const props = makeProps();
      const propsWithOpen = {
        ...props,
        viewState: { ...props.viewState, historyPanelOpen: true },
      };

      render(<VoiceApp {...propsWithOpen} />);
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
      const props = makeProps();
      const propsWithOpen = {
        ...props,
        viewState: { ...props.viewState, historyPanelOpen: true },
      };

      render(<VoiceApp {...propsWithOpen} />);
      fireEvent.click(screen.getByText(/new conversation/i));

      expect(session.disconnect).toHaveBeenCalled();
      expect(session.resetHistory).toHaveBeenCalled();
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
        basePersistence({ savedItems, activeConversationId: "saved-id" }),
      );

      renderVoiceApp();

      expect(screen.getByText("from saved record")).toBeDefined();
    });

    it("Talk on a fresh page calls connect() with no seed and does not reset persistence", () => {
      const persistence = basePersistence();
      const session = baseSession();

      mocks.useVoiceSession.mockReturnValue(session);
      mocks.useVoicePersistence.mockReturnValue(persistence);

      renderVoiceApp();
      fireEvent.click(screen.getByRole("button", { name: "Talk" }));

      expect(persistence.startNewConversation).not.toHaveBeenCalled();
      expect(session.connect).toHaveBeenCalledWith(undefined);
    });

    it("Talk on a loaded voice conversation primes the new session with saved items", () => {
      const savedItems = [
        {
          itemId: "u1",
          type: "message",
          role: "user",
          status: "completed",
          content: [{ type: "input_audio", transcript: "from saved" }],
        },
      ] as unknown as RealtimeItem[];

      const session = baseSession();

      mocks.useVoiceSession.mockReturnValue(session);
      mocks.useVoicePersistence.mockReturnValue(
        basePersistence({ savedItems, activeConversationId: "saved-id" }),
      );

      renderVoiceApp();
      fireEvent.click(screen.getByRole("button", { name: "Talk" }));

      expect(session.connect).toHaveBeenCalledWith(savedItems);
    });

    it("merges saved record with live history so historical tool calls stay visible mid-session", () => {
      const savedItems = [
        {
          itemId: "u1",
          type: "message",
          role: "user",
          status: "completed",
          content: [{ type: "input_audio", transcript: "earlier turn" }],
        },
        {
          itemId: "fc1",
          type: "function_call",
          status: "completed",
          name: "ppal-read-track",
          arguments: "{}",
          output: '{"result":"ok"}',
        },
      ] as unknown as RealtimeItem[];

      const liveHistory = [
        {
          itemId: "u1",
          type: "message",
          role: "user",
          status: "completed",
          content: [{ type: "input_audio", transcript: "earlier turn" }],
        },
        {
          itemId: "a2",
          type: "message",
          role: "assistant",
          status: "completed",
          content: [{ type: "output_audio", transcript: "fresh assistant" }],
        },
      ] as unknown as RealtimeItem[];

      mocks.useVoiceSession.mockReturnValue(
        baseSession({ status: "connected", history: liveHistory }),
      );
      mocks.useVoicePersistence.mockReturnValue(
        basePersistence({ savedItems, activeConversationId: "saved-id" }),
      );

      renderVoiceApp();

      expect(screen.getAllByText(/ppal-read-track/i).length).toBeGreaterThan(0);
      expect(screen.getByText(/earlier turn/i)).toBeDefined();
      expect(screen.getByText(/fresh assistant/i)).toBeDefined();
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
      const props = makeProps();
      const propsWithOpen = {
        ...props,
        viewState: { ...props.viewState, historyPanelOpen: true },
      };

      render(<VoiceApp {...propsWithOpen} />);

      fireEvent.click(screen.getByText("Voice Chat"));
      expect(persistence.switchConversation).toHaveBeenCalledWith(
        "voice-conv-1",
      );

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
      const props = makeProps();
      const propsWithOpen = {
        ...props,
        viewState: { ...props.viewState, historyPanelOpen: true },
      };

      render(<VoiceApp {...propsWithOpen} />);
      fireEvent.click(screen.getByText("Other"));

      expect(session.disconnect).toHaveBeenCalled();
      expect(session.resetHistory).toHaveBeenCalled();
      expect(persistence.switchConversation).toHaveBeenCalledWith("other-conv");
    });

    it("reports its mode context (delete handlers + lock) up to App", () => {
      const persistence = basePersistence({ activeConversationId: "voice-1" });

      mocks.useVoiceSession.mockReturnValue(baseSession());
      mocks.useVoicePersistence.mockReturnValue(persistence);
      const props = makeProps();

      render(<VoiceApp {...props} />);

      const setModeContextMock = props.setModeContext as unknown as ReturnType<
        typeof vi.fn
      >;

      expect(setModeContextMock).toHaveBeenCalled();
      const ctx = setModeContextMock.mock.calls.at(-1)?.[0] as
        | ModeContext
        | undefined;

      expect(ctx?.conversationLock.activeModel).toBe("gpt-realtime-2");
      expect(ctx?.conversationLock.activeProvider).toBe("openai");
      // Delete handlers route through the persistence hook
      ctx?.onDeleteAllConversations();
      expect(persistence.deleteAllConversations).toHaveBeenCalled();
      ctx?.onDeleteUnbookmarkedConversations();
      expect(persistence.deleteUnbookmarkedConversations).toHaveBeenCalled();
    });
  });
});
