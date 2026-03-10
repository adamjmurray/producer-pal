// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * @vitest-environment happy-dom
 */
import { render, screen, fireEvent } from "@testing-library/preact";
import { describe, expect, it, vi } from "vitest";
import { ChatHeader } from "#webui/components/chat/controls/ChatHeader";
import { VersionDisplay } from "#webui/components/chat/controls/header/VersionDisplay";

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
    isHistoryOpen: false,
    showHelpLinks: true,
    latestVersion: null,
    onOpenSettings: vi.fn(),
    onOpenToolsSettings: vi.fn(),
    onOpenConnectionSettings: vi.fn(),
    onToggleHistory: vi.fn(),
    onNewConversation: vi.fn(),
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

    it("logo links to producer-pal.org", () => {
      render(<ChatHeader {...defaultProps} />);
      const link = screen.getByTitle("Producer Pal website");

      expect(link.tagName).toBe("A");
      expect(link.getAttribute("href")).toBe("https://producer-pal.org");
      expect(link.getAttribute("target")).toBe("_blank");
    });

    it("renders help icon linking to docs", () => {
      render(<ChatHeader {...defaultProps} />);
      const helpLink = screen.getByTitle("Documentation");

      expect(helpLink.tagName).toBe("A");
      expect(helpLink.getAttribute("target")).toBe("_blank");
    });
  });

  describe("mcpStatus display", () => {
    it("shows Ready when status is connected", () => {
      render(<ChatHeader {...defaultProps} mcpStatus="connected" />);
      expect(screen.getByText(/Ready/)).toBeDefined();
    });

    it("shows Looking for Producer Pal when status is connecting", () => {
      render(<ChatHeader {...defaultProps} mcpStatus="connecting" />);
      expect(screen.getByText(/Looking for Producer Pal/)).toBeDefined();
    });

    it("shows Error when status is error", () => {
      render(<ChatHeader {...defaultProps} mcpStatus="error" />);
      expect(screen.getByText(/Error/)).toBeDefined();
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

    it("shows Gemini 3 Flash model with provider", () => {
      render(
        <ChatHeader
          {...defaultProps}
          activeModel="gemini-3-flash-preview"
          activeProvider="gemini"
        />,
      );
      expect(screen.getByText(/Google \|/)).toBeDefined();
      expect(screen.getByText("Gemini 3 Flash")).toBeDefined();
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

    it("shows wrench emoji for compact display when all tools enabled", () => {
      render(
        <ChatHeader
          {...defaultProps}
          enabledToolsCount={20}
          totalToolsCount={20}
        />,
      );
      expect(screen.getByTitle("20/20 tools enabled")).toBeDefined();
    });

    it("shows wrench with count for compact display when subset enabled", () => {
      render(
        <ChatHeader
          {...defaultProps}
          enabledToolsCount={15}
          totalToolsCount={20}
        />,
      );
      const indicator = screen.getByTitle("15/20 tools enabled");

      expect(indicator.textContent).toContain("🔧");
      expect(indicator.textContent).toContain("15");
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

  describe("indicator links to settings tabs", () => {
    it("calls onOpenToolsSettings when tools indicator clicked", () => {
      const onOpenToolsSettings = vi.fn();

      render(
        <ChatHeader
          {...defaultProps}
          enabledToolsCount={15}
          totalToolsCount={20}
          onOpenToolsSettings={onOpenToolsSettings}
        />,
      );

      const button = screen.getByTitle("Tools settings");

      fireEvent.click(button);

      expect(onOpenToolsSettings).toHaveBeenCalledOnce();
    });

    it("calls onOpenConnectionSettings when small model indicator clicked", () => {
      const onOpenConnectionSettings = vi.fn();

      render(
        <ChatHeader
          {...defaultProps}
          smallModelMode={true}
          onOpenConnectionSettings={onOpenConnectionSettings}
        />,
      );

      const button = screen.getByTitle("Connection settings");

      fireEvent.click(button);

      expect(onOpenConnectionSettings).toHaveBeenCalledOnce();
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

      expect(screen.getByText(/Ready/)).toBeDefined();
      expect(screen.getByText(/Google \|/)).toBeDefined();
      expect(screen.getByText("Gemini 2.5 Pro")).toBeDefined();
      expect(screen.getByText("18/20 tools")).toBeDefined();
    });
  });

  describe("provider display format", () => {
    it("shows Anthropic for anthropic provider", () => {
      render(
        <ChatHeader
          {...defaultProps}
          activeModel="claude-sonnet-4-6-20250514"
          activeProvider="anthropic"
        />,
      );
      expect(screen.getByText(/Anthropic \|/)).toBeDefined();
    });

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

  describe("bookmark button", () => {
    it("renders disabled when onToggleBookmark is undefined", () => {
      render(<ChatHeader {...defaultProps} />);
      const button = screen.getByLabelText("Bookmark conversation");

      expect(button).toBeDefined();
      expect(button.getAttribute("disabled")).toBe("");
    });

    it("renders outline star when not bookmarked", () => {
      render(
        <ChatHeader
          {...defaultProps}
          isActiveBookmarked={false}
          onToggleBookmark={vi.fn()}
        />,
      );
      const button = screen.getByLabelText("Bookmark conversation");

      expect(button).toBeDefined();
    });

    it("renders filled star when bookmarked", () => {
      render(
        <ChatHeader
          {...defaultProps}
          isActiveBookmarked={true}
          onToggleBookmark={vi.fn()}
        />,
      );
      const button = screen.getByLabelText("Remove bookmark");

      expect(button).toBeDefined();
    });

    it("calls onToggleBookmark when clicked", () => {
      const onToggleBookmark = vi.fn();

      render(
        <ChatHeader
          {...defaultProps}
          isActiveBookmarked={false}
          onToggleBookmark={onToggleBookmark}
        />,
      );
      fireEvent.click(screen.getByLabelText("Bookmark conversation"));

      expect(onToggleBookmark).toHaveBeenCalledOnce();
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

  describe("VersionDisplay", () => {
    it("does not show update link when latestVersion is null", () => {
      render(<VersionDisplay version="1.4.4" latestVersion={null} />);

      expect(screen.getByText(/v1\.4\.4/)).toBeDefined();
      expect(screen.queryByText("(update)")).toBeNull();
    });

    it("shows update link when latestVersion is set", () => {
      render(<VersionDisplay version="1.4.4" latestVersion="1.5.0" />);
      const link = screen.getByText("(update)");

      expect(link).toBeDefined();
      expect(link.tagName).toBe("A");
      expect(link.getAttribute("href")).toBe(
        "https://producer-pal.org/installation/upgrading",
      );
      expect(link.getAttribute("target")).toBe("_blank");
    });

    it("shows latest version in tooltip", () => {
      render(<VersionDisplay version="1.4.4" latestVersion="2.0.0" />);
      const link = screen.getByText("(update)");

      expect(link.getAttribute("title")).toBe(
        "v2.0.0 available — click for upgrade instructions",
      );
    });
  });
});
