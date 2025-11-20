/**
 * @vitest-environment happy-dom
 */
import { render, fireEvent } from "@testing-library/preact";
import { describe, expect, it, vi } from "vitest";
import type { Provider } from "../../types/settings";
import { ProviderSelector } from "./ProviderSelector";

describe("ProviderSelector", () => {
  describe("basic rendering", () => {
    it("renders label and select element", () => {
      const mockSetProvider = vi.fn();
      render(
        <ProviderSelector provider="gemini" setProvider={mockSetProvider} />,
      );

      const label = document.querySelector("label");
      expect(label).toBeDefined();
      expect(label!.textContent).toBe("Provider");

      const select = document.querySelector("select");
      expect(select).toBeDefined();
    });

    it("has correct styling classes", () => {
      const mockSetProvider = vi.fn();
      render(
        <ProviderSelector provider="gemini" setProvider={mockSetProvider} />,
      );

      const select = document.querySelector("select");
      expect(select!.className).toContain("w-full");
      expect(select!.className).toContain("px-3");
      expect(select!.className).toContain("py-2");
      expect(select!.className).toContain("bg-white");
      expect(select!.className).toContain("dark:bg-gray-700");
    });
  });

  describe("provider options", () => {
    it("renders all provider options", () => {
      const mockSetProvider = vi.fn();
      render(
        <ProviderSelector provider="gemini" setProvider={mockSetProvider} />,
      );

      const options = document.querySelectorAll("option");
      expect(options.length).toBe(7);

      expect(options[0]!.value).toBe("gemini");
      expect(options[0]!.textContent).toBe("Google");

      expect(options[1]!.value).toBe("openai");
      expect(options[1]!.textContent).toBe("OpenAI");

      expect(options[2]!.value).toBe("mistral");
      expect(options[2]!.textContent).toBe("Mistral");

      expect(options[3]!.value).toBe("openrouter");
      expect(options[3]!.textContent).toBe("OpenRouter");

      expect(options[4]!.value).toBe("lmstudio");
      expect(options[4]!.textContent).toBe("LM Studio (local)");

      expect(options[5]!.value).toBe("ollama");
      expect(options[5]!.textContent).toBe("Ollama (local)");

      expect(options[6]!.value).toBe("custom");
      expect(options[6]!.textContent).toBe("Custom (OpenAI-compatible)");
    });

    it("shows selected provider", () => {
      const mockSetProvider = vi.fn();
      render(
        <ProviderSelector provider="openai" setProvider={mockSetProvider} />,
      );

      const select = document.querySelector("select") as HTMLSelectElement;
      expect(select.value).toBe("openai");
    });

    it("shows different selected provider", () => {
      const mockSetProvider = vi.fn();
      render(
        <ProviderSelector provider="mistral" setProvider={mockSetProvider} />,
      );

      const select = document.querySelector("select") as HTMLSelectElement;
      expect(select.value).toBe("mistral");
    });
  });

  describe("onChange behavior", () => {
    it("calls setProvider when selection changes", () => {
      const mockSetProvider = vi.fn();
      render(
        <ProviderSelector provider="gemini" setProvider={mockSetProvider} />,
      );

      const select = document.querySelector("select") as HTMLSelectElement;
      fireEvent.change(select, { target: { value: "openai" } });

      expect(mockSetProvider).toHaveBeenCalledTimes(1);
      expect(mockSetProvider).toHaveBeenCalledWith("openai");
    });

    it("calls setProvider with correct value for each option", () => {
      const providers: Provider[] = [
        "gemini",
        "openai",
        "mistral",
        "openrouter",
        "lmstudio",
        "ollama",
        "custom",
      ];

      for (const targetProvider of providers) {
        const mockSetProvider = vi.fn();
        const { container } = render(
          <ProviderSelector provider="gemini" setProvider={mockSetProvider} />,
        );

        const select = container.querySelector("select") as HTMLSelectElement;
        fireEvent.change(select, { target: { value: targetProvider } });

        expect(mockSetProvider).toHaveBeenCalledWith(targetProvider);
      }
    });
  });
});
