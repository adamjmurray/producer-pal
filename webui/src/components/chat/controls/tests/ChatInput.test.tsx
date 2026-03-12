// Producer Pal
// Copyright (C) 2026 Adam Murray
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * @vitest-environment happy-dom
 */
import { render, screen, fireEvent } from "@testing-library/preact";
import { describe, expect, it, vi } from "vitest";
import { ChatInput } from "#webui/components/chat/controls/ChatInput";

const defaultProps = {
  handleSend: vi.fn(),
  isAssistantResponding: false,
  onStop: vi.fn(),
  thinking: "Default",
  onThinkingChange: vi.fn(),
};

describe("ChatInput", () => {
  describe("rendering", () => {
    it("renders textarea", () => {
      render(<ChatInput {...defaultProps} />);
      expect(screen.getByRole("textbox")).toBeDefined();
    });

    it("renders Send button when not responding", () => {
      render(<ChatInput {...defaultProps} />);
      expect(screen.getByRole("button", { name: "Send" })).toBeDefined();
    });

    it("renders ... button when responding", () => {
      render(<ChatInput {...defaultProps} isAssistantResponding={true} />);
      expect(screen.getByRole("button", { name: "..." })).toBeDefined();
    });

    it("shows placeholder text", () => {
      render(<ChatInput {...defaultProps} />);
      const textarea = screen.getByRole("textbox");

      expect(textarea.getAttribute("placeholder")).toBe(
        "Type a message... (Shift+Enter for new line)",
      );
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
    it("updates input value when typing", () => {
      render(<ChatInput {...defaultProps} />);

      const textarea = screen.getByRole("textbox") as HTMLTextAreaElement;

      fireEvent.input(textarea, { target: { value: "Hello" } });

      expect(textarea.value).toBe("Hello");
    });
  });

  describe("send button", () => {
    it.each([
      {
        name: "empty input",
        inputValue: undefined,
        isResponding: false,
        buttonName: "Send",
      },
      {
        name: "assistant responding",
        inputValue: "Hello",
        isResponding: true,
        buttonName: "...",
      },
      {
        name: "whitespace only",
        inputValue: "   ",
        isResponding: false,
        buttonName: "Send",
      },
    ])("is disabled when $name", ({ inputValue, isResponding, buttonName }) => {
      render(
        <ChatInput {...defaultProps} isAssistantResponding={isResponding} />,
      );

      const textarea = screen.getByRole("textbox");

      if (inputValue !== undefined) {
        fireEvent.input(textarea, { target: { value: inputValue } });
      }

      const button = screen.getByRole("button", {
        name: buttonName,
      }) as HTMLButtonElement;

      expect(button.disabled).toBe(true);
    });

    it("is enabled when input has content", () => {
      render(<ChatInput {...defaultProps} />);

      const textarea = screen.getByRole("textbox");

      fireEvent.input(textarea, { target: { value: "Hello" } });

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
      [
        "Enter key",
        (el: HTMLElement) =>
          fireEvent.keyDown(el, { key: "Enter", shiftKey: false }),
      ],
    ] as const;

    it.each(sendTriggers)("sends message via %s", (_method, triggerSend) => {
      const handleSend = vi.fn();

      render(<ChatInput {...defaultProps} handleSend={handleSend} />);
      const textarea = screen.getByRole("textbox");

      fireEvent.input(textarea, { target: { value: "Hello" } });
      triggerSend(textarea);
      expect(handleSend).toHaveBeenCalledExactlyOnceWith("Hello", {
        thinking: "Default",
      });
    });

    it.each(sendTriggers)(
      "clears input after %s send",
      (_method, triggerSend) => {
        render(<ChatInput {...defaultProps} />);
        const textarea = screen.getByRole("textbox") as HTMLTextAreaElement;

        fireEvent.input(textarea, { target: { value: "Hello" } });
        triggerSend(textarea);
        expect(textarea.value).toBe("");
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
        name: "assistant responding",
        inputValue: "Hello",
        shiftKey: false,
        isResponding: true,
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

        const textarea = screen.getByRole("textbox");

        if (inputValue !== undefined) {
          fireEvent.input(textarea, { target: { value: inputValue } });
        }

        fireEvent.keyDown(textarea, { key: "Enter", shiftKey });

        expect(handleSend).not.toHaveBeenCalled();
      },
    );
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
