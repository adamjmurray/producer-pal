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
          thinking="Auto"
          setThinking={setThinking}
          showThoughts={true}
          setShowThoughts={setShowThoughts}
        />,
      );

      const select = screen.getByRole("combobox") as HTMLSelectElement;
      expect(select.value).toBe("Auto");
    });

    it("displays all thinking options", () => {
      const setThinking = vi.fn();
      const setShowThoughts = vi.fn();
      render(
        <ThinkingSettings
          provider="gemini"
          model="gemini-2.5-flash"
          thinking="Auto"
          setThinking={setThinking}
          showThoughts={true}
          setShowThoughts={setShowThoughts}
        />,
      );

      expect(screen.getByRole("option", { name: "Off" })).toBeDefined();
      expect(screen.getByRole("option", { name: "Auto" })).toBeDefined();
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
          thinking="Auto"
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
    it("renders thinking options without Gemini-specific options", () => {
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

      // Should have common options
      expect(screen.getByRole("option", { name: "Low" })).toBeDefined();
      expect(screen.getByRole("option", { name: "Medium" })).toBeDefined();
      expect(screen.getByRole("option", { name: "High" })).toBeDefined();
      // Should not have Gemini-specific options
      expect(screen.queryByRole("option", { name: "Off" })).toBeNull();
      expect(screen.queryByRole("option", { name: "Auto" })).toBeNull();
      expect(screen.queryByRole("option", { name: "Ultra" })).toBeNull();
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

    it("renders nothing for openrouter provider", () => {
      const setThinking = vi.fn();
      const setShowThoughts = vi.fn();
      const { container } = render(
        <ThinkingSettings
          provider="openrouter"
          model="minimax/minimax-m2:free"
          thinking="Low"
          setThinking={setThinking}
          showThoughts={true}
          setShowThoughts={setShowThoughts}
        />,
      );

      expect(container.textContent).toBe("");
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
          thinking="Auto"
          setThinking={setThinking}
          showThoughts={true}
          setShowThoughts={setShowThoughts}
        />,
      );

      const select = screen.getByRole("combobox");
      fireEvent.change(select, { target: { value: "High" } });

      expect(setThinking).toHaveBeenCalledOnce();
      expect(setThinking).toHaveBeenCalledWith("High");
    });

    it("checkbox reflects showThoughts prop", () => {
      const setThinking = vi.fn();
      const setShowThoughts = vi.fn();
      render(
        <ThinkingSettings
          provider="gemini"
          model="gemini-2.5-flash"
          thinking="Auto"
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
          thinking="Auto"
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
          thinking="Auto"
          setThinking={setThinking}
          showThoughts={false}
          setShowThoughts={setShowThoughts}
        />,
      );

      const checkbox = screen.getByRole("checkbox");
      fireEvent.click(checkbox);

      expect(setShowThoughts).toHaveBeenCalledOnce();
      expect(setShowThoughts).toHaveBeenCalledWith(true);
    });

    it("calls setShowThoughts with false when unchecking", () => {
      const setThinking = vi.fn();
      const setShowThoughts = vi.fn();
      render(
        <ThinkingSettings
          provider="gemini"
          model="gemini-2.5-flash"
          thinking="Auto"
          setThinking={setThinking}
          showThoughts={true}
          setShowThoughts={setShowThoughts}
        />,
      );

      const checkbox = screen.getByRole("checkbox");
      fireEvent.click(checkbox);

      expect(setShowThoughts).toHaveBeenCalledOnce();
      expect(setShowThoughts).toHaveBeenCalledWith(false);
    });
  });
});
