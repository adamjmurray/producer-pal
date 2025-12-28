/**
 * @vitest-environment happy-dom
 */
import { render, screen, fireEvent } from "@testing-library/preact";
import { describe, expect, it, vi } from "vitest";
import { ThinkingSettings } from "./ThinkingSettings";

describe("ThinkingSettings", () => {
  describe("Gemini provider", () => {
    it("renders with correct selected thinking value", () => {
      const setThinking = vi.fn();
      const setShowThoughts = vi.fn();
      render(
        <ThinkingSettings
          provider="gemini"
          model="gemini-2.5-flash"
          thinking="Default"
          setThinking={setThinking}
          showThoughts={true}
          setShowThoughts={setShowThoughts}
        />,
      );

      const select = screen.getByRole("combobox") as HTMLSelectElement;
      expect(select.value).toBe("Default");
    });

    it("displays all thinking options", () => {
      const setThinking = vi.fn();
      const setShowThoughts = vi.fn();
      render(
        <ThinkingSettings
          provider="gemini"
          model="gemini-2.5-flash"
          thinking="Default"
          setThinking={setThinking}
          showThoughts={true}
          setShowThoughts={setShowThoughts}
        />,
      );

      expect(screen.getByRole("option", { name: "Default" })).toBeDefined();
      expect(screen.getByRole("option", { name: "Off" })).toBeDefined();
      expect(screen.getByRole("option", { name: "Minimal" })).toBeDefined();
      expect(screen.getByRole("option", { name: "Low" })).toBeDefined();
      expect(screen.getByRole("option", { name: "Medium" })).toBeDefined();
      expect(screen.getByRole("option", { name: "High" })).toBeDefined();
      expect(screen.getByRole("option", { name: "Ultra" })).toBeDefined();
    });

    it("shows checkbox when thinking is not Off", () => {
      const setThinking = vi.fn();
      const setShowThoughts = vi.fn();
      render(
        <ThinkingSettings
          provider="gemini"
          model="gemini-2.5-flash"
          thinking="Default"
          setThinking={setThinking}
          showThoughts={true}
          setShowThoughts={setShowThoughts}
        />,
      );

      const checkbox = screen.getByRole("checkbox");
      expect(checkbox).toBeDefined();
      expect(screen.getByText("Show thinking process")).toBeDefined();
    });

    it("hides checkbox when thinking is Off", () => {
      const setThinking = vi.fn();
      const setShowThoughts = vi.fn();
      render(
        <ThinkingSettings
          provider="gemini"
          model="gemini-2.5-flash"
          thinking="Off"
          setThinking={setThinking}
          showThoughts={true}
          setShowThoughts={setShowThoughts}
        />,
      );

      expect(screen.queryByRole("checkbox")).toBeNull();
      expect(screen.queryByText("Show thinking process")).toBeNull();
    });
  });

  describe("OpenAI provider", () => {
    it("renders all thinking options (unified with other providers)", () => {
      const setThinking = vi.fn();
      const setShowThoughts = vi.fn();
      render(
        <ThinkingSettings
          provider="openai"
          model="gpt-5-2025-08-07"
          thinking="Low"
          setThinking={setThinking}
          showThoughts={true}
          setShowThoughts={setShowThoughts}
        />,
      );

      // All providers now have the same unified options
      expect(screen.getByRole("option", { name: "Default" })).toBeDefined();
      expect(screen.getByRole("option", { name: "Off" })).toBeDefined();
      expect(screen.getByRole("option", { name: "Minimal" })).toBeDefined();
      expect(screen.getByRole("option", { name: "Low" })).toBeDefined();
      expect(screen.getByRole("option", { name: "Medium" })).toBeDefined();
      expect(screen.getByRole("option", { name: "High" })).toBeDefined();
      expect(screen.getByRole("option", { name: "Ultra" })).toBeDefined();
    });

    it("does not show checkbox for OpenAI provider", () => {
      const setThinking = vi.fn();
      const setShowThoughts = vi.fn();
      render(
        <ThinkingSettings
          provider="openai"
          model="gpt-5-2025-08-07"
          thinking="Low"
          setThinking={setThinking}
          showThoughts={true}
          setShowThoughts={setShowThoughts}
        />,
      );

      expect(screen.queryByRole("checkbox")).toBeNull();
      expect(screen.queryByText("Show thinking process")).toBeNull();
    });
  });

  describe("non-supported providers", () => {
    it("renders nothing for mistral provider", () => {
      const setThinking = vi.fn();
      const setShowThoughts = vi.fn();
      const { container } = render(
        <ThinkingSettings
          provider="mistral"
          model="mistral-large-latest"
          thinking="Low"
          setThinking={setThinking}
          showThoughts={true}
          setShowThoughts={setShowThoughts}
        />,
      );

      expect(container.textContent).toBe("");
      expect(screen.queryByRole("combobox")).toBeNull();
    });
  });

  describe("OpenRouter provider", () => {
    it("renders all unified thinking options", () => {
      const setThinking = vi.fn();
      const setShowThoughts = vi.fn();
      render(
        <ThinkingSettings
          provider="openrouter"
          model="anthropic/claude-sonnet"
          thinking="Low"
          setThinking={setThinking}
          showThoughts={true}
          setShowThoughts={setShowThoughts}
        />,
      );

      // All providers now have the same unified options
      expect(screen.getByRole("option", { name: "Default" })).toBeDefined();
      expect(screen.getByRole("option", { name: "Off" })).toBeDefined();
      expect(screen.getByRole("option", { name: "Minimal" })).toBeDefined();
      expect(screen.getByRole("option", { name: "Low" })).toBeDefined();
      expect(screen.getByRole("option", { name: "Medium" })).toBeDefined();
      expect(screen.getByRole("option", { name: "High" })).toBeDefined();
      expect(screen.getByRole("option", { name: "Ultra" })).toBeDefined();
    });

    it("shows checkbox when thinking is not Off", () => {
      const setThinking = vi.fn();
      const setShowThoughts = vi.fn();
      render(
        <ThinkingSettings
          provider="openrouter"
          model="anthropic/claude-sonnet"
          thinking="Low"
          setThinking={setThinking}
          showThoughts={true}
          setShowThoughts={setShowThoughts}
        />,
      );

      const checkbox = screen.getByRole("checkbox");
      expect(checkbox).toBeDefined();
      expect(screen.getByText("Show thinking process")).toBeDefined();
    });

    it("hides checkbox when thinking is Off", () => {
      const setThinking = vi.fn();
      const setShowThoughts = vi.fn();
      render(
        <ThinkingSettings
          provider="openrouter"
          model="anthropic/claude-sonnet"
          thinking="Off"
          setThinking={setThinking}
          showThoughts={true}
          setShowThoughts={setShowThoughts}
        />,
      );

      expect(screen.queryByRole("checkbox")).toBeNull();
      expect(screen.queryByText("Show thinking process")).toBeNull();
    });
  });

  describe("common behavior", () => {
    it("triggers setThinking callback on select change", () => {
      const setThinking = vi.fn();
      const setShowThoughts = vi.fn();
      render(
        <ThinkingSettings
          provider="gemini"
          model="gemini-2.5-flash"
          thinking="Default"
          setThinking={setThinking}
          showThoughts={true}
          setShowThoughts={setShowThoughts}
        />,
      );

      const select = screen.getByRole("combobox");
      fireEvent.change(select, { target: { value: "High" } });

      expect(setThinking).toHaveBeenCalledExactlyOnceWith("High");
    });

    it("checkbox reflects showThoughts prop", () => {
      const setThinking = vi.fn();
      const setShowThoughts = vi.fn();
      render(
        <ThinkingSettings
          provider="gemini"
          model="gemini-2.5-flash"
          thinking="Default"
          setThinking={setThinking}
          showThoughts={false}
          setShowThoughts={setShowThoughts}
        />,
      );

      const checkbox = screen.getByRole("checkbox") as HTMLInputElement;
      expect(checkbox.checked).toBe(false);
    });

    it("checkbox is checked when showThoughts is true", () => {
      const setThinking = vi.fn();
      const setShowThoughts = vi.fn();
      render(
        <ThinkingSettings
          provider="gemini"
          model="gemini-2.5-flash"
          thinking="Default"
          setThinking={setThinking}
          showThoughts={true}
          setShowThoughts={setShowThoughts}
        />,
      );

      const checkbox = screen.getByRole("checkbox") as HTMLInputElement;
      expect(checkbox.checked).toBe(true);
    });

    it("triggers setShowThoughts callback on checkbox change", () => {
      const setThinking = vi.fn();
      const setShowThoughts = vi.fn();
      render(
        <ThinkingSettings
          provider="gemini"
          model="gemini-2.5-flash"
          thinking="Default"
          setThinking={setThinking}
          showThoughts={false}
          setShowThoughts={setShowThoughts}
        />,
      );

      const checkbox = screen.getByRole("checkbox");
      fireEvent.click(checkbox);

      expect(setShowThoughts).toHaveBeenCalledExactlyOnceWith(true);
    });

    it("calls setShowThoughts with false when unchecking", () => {
      const setThinking = vi.fn();
      const setShowThoughts = vi.fn();
      render(
        <ThinkingSettings
          provider="gemini"
          model="gemini-2.5-flash"
          thinking="Default"
          setThinking={setThinking}
          showThoughts={true}
          setShowThoughts={setShowThoughts}
        />,
      );

      const checkbox = screen.getByRole("checkbox");
      fireEvent.click(checkbox);

      expect(setShowThoughts).toHaveBeenCalledExactlyOnceWith(false);
    });
  });
});
