// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * @vitest-environment happy-dom
 */
import { EditorView } from "@codemirror/view";
import { act, render, screen, fireEvent } from "@testing-library/preact";
import { describe, expect, it, vi } from "vitest";
import { ChatInput } from "#webui/components/chat/controls/ChatInput";

/**
 * The chat input's live CodeMirror view.
 * @returns The view
 */
function editorView(): EditorView {
  return EditorView.findFromDOM(document.querySelector(".cm-editor")!)!;
}

/**
 * Replace the chat input's text. happy-dom can't type into a contenteditable,
 * so this dispatches the doc change a keystroke would.
 * @param text - The new text
 */
function typeInput(text: string): void {
  void act(() => {
    const view = editorView();

    view.dispatch({
      changes: { from: 0, to: view.state.doc.length, insert: text },
      selection: { anchor: text.length },
    });
  });
}

/**
 * Press Enter (or Shift+Enter) in the chat input.
 * @param shiftKey - Hold Shift
 */
function pressEnter(shiftKey = false): void {
  fireEvent.keyDown(editorView().contentDOM, { key: "Enter", shiftKey });
}

/**
 * The chat input's placeholder text.
 * @returns The placeholder, or null when hidden
 */
function placeholderText(): string | null {
  return document.querySelector(".cm-placeholder")?.textContent ?? null;
}

const defaultProps = {
  handleSend: vi.fn(),
  onEnqueue: vi.fn(),
  isAssistantResponding: false,
  hasError: false,
  onStop: vi.fn(),
  thinking: "Default",
  onThinkingChange: vi.fn(),
};

