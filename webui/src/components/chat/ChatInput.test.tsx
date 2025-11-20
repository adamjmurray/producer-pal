/**
 * @vitest-environment happy-dom
 */
import { render, screen, fireEvent } from "@testing-library/preact";
import { describe, expect, it, vi } from "vitest";
import { ChatInput } from "./ChatInput.jsx";

describe("ChatInput", () => {
  describe("rendering", () => {
    it("renders textarea", () => {
      const handleSend = vi.fn();
      const onStop = vi.fn();
      render(
        <ChatInput
          handleSend={handleSend}
          isAssistantResponding={false}
          onStop={onStop}
        />,
      );

      expect(screen.getByRole("textbox")).toBeDefined();
    });

    it("renders Send button when not responding", () => {
      const handleSend = vi.fn();
      const onStop = vi.fn();
      render(
        <ChatInput
          handleSend={handleSend}
          isAssistantResponding={false}
          onStop={onStop}
        />,
      );

      expect(screen.getByRole("button", { name: "Send" })).toBeDefined();
    });

    it("renders ... button when responding", () => {
      const handleSend = vi.fn();
      const onStop = vi.fn();
      render(
        <ChatInput
          handleSend={handleSend}
          isAssistantResponding={true}
          onStop={onStop}
        />,
      );

      expect(screen.getByRole("button", { name: "..." })).toBeDefined();
    });

    it("shows placeholder text", () => {
      const handleSend = vi.fn();
      const onStop = vi.fn();
      render(
        <ChatInput
          handleSend={handleSend}
          isAssistantResponding={false}
          onStop={onStop}
        />,
      );

      const textarea = screen.getByRole("textbox");
      expect(textarea.getAttribute("placeholder")).toBe(
        "Type a message... (Shift+Enter for new line)",
      );
    });
  });

  describe("input handling", () => {
    it("updates input value when typing", () => {
      const handleSend = vi.fn();
      const onStop = vi.fn();
      render(
        <ChatInput
          handleSend={handleSend}
          isAssistantResponding={false}
          onStop={onStop}
        />,
      );

      const textarea = screen.getByRole("textbox") as HTMLTextAreaElement;
      fireEvent.input(textarea, { target: { value: "Hello" } });

      expect(textarea.value).toBe("Hello");
    });
  });

  describe("send button", () => {
    it("is disabled when input is empty", () => {
      const handleSend = vi.fn();
      const onStop = vi.fn();
      render(
        <ChatInput
          handleSend={handleSend}
          isAssistantResponding={false}
          onStop={onStop}
        />,
      );

      const button = screen.getByRole("button", {
        name: "Send",
      }) as HTMLButtonElement;
      expect(button.disabled).toBe(true);
    });

    it("is enabled when input has content", () => {
      const handleSend = vi.fn();
      const onStop = vi.fn();
      render(
        <ChatInput
          handleSend={handleSend}
          isAssistantResponding={false}
          onStop={onStop}
        />,
      );

      const textarea = screen.getByRole("textbox");
      fireEvent.input(textarea, { target: { value: "Hello" } });

      const button = screen.getByRole("button", {
        name: "Send",
      }) as HTMLButtonElement;
      expect(button.disabled).toBe(false);
    });

    it("is disabled when assistant is responding", () => {
      const handleSend = vi.fn();
      const onStop = vi.fn();
      render(
        <ChatInput
          handleSend={handleSend}
          isAssistantResponding={true}
          onStop={onStop}
        />,
      );

      const textarea = screen.getByRole("textbox");
      fireEvent.input(textarea, { target: { value: "Hello" } });

      const button = screen.getByRole("button", {
        name: "...",
      }) as HTMLButtonElement;
      expect(button.disabled).toBe(true);
    });

    it("is disabled when input is only whitespace", () => {
      const handleSend = vi.fn();
      const onStop = vi.fn();
      render(
        <ChatInput
          handleSend={handleSend}
          isAssistantResponding={false}
          onStop={onStop}
        />,
      );

      const textarea = screen.getByRole("textbox");
      fireEvent.input(textarea, { target: { value: "   " } });

      const button = screen.getByRole("button", {
        name: "Send",
      }) as HTMLButtonElement;
      expect(button.disabled).toBe(true);
    });

    it("calls handleSend with input when clicked", () => {
      const handleSend = vi.fn();
      const onStop = vi.fn();
      render(
        <ChatInput
          handleSend={handleSend}
          isAssistantResponding={false}
          onStop={onStop}
        />,
      );

      const textarea = screen.getByRole("textbox");
      fireEvent.input(textarea, { target: { value: "Hello" } });

      const button = screen.getByRole("button", { name: "Send" });
      fireEvent.click(button);

      expect(handleSend).toHaveBeenCalledOnce();
      expect(handleSend).toHaveBeenCalledWith("Hello");
    });

    it("clears input after sending", () => {
      const handleSend = vi.fn();
      const onStop = vi.fn();
      render(
        <ChatInput
          handleSend={handleSend}
          isAssistantResponding={false}
          onStop={onStop}
        />,
      );

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
      const onStop = vi.fn();
      render(
        <ChatInput
          handleSend={handleSend}
          isAssistantResponding={false}
          onStop={onStop}
        />,
      );

      const textarea = screen.getByRole("textbox");
      fireEvent.input(textarea, { target: { value: "Hello" } });
      fireEvent.keyDown(textarea, { key: "Enter", shiftKey: false });

      expect(handleSend).toHaveBeenCalledOnce();
      expect(handleSend).toHaveBeenCalledWith("Hello");
    });

    it("clears input after Enter key send", () => {
      const handleSend = vi.fn();
      const onStop = vi.fn();
      render(
        <ChatInput
          handleSend={handleSend}
          isAssistantResponding={false}
          onStop={onStop}
        />,
      );

      const textarea = screen.getByRole("textbox") as HTMLTextAreaElement;
      fireEvent.input(textarea, { target: { value: "Hello" } });
      fireEvent.keyDown(textarea, { key: "Enter", shiftKey: false });

      expect(textarea.value).toBe("");
    });

    it("does not send on Shift+Enter", () => {
      const handleSend = vi.fn();
      const onStop = vi.fn();
      render(
        <ChatInput
          handleSend={handleSend}
          isAssistantResponding={false}
          onStop={onStop}
        />,
      );

      const textarea = screen.getByRole("textbox");
      fireEvent.input(textarea, { target: { value: "Hello" } });
      fireEvent.keyDown(textarea, { key: "Enter", shiftKey: true });

      expect(handleSend).not.toHaveBeenCalled();
    });

    it("does not send when assistant is responding", () => {
      const handleSend = vi.fn();
      const onStop = vi.fn();
      render(
        <ChatInput
          handleSend={handleSend}
          isAssistantResponding={true}
          onStop={onStop}
        />,
      );

      const textarea = screen.getByRole("textbox");
      fireEvent.input(textarea, { target: { value: "Hello" } });
      fireEvent.keyDown(textarea, { key: "Enter", shiftKey: false });

      expect(handleSend).not.toHaveBeenCalled();
    });

    it("does not send when input is empty", () => {
      const handleSend = vi.fn();
      const onStop = vi.fn();
      render(
        <ChatInput
          handleSend={handleSend}
          isAssistantResponding={false}
          onStop={onStop}
        />,
      );

      const textarea = screen.getByRole("textbox");
      fireEvent.keyDown(textarea, { key: "Enter", shiftKey: false });

      expect(handleSend).not.toHaveBeenCalled();
    });

    it("does not send when input is only whitespace", () => {
      const handleSend = vi.fn();
      const onStop = vi.fn();
      render(
        <ChatInput
          handleSend={handleSend}
          isAssistantResponding={false}
          onStop={onStop}
        />,
      );

      const textarea = screen.getByRole("textbox");
      fireEvent.input(textarea, { target: { value: "   " } });
      fireEvent.keyDown(textarea, { key: "Enter", shiftKey: false });

      expect(handleSend).not.toHaveBeenCalled();
    });
  });
});
