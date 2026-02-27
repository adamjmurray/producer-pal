// Producer Pal
// Copyright (C) 2026 Adam Murray
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * @vitest-environment happy-dom
 */
import { render, screen, fireEvent } from "@testing-library/preact";
import { describe, expect, it, vi } from "vitest";
import { ChatHeader } from "./ChatHeader";

describe("ChatHeader", () => {
  const defaultProps = {
    mcpStatus: "connected" as const,
    activeModel: null,
    activeProvider: null,
    model: "gemini-2.5-pro",
    provider: "gemini" as const,
    enabledToolsCount: 20,
    totalToolsCount: 20,
    smallModelMode: false,
    hasMessages: false,
    onOpenSettings: vi.fn(),
    onClearConversation: vi.fn(),
  };

  describe("basic rendering", () => {
    it("renders title", () => {
      render(<ChatHeader {...defaultProps} />);
      expect(screen.getByText("Producer Pal Chat")).toBeDefined();
    });

    it("renders logo image", () => {
      render(<ChatHeader {...defaultProps} />);
      const logo = screen.getByAltText("Producer Pal");

      expect(logo).toBeDefined();
    });

    it("renders Settings button", () => {
      render(<ChatHeader {...defaultProps} />);
      expect(screen.getByRole("button", { name: /Settings/ })).toBeDefined();
    });

    it("title links to docs site", () => {
      render(<ChatHeader {...defaultProps} />);
      const link = screen.getByText("Producer Pal Chat").closest("a");

      expect(link).toBeDefined();
      expect(link?.href).toBe("https://producer-pal.org/guide/chat-ui");
      expect(link?.target).toBe("_blank");
      expect(link?.rel).toBe("noopener noreferrer");
    });
  });

  describe("mcpStatus display", () => {
    it("shows Ready when status is connected", () => {
      render(<ChatHeader {...defaultProps} mcpStatus="connected" />);
      expect(screen.getByText("✓ Ready")).toBeDefined();
    });

    it("shows Looking for Producer Pal when status is connecting", () => {
      render(<ChatHeader {...defaultProps} mcpStatus="connecting" />);
      expect(screen.getByText("👀 Looking for Producer Pal...")).toBeDefined();
    });

    it("shows Error when status is error", () => {
      render(<ChatHeader {...defaultProps} mcpStatus="error" />);
      expect(screen.getByText("✗ Error")).toBeDefined();
    });
  });

  describe("activeModel display", () => {
    it("shows fallback model when activeModel is null", () => {
      render(<ChatHeader {...defaultProps} activeModel={null} />);
      // Falls back to model prop from settings
      expect(screen.getByText(/Google \|/)).toBeDefined();
      expect(screen.getByText("Gemini 2.5 Pro")).toBeDefined();
    });

    it("shows provider and model name when both are set", () => {
      render(
        <ChatHeader
          {...defaultProps}
          activeModel="gemini-2.5-pro"
          activeProvider="gemini"
        />,
      );
      expect(screen.getByText(/Google \|/)).toBeDefined();
      expect(screen.getByText("Gemini 2.5 Pro")).toBeDefined();
    });

    it("shows Flash model with provider", () => {
      render(
        <ChatHeader
          {...defaultProps}
          activeModel="gemini-2.5-flash"
          activeProvider="gemini"
        />,
      );
      expect(screen.getByText(/Google \|/)).toBeDefined();
      expect(screen.getByText("Gemini 2.5 Flash")).toBeDefined();
    });

    it("shows Flash-Lite model with provider", () => {
      render(
        <ChatHeader
          {...defaultProps}
          activeModel="gemini-3-flash-preview"
          activeProvider="gemini"
        />,
      );
      expect(screen.getByText(/Google \|/)).toBeDefined();
      expect(screen.getByText("Gemini 2.5 Flash-Lite")).toBeDefined();
    });

    it("shows unknown model ID as-is with provider", () => {
      render(
        <ChatHeader
          {...defaultProps}
          activeModel="unknown-model"
          activeProvider="openai"
        />,
      );
      expect(screen.getByText(/OpenAI \|/)).toBeDefined();
      expect(screen.getByText("unknown-model")).toBeDefined();
    });

    it("shows fallback provider when activeProvider is null", () => {
      render(
        <ChatHeader
          {...defaultProps}
          activeModel="gemini-2.5-pro"
          activeProvider={null}
        />,
      );
      // Falls back to provider prop from settings
      expect(screen.getByText(/Google \|/)).toBeDefined();
      expect(screen.getByText("Gemini 2.5 Pro")).toBeDefined();
    });
  });

  describe("tools count display", () => {
    it("shows all tools enabled", () => {
      render(
        <ChatHeader
          {...defaultProps}
          enabledToolsCount={20}
          totalToolsCount={20}
        />,
      );
      expect(screen.getByText("20/20 tools")).toBeDefined();
    });

    it("shows some tools disabled", () => {
      render(
        <ChatHeader
          {...defaultProps}
          enabledToolsCount={15}
          totalToolsCount={20}
        />,
      );
      expect(screen.getByText("15/20 tools")).toBeDefined();
    });

    it("shows no tools enabled", () => {
      render(
        <ChatHeader
          {...defaultProps}
          enabledToolsCount={0}
          totalToolsCount={20}
        />,
      );
      expect(screen.getByText("0/20 tools")).toBeDefined();
    });

    it("shows tools count even when no messages", () => {
      render(
        <ChatHeader
          {...defaultProps}
          hasMessages={false}
          enabledToolsCount={18}
          totalToolsCount={20}
        />,
      );
      expect(screen.getByText("18/20 tools")).toBeDefined();
    });
  });

  describe("Settings button", () => {
    it("calls onOpenSettings when clicked", () => {
      const onOpenSettings = vi.fn();

      render(<ChatHeader {...defaultProps} onOpenSettings={onOpenSettings} />);

      const button = screen.getByRole("button", { name: /Settings/ });

      fireEvent.click(button);

      expect(onOpenSettings).toHaveBeenCalledOnce();
    });
  });

  describe("combined display", () => {
    it("shows all active settings together", () => {
      render(
        <ChatHeader
          {...defaultProps}
          mcpStatus="connected"
          activeModel="gemini-2.5-pro"
          activeProvider="gemini"
          enabledToolsCount={18}
          totalToolsCount={20}
        />,
      );

      expect(screen.getByText("✓ Ready")).toBeDefined();
      expect(screen.getByText(/Google \|/)).toBeDefined();
      expect(screen.getByText("Gemini 2.5 Pro")).toBeDefined();
      expect(screen.getByText("18/20 tools")).toBeDefined();
    });
  });

  describe("provider display format", () => {
    it("shows Google for gemini provider", () => {
      render(
        <ChatHeader
          {...defaultProps}
          activeModel="gemini-2.5-pro"
          activeProvider="gemini"
        />,
      );
      expect(screen.getByText(/Google \|/)).toBeDefined();
    });

    it("shows OpenAI for openai provider", () => {
      render(
        <ChatHeader
          {...defaultProps}
          activeModel="gpt-4"
          activeProvider="openai"
        />,
      );
      expect(screen.getByText(/OpenAI \|/)).toBeDefined();
    });

    it("shows Mistral for mistral provider", () => {
      render(
        <ChatHeader
          {...defaultProps}
          activeModel="mistral-large"
          activeProvider="mistral"
        />,
      );
      expect(screen.getByText(/Mistral \|/)).toBeDefined();
    });

    it("shows OpenRouter for openrouter provider", () => {
      render(
        <ChatHeader
          {...defaultProps}
          activeModel="some-model"
          activeProvider="openrouter"
        />,
      );
      expect(screen.getByText(/OpenRouter \|/)).toBeDefined();
    });

    it("shows LM Studio for lmstudio provider", () => {
      render(
        <ChatHeader
          {...defaultProps}
          activeModel="local-model"
          activeProvider="lmstudio"
        />,
      );
      expect(screen.getByText(/LM Studio \|/)).toBeDefined();
    });

    it("shows Ollama for ollama provider", () => {
      render(
        <ChatHeader
          {...defaultProps}
          activeModel="llama2"
          activeProvider="ollama"
        />,
      );
      expect(screen.getByText(/Ollama \|/)).toBeDefined();
    });

    it("shows Custom for custom provider", () => {
      render(
        <ChatHeader
          {...defaultProps}
          activeModel="custom-model"
          activeProvider="custom"
        />,
      );
      expect(screen.getByText(/Custom \|/)).toBeDefined();
    });
  });

  describe("small model mode indicator", () => {
    it("does not show indicator when smallModelMode is false", () => {
      render(<ChatHeader {...defaultProps} smallModelMode={false} />);
      expect(screen.queryByLabelText("Small model mode")).toBeNull();
    });

    it("shows indicator when smallModelMode is true", () => {
      render(<ChatHeader {...defaultProps} smallModelMode={true} />);
      expect(
        screen.getAllByLabelText("Small model mode").length,
      ).toBeGreaterThan(0);
    });

    it("shows full text at sm breakpoint", () => {
      render(<ChatHeader {...defaultProps} smallModelMode={true} />);
      const elements = screen.getAllByLabelText("Small model mode");
      const fullText = elements.find((el) =>
        el.textContent.includes("small model"),
      );

      expect(fullText).toBeDefined();
    });

    it("shows turtle-only variant for mobile", () => {
      render(<ChatHeader {...defaultProps} smallModelMode={true} />);
      const elements = screen.getAllByLabelText("Small model mode");
      const mobileEl = elements.find((el) => el.textContent.trim() === "🐢");

      expect(mobileEl).toBeDefined();
    });
  });

  describe("Restart button", () => {
    it("does not show Restart button when hasMessages is false", () => {
      render(<ChatHeader {...defaultProps} hasMessages={false} />);
      expect(screen.queryByRole("button", { name: "Restart" })).toBeNull();
    });

    it("shows Restart button when hasMessages is true", () => {
      render(<ChatHeader {...defaultProps} hasMessages={true} />);
      expect(screen.getByRole("button", { name: "Restart" })).toBeDefined();
    });

    it("calls window.confirm when Restart clicked", () => {
      const originalConfirm = window.confirm;

      window.confirm = vi.fn().mockReturnValue(false);

      render(<ChatHeader {...defaultProps} hasMessages={true} />);

      const button = screen.getByRole("button", { name: "Restart" });

      fireEvent.click(button);

      expect(window.confirm).toHaveBeenCalledWith(
        "Clear all messages and restart conversation?",
      );
      window.confirm = originalConfirm;
    });

    /**
     * Test confirm behavior with given confirm result
     * @param confirmResult - Whether user confirms or cancels
     * @returns onClearConversation mock
     */
    function testConfirmBehavior(confirmResult: boolean) {
      window.confirm = vi.fn().mockReturnValue(confirmResult);
      const onClearConversation = vi.fn();

      render(
        <ChatHeader
          {...defaultProps}
          hasMessages={true}
          onClearConversation={onClearConversation}
        />,
      );
      fireEvent.click(screen.getByRole("button", { name: "Restart" }));

      return onClearConversation;
    }

    it("does not call onClearConversation when user cancels", () => {
      const originalConfirm = window.confirm;
      const onClearConversation = testConfirmBehavior(false);

      expect(onClearConversation).not.toHaveBeenCalled();
      window.confirm = originalConfirm;
    });

    it("calls onClearConversation when user confirms", () => {
      const originalConfirm = window.confirm;
      const onClearConversation = testConfirmBehavior(true);

      expect(onClearConversation).toHaveBeenCalledOnce();

      window.confirm = originalConfirm;
    });
  });
});
