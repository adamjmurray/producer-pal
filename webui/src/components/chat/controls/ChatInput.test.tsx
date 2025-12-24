/**
 * @vitest-environment happy-dom
 */
import { render, screen, fireEvent } from "@testing-library/preact";
import { describe, expect, it, vi } from "vitest";
import { ChatInput } from "./ChatInput";

describe("ChatInput", () => {
  const defaultProps = {
    handleSend: vi.fn(),
    isAssistantResponding: false,
    onStop: vi.fn(),
    thinking: "Auto",
    temperature: 1.0,
  };

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

  describe("thinking and temperature display", () => {
    it("always shows thinking and randomness", () => {
      render(<ChatInput {...defaultProps} />);
      expect(screen.getByText(/Thinking: Auto/)).toBeDefined();
      expect(screen.getByText(/50% random/)).toBeDefined();
    });

    it("shows different thinking modes", () => {
      render(<ChatInput {...defaultProps} thinking="High" />);
      expect(screen.getByText(/Thinking: High/)).toBeDefined();
    });

    it("shows 0% random when temperature is 0", () => {
      render(<ChatInput {...defaultProps} temperature={0} />);
      expect(screen.getByText(/0% random/)).toBeDefined();
    });

    it("shows 100% random when temperature is 2", () => {
      render(<ChatInput {...defaultProps} temperature={2} />);
      expect(screen.getByText(/100% random/)).toBeDefined();
    });

    it("shows 25% random when temperature is 0.5", () => {
      render(<ChatInput {...defaultProps} temperature={0.5} />);
      expect(screen.getByText(/25% random/)).toBeDefined();
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
      expect(handleSend).toHaveBeenCalledWith("Hello");
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
      expect(handleSend).toHaveBeenCalledWith("Hello");
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
});