describe("ChatInput", () => {
  describe("rendering", () => {
    it("renders a labelled markdown editor", () => {
      render(<ChatInput {...defaultProps} />);
      expect(screen.getByRole("textbox", { name: "Message" })).toBeDefined();
    });

    it("renders Send button when not responding", () => {
      render(<ChatInput {...defaultProps} />);
      expect(screen.getByRole("button", { name: "Send" })).toBeDefined();
    });

    it("renders Queue button when responding", () => {
      render(<ChatInput {...defaultProps} isAssistantResponding={true} />);
      expect(screen.getByRole("button", { name: "Queue" })).toBeDefined();
    });

    it("shows placeholder text", () => {
      render(<ChatInput {...defaultProps} />);

      expect(placeholderText()).toBe(
        "Type a message... (Shift+Enter for new line)",
      );
    });

    it("shows error placeholder when hasError", () => {
      render(<ChatInput {...defaultProps} hasError={true} />);

      expect(placeholderText()).toBe("Retry or edit a message to continue...");
    });

    it("shows thinking toggle when not responding", () => {
      render(<ChatInput {...defaultProps} />);
      expect(
        screen.getByRole("button", { name: /Thinking level/ }),
      ).toBeDefined();
    });

    it("hides thinking toggle when responding", () => {
      render(<ChatInput {...defaultProps} isAssistantResponding={true} />);
      expect(
        screen.queryByRole("button", { name: /Thinking level/ }),
      ).toBeNull();
    });

    it("shows Stop button when responding", () => {
      render(<ChatInput {...defaultProps} isAssistantResponding={true} />);
      expect(screen.getByRole("button", { name: "Stop" })).toBeDefined();
    });

    it("hides Stop button when not responding", () => {
      render(<ChatInput {...defaultProps} />);
      expect(screen.queryByRole("button", { name: "Stop" })).toBeNull();
    });
  });

  describe("input handling", () => {
    it("shows typed text in the editor", () => {
      render(<ChatInput {...defaultProps} />);

      typeInput("Hello");

      expect(screen.getByRole("textbox").textContent).toContain("Hello");
    });

    it("Shift+Enter inserts a newline instead of sending", () => {
      const handleSend = vi.fn();

      render(<ChatInput {...defaultProps} handleSend={handleSend} />);
      typeInput("Hello");
      pressEnter(true);

      expect(handleSend).not.toHaveBeenCalled();
      expect(editorView().state.doc.toString()).toBe("Hello\n");
    });
  });

  describe("send button", () => {
    it.each([
      {
        name: "empty input",
        inputValue: undefined,
        isResponding: false,
        hasError: false,
        buttonName: "Send",
      },
      {
        name: "whitespace only",
        inputValue: "   ",
        isResponding: false,
        hasError: false,
        buttonName: "Send",
      },
      {
        name: "empty input while responding",
        inputValue: undefined,
        isResponding: true,
        hasError: false,
        buttonName: "Queue",
      },
      {
        name: "conversation has error",
        inputValue: "Hello",
        isResponding: false,
        hasError: true,
        buttonName: "Send",
      },
    ])(
      "is disabled when $name",
      ({ inputValue, isResponding, hasError, buttonName }) => {
        render(
          <ChatInput
            {...defaultProps}
            isAssistantResponding={isResponding}
            hasError={hasError}
          />,
        );

        if (inputValue !== undefined) typeInput(inputValue);

        const button = screen.getByRole("button", {
          name: buttonName,
        }) as HTMLButtonElement;

        expect(button.disabled).toBe(true);
      },
    );

    it("is enabled with content while responding (for queuing)", () => {
      render(<ChatInput {...defaultProps} isAssistantResponding={true} />);

      typeInput("Hello");

      const button = screen.getByRole("button", {
        name: "Queue",
      }) as HTMLButtonElement;

      expect(button.disabled).toBe(false);
    });

    it("is enabled when input has content", () => {
      render(<ChatInput {...defaultProps} />);

      typeInput("Hello");

      const button = screen.getByRole("button", {
        name: "Send",
      }) as HTMLButtonElement;

      expect(button.disabled).toBe(false);
    });

    const sendTriggers = [
      [
        "button click",
        () => fireEvent.click(screen.getByRole("button", { name: "Send" })),
      ],
      ["Enter key", () => pressEnter()],
    ] as const;

    it.each(sendTriggers)("sends message via %s", (_method, triggerSend) => {
      const handleSend = vi.fn();

      render(<ChatInput {...defaultProps} handleSend={handleSend} />);

      typeInput("Hello");
      triggerSend();
      expect(handleSend).toHaveBeenCalledExactlyOnceWith("Hello", {
        thinking: "Default",
      });
    });

    it.each(sendTriggers)(
      "clears input after %s send without dropping focus",
      (_method, triggerSend) => {
        render(<ChatInput {...defaultProps} />);
        const view = editorView();

        typeInput("Hello");
        view.focus();
        triggerSend();
        expect(view.state.doc.toString()).toBe("");
        expect(view.hasFocus).toBe(true);
        expect(
          (screen.getByRole("button", { name: "Send" }) as HTMLButtonElement)
            .disabled,
        ).toBe(true);
      },
    );
  });

  describe("Enter key handling", () => {
    it.each([
      {
        name: "Shift+Enter",
        inputValue: "Hello",
        shiftKey: true,
        isResponding: false,
      },
      {
        name: "empty input",
        inputValue: undefined,
        shiftKey: false,
        isResponding: false,
      },
      {
        name: "whitespace only",
        inputValue: "   ",
        shiftKey: false,
        isResponding: false,
      },
    ])(
      "does not send on Enter when $name",
      ({ inputValue, shiftKey, isResponding }) => {
        const handleSend = vi.fn();

        render(
          <ChatInput
            {...defaultProps}
            handleSend={handleSend}
            isAssistantResponding={isResponding}
          />,
        );

        if (inputValue !== undefined) typeInput(inputValue);

        pressEnter(shiftKey);

        expect(handleSend).not.toHaveBeenCalled();
      },
    );

    it("enqueues on Enter when assistant is responding", () => {
      const onEnqueue = vi.fn();

      render(
        <ChatInput
          {...defaultProps}
          onEnqueue={onEnqueue}
          isAssistantResponding={true}
        />,
      );

      typeInput("Follow up");
      pressEnter();

      expect(onEnqueue).toHaveBeenCalledExactlyOnceWith("Follow up", {
        thinking: "Default",
      });
    });
  });

  describe("compaction", () => {
    it("shows the compacting placeholder while compacting", () => {
      render(<ChatInput {...defaultProps} isCompacting={true} />);

      expect(placeholderText()).toBe("Compacting…");
    });

    it("disables the editor while compacting", () => {
      render(<ChatInput {...defaultProps} isCompacting={true} />);

      expect(screen.getByRole("textbox").getAttribute("contenteditable")).toBe(
        "false",
      );
    });

    it("disables Send while compacting even with content", () => {
      render(<ChatInput {...defaultProps} isCompacting={true} />);

      typeInput("Hello");

      expect(
        (screen.getByRole("button", { name: "Send" }) as HTMLButtonElement)
          .disabled,
      ).toBe(true);
    });

    it("hides Stop while compacting since compaction can't be canceled", () => {
      render(
        <ChatInput
          {...defaultProps}
          isAssistantResponding={true}
          isCompacting={true}
        />,
      );

      expect(screen.queryByRole("button", { name: "Stop" })).toBeNull();
      expect(
        screen.getByRole("button", { name: /Thinking level/ }),
      ).toBeDefined();
    });

    it("does not send or enqueue on Enter while compacting (no silent drop)", () => {
      const handleSend = vi.fn();
      const onEnqueue = vi.fn();

      render(
        <ChatInput
          {...defaultProps}
          handleSend={handleSend}
          onEnqueue={onEnqueue}
          isCompacting={true}
        />,
      );

      typeInput("Hello");
      pressEnter();

      expect(handleSend).not.toHaveBeenCalled();
      expect(onEnqueue).not.toHaveBeenCalled();
    });
  });

  describe("thinking toggle", () => {
    it("calls onThinkingChange with next level when button is clicked", () => {
      const onThinkingChange = vi.fn();

      render(
        <ChatInput {...defaultProps} onThinkingChange={onThinkingChange} />,
      );

      fireEvent.click(screen.getByRole("button", { name: /Thinking level/ }));

      // Default → Max is the first cycle step
      expect(onThinkingChange).toHaveBeenCalledWith("Max");
    });
  });
});
