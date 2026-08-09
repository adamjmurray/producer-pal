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
import { type HeaderInfo } from "#webui/components/chat/controls/header/HeaderActions";
import { VersionDisplay } from "#webui/components/chat/controls/header/VersionDisplay";

const defaultHeaderInfo: HeaderInfo = {
  activeModel: null,
  activeProvider: null,
  model: "gemini-3.1-pro-preview",
  provider: "gemini",
  enabledToolsCount: 20,
  totalToolsCount: 20,
  defaultToolsCount: 20,
  smallModelMode: false,
  defaultSmallModelMode: false,
  showHelpLinks: true,
};

/**
 * Build headerInfo with optional overrides merged into defaults.
 * @param overrides - partial HeaderInfo fields to override
 * @returns merged HeaderInfo object
 */
function hi(overrides?: Partial<HeaderInfo>): HeaderInfo {
  return { ...defaultHeaderInfo, ...overrides };
}

describe("ChatHeader", () => {
  const defaultProps = {
    headerInfo: defaultHeaderInfo,
    mcpStatus: "connected" as const,
    isHistoryOpen: false,
    update: null,
    onDismissUpdate: vi.fn(),
    onOpenSettings: vi.fn(),
    onOpenToolsSettings: vi.fn(),
    onOpenConnectionSettings: vi.fn(),
    onOpenContext: vi.fn(),
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
      render(
        <ChatHeader {...defaultProps} headerInfo={hi({ activeModel: null })} />,
      );
      // Falls back to model prop from settings
      expect(screen.getByText(/Google \|/)).toBeDefined();
      expect(screen.getByText("Gemini 3.1 Pro")).toBeDefined();
    });

    it("shows provider and model name when both are set", () => {
      render(
        <ChatHeader
          {...defaultProps}
          headerInfo={hi({
            activeModel: "gemini-3.1-pro-preview",
            activeProvider: "gemini",
          })}
        />,
      );
      expect(screen.getByText(/Google \|/)).toBeDefined();
      expect(screen.getByText("Gemini 3.1 Pro")).toBeDefined();
    });

    it("shows Flash model with provider", () => {
      render(
        <ChatHeader
          {...defaultProps}
          headerInfo={hi({
            activeModel: "gemini-3.5-flash-lite",
            activeProvider: "gemini",
          })}
        />,
      );
      expect(screen.getByText(/Google \|/)).toBeDefined();
      expect(screen.getByText("Gemini 3.5 Flash-Lite")).toBeDefined();
    });

    it("shows Gemini 3.6 Flash model with provider", () => {
      render(
        <ChatHeader
          {...defaultProps}
          headerInfo={hi({
            activeModel: "gemini-3.6-flash",
            activeProvider: "gemini",
          })}
        />,
      );
      expect(screen.getByText(/Google \|/)).toBeDefined();
      expect(screen.getByText("Gemini 3.6 Flash")).toBeDefined();
    });

    it("shows unknown model ID as-is with provider", () => {
      render(
        <ChatHeader
          {...defaultProps}
          headerInfo={hi({
            activeModel: "unknown-model",
            activeProvider: "openai",
          })}
        />,
      );
      expect(screen.getByText(/OpenAI \|/)).toBeDefined();
      expect(screen.getByText("unknown-model")).toBeDefined();
    });

    it("shows fallback provider when activeProvider is null", () => {
      render(
        <ChatHeader
          {...defaultProps}
          headerInfo={hi({
            activeModel: "gemini-3.1-pro-preview",
            activeProvider: null,
          })}
        />,
      );
      // Falls back to provider prop from settings
      expect(screen.getByText(/Google \|/)).toBeDefined();
      expect(screen.getByText("Gemini 3.1 Pro")).toBeDefined();
    });
  });

  describe("tools count display", () => {
    it("shows all tools enabled", () => {
      render(
        <ChatHeader
          {...defaultProps}
          headerInfo={hi({ enabledToolsCount: 20, totalToolsCount: 20 })}
        />,
      );
      expect(screen.getByText("20/20 tools")).toBeDefined();
    });

    it("shows some tools disabled", () => {
      render(
        <ChatHeader
          {...defaultProps}
          headerInfo={hi({ enabledToolsCount: 15, totalToolsCount: 20 })}
        />,
      );
      expect(screen.getByText("15/20 tools")).toBeDefined();
    });

    it("shows no tools enabled", () => {
      render(
        <ChatHeader
          {...defaultProps}
          headerInfo={hi({ enabledToolsCount: 0, totalToolsCount: 20 })}
        />,
      );
      expect(screen.getByText("0/20 tools")).toBeDefined();
    });

    it("shows wrench emoji for compact display when all tools enabled", () => {
      render(
        <ChatHeader
          {...defaultProps}
          headerInfo={hi({ enabledToolsCount: 20, totalToolsCount: 20 })}
        />,
      );
      expect(screen.getByTitle("20/20 tools enabled")).toBeDefined();
    });

    it("shows wrench with count for compact display when subset enabled", () => {
      render(
        <ChatHeader
          {...defaultProps}
          headerInfo={hi({ enabledToolsCount: 15, totalToolsCount: 20 })}
        />,
      );
      const indicator = screen.getByTitle(/^15\/20 tools enabled/);

      expect(indicator.textContent).toContain("🔧");
      expect(indicator.textContent).toContain("15");
    });

    it("explains the gap the experimental tools leave in the denominator", () => {
      // 21/23 out of the box is the normal state, not a fault.
      render(
        <ChatHeader
          {...defaultProps}
          headerInfo={hi({ enabledToolsCount: 18, totalToolsCount: 20 })}
        />,
      );

      // Queried loosely on the gap between the lines: getByTitle collapses the
      // newline the tooltip actually carries.
      expect(
        screen.getByTitle(
          /^18\/20 tools enabled\s+Experimental tools \(Live API, Subagent\) are off by default$/,
        ),
      ).toBeDefined();
    });

    it("goes amber when the conversation's pinned toolset has been left behind", () => {
      // The count is the PINNED toolset, so without the amber it would read as
      // the current selection and the Tools tab would look like it did nothing.
      render(
        <ChatHeader
          {...defaultProps}
          headerInfo={hi({
            enabledToolsCount: 15,
            defaultToolsCount: 18,
            enabledToolsDiverge: true,
          })}
        />,
      );
      const indicator = screen.getByTitle(
        /^Locked: 15\/20 tools enabled \(default is now 18\/20\)/,
      );

      expect(indicator.className).toContain("amber");
    });

    it("says the set differs when the two toolsets are the same size", () => {
      // One tool swapped for another: naming a number that doesn't move would
      // read as nothing having changed.
      render(
        <ChatHeader
          {...defaultProps}
          headerInfo={hi({
            enabledToolsCount: 20,
            defaultToolsCount: 20,
            enabledToolsDiverge: true,
          })}
        />,
      );

      expect(
        screen.getByTitle(
          "Locked: 20/20 tools enabled (default is a different set)",
        ),
      ).toBeDefined();
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
          headerInfo={hi({ enabledToolsCount: 15, totalToolsCount: 20 })}
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
          headerInfo={hi({ smallModelMode: true })}
          onOpenConnectionSettings={onOpenConnectionSettings}
        />,
      );

      // Two buttons have "Connection settings" title (provider/model + turtle)
      const buttons = screen.getAllByTitle("Connection settings");

      fireEvent.click(buttons[1]!);

      expect(onOpenConnectionSettings).toHaveBeenCalled();
    });
  });

  describe("combined display", () => {
    it("shows all active settings together", () => {
      render(
        <ChatHeader
          {...defaultProps}
          mcpStatus="connected"
          headerInfo={hi({
            activeModel: "gemini-3.1-pro-preview",
            activeProvider: "gemini",
            enabledToolsCount: 18,
            totalToolsCount: 20,
          })}
        />,
      );

      expect(screen.getByText(/Ready/)).toBeDefined();
      expect(screen.getByText(/Google \|/)).toBeDefined();
      expect(screen.getByText("Gemini 3.1 Pro")).toBeDefined();
      expect(screen.getByText("18/20 tools")).toBeDefined();
    });
  });

  describe("provider display format", () => {
    it("shows Anthropic for anthropic provider", () => {
      render(
        <ChatHeader
          {...defaultProps}
          headerInfo={hi({
            activeModel: "claude-sonnet-4-6-20250514",
            activeProvider: "anthropic",
          })}
        />,
      );
      expect(screen.getByText(/Anthropic \|/)).toBeDefined();
    });

    it("shows Google for gemini provider", () => {
      render(
        <ChatHeader
          {...defaultProps}
          headerInfo={hi({
            activeModel: "gemini-3.1-pro-preview",
            activeProvider: "gemini",
          })}
        />,
      );
      expect(screen.getByText(/Google \|/)).toBeDefined();
    });

    it("shows OpenAI for openai provider", () => {
      render(
        <ChatHeader
          {...defaultProps}
          headerInfo={hi({
            activeModel: "gpt-4",
            activeProvider: "openai",
          })}
        />,
      );
      expect(screen.getByText(/OpenAI \|/)).toBeDefined();
    });

    it("shows Mistral for mistral provider", () => {
      render(
        <ChatHeader
          {...defaultProps}
          headerInfo={hi({
            activeModel: "mistral-large",
            activeProvider: "mistral",
          })}
        />,
      );
      expect(screen.getByText(/Mistral \|/)).toBeDefined();
    });

    it("shows OpenRouter for openrouter provider", () => {
      render(
        <ChatHeader
          {...defaultProps}
          headerInfo={hi({
            activeModel: "some-model",
            activeProvider: "openrouter",
          })}
        />,
      );
      expect(screen.getByText(/OpenRouter \|/)).toBeDefined();
    });

    it("shows LM Studio for lmstudio provider", () => {
      render(
        <ChatHeader
          {...defaultProps}
          headerInfo={hi({
            activeModel: "local-model",
            activeProvider: "lmstudio",
          })}
        />,
      );
      expect(screen.getByText(/LM Studio \|/)).toBeDefined();
    });

    it("shows Ollama for ollama provider", () => {
      render(
        <ChatHeader
          {...defaultProps}
          headerInfo={hi({
            activeModel: "llama2",
            activeProvider: "ollama",
          })}
        />,
      );
      expect(screen.getByText(/Ollama \|/)).toBeDefined();
    });

    it("shows Custom for custom provider", () => {
      render(
        <ChatHeader
          {...defaultProps}
          headerInfo={hi({
            activeModel: "custom-model",
            activeProvider: "custom",
          })}
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

  describe("model size indicator", () => {
    it("shows large model with elephant when smallModelMode is false", () => {
      render(
        <ChatHeader
          {...defaultProps}
          headerInfo={hi({ smallModelMode: false })}
        />,
      );
      const el = screen.getByLabelText("large model");

      expect(el.textContent).toContain("🐘");
    });

    it("shows small model with turtle when smallModelMode is true", () => {
      render(
        <ChatHeader
          {...defaultProps}
          headerInfo={hi({ smallModelMode: true })}
        />,
      );
      const el = screen.getByLabelText("small model");

      expect(el.textContent).toContain("🐢");
    });

    it("shows full text at sm breakpoint", () => {
      render(
        <ChatHeader
          {...defaultProps}
          headerInfo={hi({ smallModelMode: true })}
        />,
      );
      const elements = screen.getAllByLabelText("small model");
      const fullText = elements.find((el) =>
        el.textContent.includes("small model"),
      );

      expect(fullText).toBeDefined();
    });

    it("names what the default moved to when the conversation's mode is locked", () => {
      // Same shape as the model display's locked title, so the three amber
      // indicators read as one story rather than three phrasings.
      render(
        <ChatHeader
          {...defaultProps}
          headerInfo={hi({
            // The lock only exists once a conversation has connected.
            activeModel: "gemini-3.1-pro-preview",
            smallModelMode: true,
            defaultSmallModelMode: false,
          })}
        />,
      );

      expect(
        screen.getByTitle(
          "Locked: small model mode (default is now large model mode)",
        ),
      ).toBeDefined();
    });

    it("adds no locked tooltip when nothing diverges", () => {
      // The indicator stays untitled so the wrapping button's "Connection
      // settings" is what the user sees, matching the model display.
      render(<ChatHeader {...defaultProps} />);

      expect(screen.queryByTitle(/^Locked:/)).toBeNull();
    });
  });

  describe("VersionDisplay", () => {
    it("does not show update link when there is no update", () => {
      render(
        <VersionDisplay
          version="1.4.4"
          update={null}
          onDismissUpdate={vi.fn()}
        />,
      );

      expect(screen.getByText(/v1\.4\.4/)).toBeDefined();
      expect(screen.queryByText("(update)")).toBeNull();
    });

    it("shows update link when an update is available", () => {
      render(
        <VersionDisplay
          version="1.4.4"
          update={{ version: "1.5.0" }}
          onDismissUpdate={vi.fn()}
        />,
      );
      const link = screen.getByText("(update)");

      expect(link).toBeDefined();
      expect(link.tagName).toBe("A");
      expect(link.getAttribute("href")).toBe(
        "https://producer-pal.org/installation/upgrading",
      );
      expect(link.getAttribute("target")).toBe("_blank");
    });

    it("shows latest version in tooltip", () => {
      render(
        <VersionDisplay
          version="1.4.4"
          update={{ version: "2.0.0" }}
          onDismissUpdate={vi.fn()}
        />,
      );
      const link = screen.getByText("(update)");

      expect(link.getAttribute("title")).toBe(
        "v2.0.0 available — click for upgrade instructions",
      );
    });
  });
});
