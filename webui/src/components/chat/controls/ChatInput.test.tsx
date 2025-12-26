/**
 * @vitest-environment happy-dom
 */
import { render, screen, fireEvent } from "@testing-library/preact";
import { describe, expect, it, vi } from "vitest";
import { ChatInput } from "./ChatInput";
import type { Provider } from "../../../types/settings";

const defaultProps = {
  handleSend: vi.fn(),
  isAssistantResponding: false,
  onStop: vi.fn(),
  provider: "gemini" as Provider,
  model: "gemini-2.0-flash-thinking",
  defaultThinking: "Default",
  defaultTemperature: 1.0,
  defaultShowThoughts: true,
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
    it("is disabled when input is empty", () => {
      render(<ChatInput {...defaultProps} />);

      const button = screen.getByRole("button", {
        name: "Send",
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

    it("is disabled when assistant is responding", () => {
      render(<ChatInput {...defaultProps} isAssistantResponding={true} />);

      const textarea = screen.getByRole("textbox");
      fireEvent.input(textarea, { target: { value: "Hello" } });

      const button = screen.getByRole("button", {
        name: "...",
      }) as HTMLButtonElement;
      expect(button.disabled).toBe(true);
    });

    it("is disabled when input is only whitespace", () => {
      render(<ChatInput {...defaultProps} />);

      const textarea = screen.getByRole("textbox");
      fireEvent.input(textarea, { target: { value: "   " } });

      const button = screen.getByRole("button", {
        name: "Send",
      }) as HTMLButtonElement;
      expect(button.disabled).toBe(true);
    });

    it("calls handleSend with input when clicked", () => {
      const handleSend = vi.fn();
      render(<ChatInput {...defaultProps} handleSend={handleSend} />);

      const textarea = screen.getByRole("textbox");
      fireEvent.input(textarea, { target: { value: "Hello" } });

      const button = screen.getByRole("button", { name: "Send" });
      fireEvent.click(button);

      expect(handleSend).toHaveBeenCalledOnce();
      expect(handleSend).toHaveBeenCalledWith("Hello", {
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

      expect(handleSend).toHaveBeenCalledOnce();
      expect(handleSend).toHaveBeenCalledWith("Hello", {
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

    it("does not send on Shift+Enter", () => {
      const handleSend = vi.fn();
      render(<ChatInput {...defaultProps} handleSend={handleSend} />);

      const textarea = screen.getByRole("textbox");
      fireEvent.input(textarea, { target: { value: "Hello" } });
      fireEvent.keyDown(textarea, { key: "Enter", shiftKey: true });

      expect(handleSend).not.toHaveBeenCalled();
    });

    it("does not send when assistant is responding", () => {
      const handleSend = vi.fn();
      render(
        <ChatInput
          {...defaultProps}
          handleSend={handleSend}
          isAssistantResponding={true}
        />,
      );

      const textarea = screen.getByRole("textbox");
      fireEvent.input(textarea, { target: { value: "Hello" } });
      fireEvent.keyDown(textarea, { key: "Enter", shiftKey: false });

      expect(handleSend).not.toHaveBeenCalled();
    });

    it("does not send when input is empty", () => {
      const handleSend = vi.fn();
      render(<ChatInput {...defaultProps} handleSend={handleSend} />);

      const textarea = screen.getByRole("textbox");
      fireEvent.keyDown(textarea, { key: "Enter", shiftKey: false });

      expect(handleSend).not.toHaveBeenCalled();
    });

    it("does not send when input is only whitespace", () => {
      const handleSend = vi.fn();
      render(<ChatInput {...defaultProps} handleSend={handleSend} />);

      const textarea = screen.getByRole("textbox");
      fireEvent.input(textarea, { target: { value: "   " } });
      fireEvent.keyDown(textarea, { key: "Enter", shiftKey: false });

      expect(handleSend).not.toHaveBeenCalled();
    });
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

    it("resets to defaults when reset button clicked", () => {
      const handleSend = vi.fn();
      const { container } = render(
        <ChatInput {...defaultProps} handleSend={handleSend} />,
      );

      // Expand settings toolbar
      const expandButton = container.querySelector("button");
      fireEvent.click(expandButton!);

      // Change thinking
      const select = container.querySelector("select");
      fireEvent.change(select!, { target: { value: "High" } });

      // Reset to defaults
      const resetButton = Array.from(container.querySelectorAll("button")).find(
        (btn) => btn.textContent.includes("Use defaults"),
      );
      fireEvent.click(resetButton!);

      // Send message and verify defaults are used
      const textarea = screen.getByRole("textbox");
      fireEvent.input(textarea, { target: { value: "Hello" } });
      const sendButton = screen.getByRole("button", { name: "Send" });
      fireEvent.click(sendButton);

      expect(handleSend).toHaveBeenCalledWith("Hello", {
        thinking: "Default",
        temperature: 1.0,
        showThoughts: true,
      });
    });

    it("passes showThoughts: false when checkbox is unchecked", () => {
      const handleSend = vi.fn();
      const { container } = render(
        <ChatInput {...defaultProps} handleSend={handleSend} />,
      );

      // Expand settings toolbar
      const expandButton = container.querySelector("button");
      fireEvent.click(expandButton!);

      // Uncheck showThoughts checkbox
      const checkbox = container.querySelector(
        'input[type="checkbox"]',
      ) as HTMLInputElement;
      expect(checkbox).toBeDefined();
      expect(checkbox.checked).toBe(true); // Starts as true (from defaultShowThoughts)
      fireEvent.click(checkbox);
      expect(checkbox.checked).toBe(false);

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
  });
});
