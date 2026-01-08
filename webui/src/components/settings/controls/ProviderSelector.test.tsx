/**
 * @vitest-environment happy-dom
 */
import { render, fireEvent } from "@testing-library/preact";
import { describe, expect, it, vi } from "vitest";
import type { Provider } from "#webui/types/settings";
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

      expect(options).toHaveLength(7);

      const optionData = Array.from(options).map((opt) => ({
        value: opt.value,
        text: opt.textContent,
      }));

      expect(optionData).toStrictEqual([
        { value: "gemini", text: "Google" },
        { value: "openai", text: "OpenAI" },
        { value: "mistral", text: "Mistral" },
        { value: "openrouter", text: "OpenRouter" },
        { value: "lmstudio", text: "LM Studio (local)" },
        { value: "ollama", text: "Ollama (local)" },
        { value: "custom", text: "Custom (OpenAI-compatible)" },
      ]);
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
