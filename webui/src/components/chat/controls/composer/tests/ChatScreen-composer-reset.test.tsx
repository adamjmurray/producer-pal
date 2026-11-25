// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

/**
 * @vitest-environment happy-dom
 */
import { EditorView } from "@codemirror/view";
import { act, fireEvent, render, screen } from "@testing-library/preact";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ChatScreen } from "#webui/components/chat/ChatScreen";
import { type HeaderInfo } from "#webui/components/chat/controls/header/HeaderActions";
import { conversationPanelProps } from "#webui/components/chat/tests/conversation-panel-props";
import { deferSelectionChange } from "#webui/test-utils/dom-test-helpers";

vi.mock(import("#webui/hooks/connection/use-remote-script-notice"), () => ({
  useRemoteScriptNotice: () => null,
}));

vi.mock(import("#webui/hooks/connection/use-update-check"), () => ({
  useUpdateCheck: () => ({ update: null, dismissUpdate: () => {} }),
}));

const headerInfo: HeaderInfo = {
  activeModel: "m",
  activeProvider: "gemini",
  model: "m",
  provider: "gemini",
  enabledToolsCount: 1,
  totalToolsCount: 1,
  defaultToolsCount: 1,
  smallModelMode: false,
  defaultSmallModelMode: false,
  showHelpLinks: true,
};

const props = {
  messages: [],
  isAssistantResponding: false,
  rateLimitState: null,
  toolLimitReached: false,
  chatSetUp: true,
  handleSend: vi.fn(),
  enqueueMessage: vi.fn(),
  queuedMessages: [],
  onRemoveQueued: vi.fn(),
  handleRetry: vi.fn(),
  handleEdit: vi.fn(),
  headerInfo,
  activeThinking: null,
  defaultThinking: "Default",
  mcpStatus: "connected" as const,
  mcpError: null,
  checkMcpConnection: vi.fn(),
  onOpenSettings: vi.fn(),
  onOpenToolsSettings: vi.fn(),
  onOpenConnectionSettings: vi.fn(),
  onOpenInstallationSettings: vi.fn(),
  onOpenContext: vi.fn(),
  onOpenInstructions: vi.fn(),
  onStop: vi.fn(),
  showTimestamps: true,
  showTokenUsage: false,
  conversationPanel: {
    ...conversationPanelProps(),
    conversations: [],
    isOpen: false,
    onToggle: vi.fn(),
    onNew: vi.fn(),
  },
};

const editor = (): HTMLElement => screen.getByRole("textbox");

/**
 * The composer's current text.
 * @returns The editor document
 */
function draft(): string {
  return EditorView.findFromDOM(
    document.querySelector(".cm-editor")!,
  )!.state.doc.toString();
}

/**
 * Paste a PNG into the composer.
 */
function pasteImage(): void {
  fireEvent.paste(editor(), {
    clipboardData: {
      files: [new File(["xy"], "shot.png", { type: "image/png" })],
      getData: () => "",
    },
  });
}

beforeEach(deferSelectionChange);

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("ChatScreen composer across conversations", () => {
  it("drops the draft and attached images when the conversation changes", async () => {
    vi.stubGlobal(
      "createImageBitmap",
      vi.fn().mockResolvedValue({ width: 8, height: 8, close: vi.fn() }),
    );
    const { rerender } = render(
      <ChatScreen {...props} conversationEpoch={0} />,
    );

    void act(() => {
      const view = EditorView.findFromDOM(
        document.querySelector(".cm-editor")!,
      )!;

      view.dispatch({ changes: { from: 0, insert: "half a thought" } });
    });
    pasteImage();
    await screen.findByAltText("Attachment 1");

    // Same conversation: nothing is touched.
    rerender(<ChatScreen {...props} conversationEpoch={0} />);
    expect(draft()).toBe("half a thought");
    expect(screen.queryByAltText("Attachment 1")).not.toBeNull();

    rerender(<ChatScreen {...props} conversationEpoch={1} />);
    expect(draft()).toBe("");
    expect(screen.queryByAltText("Attachment 1")).toBeNull();
  });

  it("does not attach an image that finishes loading after a switch", async () => {
    let finishDecode: (bitmap: unknown) => void = () => {};

    vi.stubGlobal(
      "createImageBitmap",
      vi.fn(
        () =>
          new Promise((resolve) => {
            finishDecode = resolve;
          }),
      ),
    );
    const { rerender } = render(
      <ChatScreen {...props} conversationEpoch={0} />,
    );

    pasteImage();
    await screen.findByText("Adding image…");

    rerender(<ChatScreen {...props} conversationEpoch={1} />);
    expect(screen.queryByText("Adding image…")).toBeNull();

    await act(async () => {
      finishDecode({ width: 8, height: 8, close: vi.fn() });
      await new Promise((resolve) => setTimeout(resolve, 20));
    });

    expect(screen.queryByAltText("Attachment 1")).toBeNull();
    expect(screen.queryByText("Adding image…")).toBeNull();
  });
});
