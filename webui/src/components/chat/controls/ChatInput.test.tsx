/**
 * @vitest-environment happy-dom
 */
import { render, screen, fireEvent } from "@testing-library/preact";
import { describe, expect, it, vi } from "vitest";
import { ChatInput } from "./ChatInput";
import type { Provider } from "#webui/types/settings";

const defaultProps = {
  handleSend: vi.fn(),
  isAssistantResponding: false,
  onStop: vi.fn(),
  provider: "gemini" as Provider,
  model: "gemini-2.0-flash-thinking",
  defaultThinking: "Default",
  defaultTemperature: 1.0,
  defaultShowThoughts: true,
  thinking: "Default",
  temperature: 1.0,
  showThoughts: true,
  onThinkingChange: vi.fn(),
  onTemperatureChange: vi.fn(),
  onShowThoughtsChange: vi.fn(),
  onResetToDefaults: vi.fn(),
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

    it("calls handleSend with input when clicked", () => {
      const handleSend = vi.fn();

      render(<ChatInput {...defaultProps} handleSend={handleSend} />);

      const textarea = screen.getByRole("textbox");

      fireEvent.input(textarea, { target: { value: "Hello" } });

      const button = screen.getByRole("button", { name: "Send" });

      fireEvent.click(button);

      expect(handleSend).toHaveBeenCalledExactlyOnceWith("Hello", {
        thinking: "Default",
        temperature: 1.0,
        showThoughts: true,
      });
    });

    it("clears input after sending", () => {
      render(<ChatInput {...defaultProps} />);

      const textarea = screen.getByRole("textbox") as HTMLTextAreaElement;

      fireEvent.input(textarea, { target: { value: "Hello" } });

      const button = screen.getByRole("button", { name: "Send" });

      fireEvent.click(button);

      expect(textarea.value).toBe("");
    });
  });

  describe("Enter key handling", () => {
    it("sends message on Enter key", () => {
      const handleSend = vi.fn();

      render(<ChatInput {...defaultProps} handleSend={handleSend} />);

      const textarea = screen.getByRole("textbox");

      fireEvent.input(textarea, { target: { value: "Hello" } });
      fireEvent.keyDown(textarea, { key: "Enter", shiftKey: false });

      expect(handleSend).toHaveBeenCalledExactlyOnceWith("Hello", {
        thinking: "Default",
        temperature: 1.0,
        showThoughts: true,
      });
    });

    it("clears input after Enter key send", () => {
      render(<ChatInput {...defaultProps} />);

      const textarea = screen.getByRole("textbox") as HTMLTextAreaElement;

      fireEvent.input(textarea, { target: { value: "Hello" } });
      fireEvent.keyDown(textarea, { key: "Enter", shiftKey: false });

      expect(textarea.value).toBe("");
    });

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

  describe("per-message settings", () => {
    it("passes default thinking and temperature on send", () => {
      const handleSend = vi.fn();

      render(<ChatInput {...defaultProps} handleSend={handleSend} />);

      const textarea = screen.getByRole("textbox");

      fireEvent.input(textarea, { target: { value: "Hello" } });

      const button = screen.getByRole("button", { name: "Send" });

      fireEvent.click(button);

      expect(handleSend).toHaveBeenCalledWith("Hello", {
        thinking: "Default",
        temperature: 1.0,
        showThoughts: true,
      });
    });

    it("calls onResetToDefaults when reset button clicked", () => {
      const onResetToDefaults = vi.fn();
      const { container } = render(
        <ChatInput
          {...defaultProps}
          thinking="High"
          onResetToDefaults={onResetToDefaults}
        />,
      );

      // Expand settings toolbar
      const expandButton = container.querySelector("button");

      fireEvent.click(expandButton!);

      // Reset to defaults
      const resetButton = Array.from(container.querySelectorAll("button")).find(
        (btn) => btn.textContent.includes("Use defaults"),
      );

      fireEvent.click(resetButton!);

      expect(onResetToDefaults).toHaveBeenCalledOnce();
    });

    it("passes showThoughts: false when showThoughts prop is false", () => {
      const handleSend = vi.fn();

      render(
        <ChatInput
          {...defaultProps}
          handleSend={handleSend}
          showThoughts={false}
        />,
      );

      // Send message and verify showThoughts is false
      const textarea = screen.getByRole("textbox");

      fireEvent.input(textarea, { target: { value: "Hello" } });
      const sendButton = screen.getByRole("button", { name: "Send" });

      fireEvent.click(sendButton);

      expect(handleSend).toHaveBeenCalledWith("Hello", {
        thinking: "Default",
        temperature: 1.0,
        showThoughts: false,
      });
    });

    it("calls onShowThoughtsChange when checkbox is clicked", () => {
      const onShowThoughtsChange = vi.fn();
      const { container } = render(
        <ChatInput
          {...defaultProps}
          onShowThoughtsChange={onShowThoughtsChange}
        />,
      );

      // Expand settings toolbar
      const expandButton = container.querySelector("button");

      fireEvent.click(expandButton!);

      // Click showThoughts checkbox
      const checkbox = container.querySelector(
        'input[type="checkbox"]',
      ) as HTMLInputElement;

      expect(checkbox).toBeDefined();
      fireEvent.click(checkbox);

      expect(onShowThoughtsChange).toHaveBeenCalledWith(false);
    });
  });
});
