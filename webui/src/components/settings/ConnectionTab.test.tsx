// Producer Pal
// Copyright (C) 2026 Adam Murray
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * @vitest-environment happy-dom
 */
import { render, screen, fireEvent } from "@testing-library/preact";
import { describe, expect, it, vi } from "vitest";
import { ConnectionTab } from "./ConnectionTab";

// Mock child components
vi.mock(import("./controls/ProviderSelector"), () => ({
  ProviderSelector: ({ provider }: { provider: string }) => (
    <div data-testid="provider-selector">{provider}</div>
  ),
}));

vi.mock(import("./controls/ModelSelector"), () => ({
  ModelSelector: ({ model }: { model: string }) => (
    <div data-testid="model-selector">{model}</div>
  ),
}));

describe("ConnectionTab", () => {
  const defaultProps = {
    provider: "gemini" as const,
    setProvider: vi.fn(),
    apiKey: "",
    setApiKey: vi.fn(),
    baseUrl: null as string | null,
    setBaseUrl: vi.fn(),
    model: "gemini-2.5-pro",
    setModel: vi.fn(),
    providerLabel: "Gemini",
    smallModelMode: false,
    setSmallModelMode: vi.fn(),
  };

  describe("cloud providers - API key input", () => {
    it("renders API key input for Gemini", () => {
      render(<ConnectionTab {...defaultProps} provider="gemini" />);
      expect(
        screen.getByPlaceholderText("Enter your Gemini API key"),
      ).toBeDefined();
    });

    it("renders API key input for OpenAI", () => {
      render(
        <ConnectionTab
          {...defaultProps}
          provider="openai"
          providerLabel="OpenAI"
        />,
      );
      expect(
        screen.getByPlaceholderText("Enter your OpenAI API key"),
      ).toBeDefined();
    });

    it("renders API key input for Mistral", () => {
      render(
        <ConnectionTab
          {...defaultProps}
          provider="mistral"
          providerLabel="Mistral"
        />,
      );
      expect(
        screen.getByPlaceholderText("Enter your Mistral API key"),
      ).toBeDefined();
    });

    it("renders API key input for OpenRouter", () => {
      render(
        <ConnectionTab
          {...defaultProps}
          provider="openrouter"
          providerLabel="OpenRouter"
        />,
      );
      expect(
        screen.getByPlaceholderText("Enter your OpenRouter API key"),
      ).toBeDefined();
    });

    it("renders API key input for custom provider", () => {
      render(
        <ConnectionTab
          {...defaultProps}
          provider="custom"
          providerLabel="Custom"
        />,
      );
      expect(
        screen.getByPlaceholderText("Enter your Custom API key"),
      ).toBeDefined();
    });

    it("calls setApiKey when API key input changes", () => {
      const setApiKey = vi.fn();

      render(<ConnectionTab {...defaultProps} setApiKey={setApiKey} />);

      const input = screen.getByPlaceholderText("Enter your Gemini API key");

      fireEvent.change(input, { target: { value: "new-api-key" } });

      expect(setApiKey).toHaveBeenCalledWith("new-api-key");
    });

    it("displays existing API key value", () => {
      render(<ConnectionTab {...defaultProps} apiKey="existing-key" />);

      const input = screen.getByPlaceholderText(
        "Enter your Gemini API key",
      ) as HTMLInputElement;

      expect(input.value).toBe("existing-key");
    });

    it("API key input is password type", () => {
      render(<ConnectionTab {...defaultProps} />);

      const input = screen.getByPlaceholderText(
        "Enter your Gemini API key",
      ) as HTMLInputElement;

      expect(input.type).toBe("password");
    });
  });

  describe("API key links", () => {
    it("shows Gemini API key link", () => {
      render(<ConnectionTab {...defaultProps} provider="gemini" />);
      const link = screen.getByText("Gemini API keys") as HTMLAnchorElement;

      expect(link.href).toBe("https://aistudio.google.com/apikey");
      expect(link.target).toBe("_blank");
    });

    it("shows OpenAI API key link", () => {
      render(
        <ConnectionTab
          {...defaultProps}
          provider="openai"
          providerLabel="OpenAI"
        />,
      );
      const link = screen.getByText("OpenAI API keys") as HTMLAnchorElement;

      expect(link.href).toBe("https://platform.openai.com/api-keys");
    });

    it("shows Mistral API key link", () => {
      render(
        <ConnectionTab
          {...defaultProps}
          provider="mistral"
          providerLabel="Mistral"
        />,
      );
      const link = screen.getByText("Mistral API keys") as HTMLAnchorElement;

      expect(link.href).toBe(
        "https://console.mistral.ai/home?workspace_dialog=apiKeys",
      );
    });

    it("shows OpenRouter API key link", () => {
      render(
        <ConnectionTab
          {...defaultProps}
          provider="openrouter"
          providerLabel="OpenRouter"
        />,
      );
      const link = screen.getByText("OpenRouter API keys") as HTMLAnchorElement;

      expect(link.href).toBe("https://openrouter.ai/settings/keys");
    });

    it("does not show API key link for custom provider", () => {
      render(
        <ConnectionTab
          {...defaultProps}
          provider="custom"
          providerLabel="Custom"
        />,
      );
      expect(screen.queryByText("Custom API keys")).toBeNull();
    });
  });

  describe("local providers - base URL input", () => {
    it("renders base URL input for LM Studio", () => {
      render(
        <ConnectionTab
          {...defaultProps}
          provider="lmstudio"
          baseUrl="http://localhost:1234"
          providerLabel="LM Studio"
        />,
      );
      expect(screen.getByText("URL")).toBeDefined();
      expect(
        screen.getByPlaceholderText("http://localhost:1234"),
      ).toBeDefined();
    });

    it("renders base URL input for Ollama", () => {
      render(
        <ConnectionTab
          {...defaultProps}
          provider="ollama"
          baseUrl="http://localhost:11434"
          providerLabel="Ollama"
        />,
      );
      expect(
        screen.getByPlaceholderText("http://localhost:11434"),
      ).toBeDefined();
    });

    it("does not render API key input for LM Studio", () => {
      render(
        <ConnectionTab
          {...defaultProps}
          provider="lmstudio"
          baseUrl="http://localhost:1234"
          providerLabel="LM Studio"
        />,
      );
      expect(screen.queryByPlaceholderText(/API key/)).toBeNull();
    });

    it("does not render API key input for Ollama", () => {
      render(
        <ConnectionTab
          {...defaultProps}
          provider="ollama"
          baseUrl="http://localhost:11434"
          providerLabel="Ollama"
        />,
      );
      expect(screen.queryByPlaceholderText(/API key/)).toBeNull();
    });

    it("calls setBaseUrl when URL input changes for LM Studio", () => {
      const setBaseUrl = vi.fn();

      render(
        <ConnectionTab
          {...defaultProps}
          provider="lmstudio"
          baseUrl="http://localhost:1234"
          setBaseUrl={setBaseUrl}
          providerLabel="LM Studio"
        />,
      );

      const input = screen.getByPlaceholderText("http://localhost:1234");

      fireEvent.change(input, {
        target: { value: "http://192.168.1.100:1234" },
      });

      expect(setBaseUrl).toHaveBeenCalledWith("http://192.168.1.100:1234");
    });

    it("calls setBaseUrl when URL input changes for Ollama", () => {
      const setBaseUrl = vi.fn();

      render(
        <ConnectionTab
          {...defaultProps}
          provider="ollama"
          baseUrl="http://localhost:11434"
          setBaseUrl={setBaseUrl}
          providerLabel="Ollama"
        />,
      );

      const input = screen.getByPlaceholderText("http://localhost:11434");

      fireEvent.change(input, {
        target: { value: "http://192.168.1.100:11434" },
      });

      expect(setBaseUrl).toHaveBeenCalledWith("http://192.168.1.100:11434");
    });

    it("displays default URL hint for LM Studio", () => {
      render(
        <ConnectionTab
          {...defaultProps}
          provider="lmstudio"
          baseUrl="http://localhost:1234"
          providerLabel="LM Studio"
        />,
      );
      expect(screen.getByText("Default: http://localhost:1234")).toBeDefined();
    });

    it("displays default URL hint for Ollama", () => {
      render(
        <ConnectionTab
          {...defaultProps}
          provider="ollama"
          baseUrl="http://localhost:11434"
          providerLabel="Ollama"
        />,
      );
      expect(screen.getByText("Default: http://localhost:11434")).toBeDefined();
    });

    it("displays custom URL value in input", () => {
      render(
        <ConnectionTab
          {...defaultProps}
          provider="lmstudio"
          baseUrl="http://192.168.1.50:1234"
          providerLabel="LM Studio"
        />,
      );
      const input = screen.getByPlaceholderText(
        "http://localhost:1234",
      ) as HTMLInputElement;

      expect(input.value).toBe("http://192.168.1.50:1234");
    });

    it("does not render base URL input when setBaseUrl is not provided", () => {
      render(
        <ConnectionTab
          {...defaultProps}
          provider="lmstudio"
          baseUrl="http://localhost:1234"
          setBaseUrl={undefined}
          providerLabel="LM Studio"
        />,
      );
      expect(screen.queryByPlaceholderText("http://localhost:1234")).toBeNull();
    });
  });

  describe("custom provider - base URL input", () => {
    it("renders base URL input for custom provider", () => {
      render(
        <ConnectionTab
          {...defaultProps}
          provider="custom"
          providerLabel="Custom"
        />,
      );
      expect(
        screen.getByPlaceholderText("https://api.example.com/v1"),
      ).toBeDefined();
      expect(screen.getByText("URL")).toBeDefined();
    });

    it("does not render base URL input for other providers", () => {
      render(<ConnectionTab {...defaultProps} provider="gemini" />);
      expect(
        screen.queryByPlaceholderText("https://api.example.com/v1"),
      ).toBeNull();
    });

    it("calls setBaseUrl when base URL input changes", () => {
      const setBaseUrl = vi.fn();

      render(
        <ConnectionTab
          {...defaultProps}
          provider="custom"
          setBaseUrl={setBaseUrl}
          providerLabel="Custom"
        />,
      );

      const input = screen.getByPlaceholderText("https://api.example.com/v1");

      fireEvent.change(input, { target: { value: "https://my-api.com/v1" } });

      expect(setBaseUrl).toHaveBeenCalledWith("https://my-api.com/v1");
    });

    it("displays existing base URL value", () => {
      render(
        <ConnectionTab
          {...defaultProps}
          provider="custom"
          baseUrl="https://existing.api/v1"
          providerLabel="Custom"
        />,
      );

      const input = screen.getByPlaceholderText(
        "https://api.example.com/v1",
      ) as HTMLInputElement;

      expect(input.value).toBe("https://existing.api/v1");
    });

    it("displays empty string when baseUrl is null", () => {
      render(
        <ConnectionTab
          {...defaultProps}
          provider="custom"
          baseUrl={null}
          providerLabel="Custom"
        />,
      );

      const input = screen.getByPlaceholderText(
        "https://api.example.com/v1",
      ) as HTMLInputElement;

      expect(input.value).toBe("");
    });

    it("does not render base URL input when setBaseUrl is not provided", () => {
      render(
        <ConnectionTab
          {...defaultProps}
          provider="custom"
          setBaseUrl={undefined}
          providerLabel="Custom"
        />,
      );
      expect(
        screen.queryByPlaceholderText("https://api.example.com/v1"),
      ).toBeNull();
    });

    it("shows OpenAI-compatible API endpoint text", () => {
      render(
        <ConnectionTab
          {...defaultProps}
          provider="custom"
          providerLabel="Custom"
        />,
      );
      expect(screen.getByText("OpenAI-compatible API endpoint")).toBeDefined();
    });
  });

  describe("model documentation links", () => {
    it("shows Gemini models link", () => {
      render(<ConnectionTab {...defaultProps} provider="gemini" />);
      const link = screen.getByText("Gemini models") as HTMLAnchorElement;

      expect(link.href).toBe("https://ai.google.dev/gemini-api/docs/models");
      expect(link.target).toBe("_blank");
    });

    it("shows OpenAI models link", () => {
      render(
        <ConnectionTab
          {...defaultProps}
          provider="openai"
          providerLabel="OpenAI"
        />,
      );
      const link = screen.getByText("OpenAI models") as HTMLAnchorElement;

      expect(link.href).toBe("https://platform.openai.com/docs/models");
    });

    it("shows Mistral models link", () => {
      render(
        <ConnectionTab
          {...defaultProps}
          provider="mistral"
          providerLabel="Mistral"
        />,
      );
      const link = screen.getByText("Mistral models") as HTMLAnchorElement;

      expect(link.href).toBe("https://docs.mistral.ai/getting-started/models");
    });

    it("shows OpenRouter models link", () => {
      render(
        <ConnectionTab
          {...defaultProps}
          provider="openrouter"
          providerLabel="OpenRouter"
        />,
      );
      const link = screen.getByText("OpenRouter models") as HTMLAnchorElement;

      expect(link.href).toBe("https://openrouter.ai/models");
    });

    it("shows LM Studio models link", () => {
      render(
        <ConnectionTab
          {...defaultProps}
          provider="lmstudio"
          baseUrl="http://localhost:1234"
          providerLabel="LM Studio"
        />,
      );
      const link = screen.getByText("LM Studio models") as HTMLAnchorElement;

      expect(link.href).toBe("https://lmstudio.ai/models");
    });

    it("shows Ollama models link", () => {
      render(
        <ConnectionTab
          {...defaultProps}
          provider="ollama"
          baseUrl="http://localhost:11434"
          providerLabel="Ollama"
        />,
      );
      const link = screen.getByText("Ollama models") as HTMLAnchorElement;

      expect(link.href).toBe("https://ollama.com/search");
    });

    it("does not show models link for custom provider", () => {
      render(
        <ConnectionTab
          {...defaultProps}
          provider="custom"
          providerLabel="Custom"
        />,
      );
      expect(screen.queryByText("Custom models")).toBeNull();
    });
  });

  describe("small model mode toggle", () => {
    it("does not render for gemini provider", () => {
      const { container } = render(
        <ConnectionTab {...defaultProps} provider="gemini" />,
      );

      expect(container.querySelector("#smallModelMode")).toBeNull();
    });

    it("does not render for openai provider", () => {
      const { container } = render(
        <ConnectionTab {...defaultProps} provider="openai" />,
      );

      expect(container.querySelector("#smallModelMode")).toBeNull();
    });

    it("does not render for mistral provider", () => {
      const { container } = render(
        <ConnectionTab {...defaultProps} provider="mistral" />,
      );

      expect(container.querySelector("#smallModelMode")).toBeNull();
    });

    it("renders for openrouter provider", () => {
      const { container } = render(
        <ConnectionTab {...defaultProps} provider="openrouter" />,
      );

      expect(container.querySelector("#smallModelMode")).toBeDefined();
    });

    it("renders for lmstudio provider", () => {
      const { container } = render(
        <ConnectionTab {...defaultProps} provider="lmstudio" />,
      );

      expect(container.querySelector("#smallModelMode")).toBeDefined();
    });

    it("renders for ollama provider", () => {
      const { container } = render(
        <ConnectionTab {...defaultProps} provider="ollama" />,
      );

      expect(container.querySelector("#smallModelMode")).toBeDefined();
    });

    it("renders for custom provider", () => {
      const { container } = render(
        <ConnectionTab {...defaultProps} provider="custom" />,
      );

      expect(container.querySelector("#smallModelMode")).toBeDefined();
    });

    it("reflects smallModelMode prop value", () => {
      const { container } = render(
        <ConnectionTab
          {...defaultProps}
          provider="openrouter"
          smallModelMode={true}
        />,
      );
      const checkbox = container.querySelector(
        "#smallModelMode",
      ) as HTMLInputElement;

      expect(checkbox.checked).toBe(true);
    });

    it("calls setSmallModelMode when toggled", () => {
      const setSmallModelMode = vi.fn();
      const { container } = render(
        <ConnectionTab
          {...defaultProps}
          provider="openrouter"
          setSmallModelMode={setSmallModelMode}
        />,
      );
      const checkbox = container.querySelector(
        "#smallModelMode",
      ) as HTMLInputElement;

      fireEvent.click(checkbox);
      expect(setSmallModelMode).toHaveBeenCalled();
    });
  });

  describe("child component rendering", () => {
    it("renders ProviderSelector with correct provider", () => {
      render(<ConnectionTab {...defaultProps} provider="openai" />);
      expect(screen.getByTestId("provider-selector").textContent).toBe(
        "openai",
      );
    });

    it("renders ModelSelector with correct model", () => {
      render(<ConnectionTab {...defaultProps} model="gpt-4" />);
      expect(screen.getByTestId("model-selector").textContent).toBe("gpt-4");
    });
  });
});
