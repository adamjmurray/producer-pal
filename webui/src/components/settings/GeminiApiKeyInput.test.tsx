/**
 * @vitest-environment happy-dom
 */
import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/preact";
import { GeminiApiKeyInput } from "./GeminiApiKeyInput.jsx";

describe("GeminiApiKeyInput", () => {
  it("renders password input with correct value", () => {
    const setApiKey = vi.fn();
    render(
      <GeminiApiKeyInput
        apiKey="test-key"
        setApiKey={setApiKey}
        hasApiKey={true}
      />,
    );

    const input = screen.getByPlaceholderText("Enter your API key") as HTMLInputElement;
    expect(input.type).toBe("password");
    expect(input.value).toBe("test-key");
  });

  it("autofocuses input when hasApiKey is false", () => {
    const setApiKey = vi.fn();
    render(
      <GeminiApiKeyInput apiKey="" setApiKey={setApiKey} hasApiKey={false} />,
    );

    const input = screen.getByPlaceholderText("Enter your API key");
    expect(input.autofocus).toBe(true);
  });

  it("does not autofocus input when hasApiKey is true", () => {
    const setApiKey = vi.fn();
    render(
      <GeminiApiKeyInput
        apiKey="test-key"
        setApiKey={setApiKey}
        hasApiKey={true}
      />,
    );

    const input = screen.getByPlaceholderText("Enter your API key");
    expect(input.autofocus).toBe(false);
  });

  it("triggers setApiKey callback on input", () => {
    const setApiKey = vi.fn();
    render(
      <GeminiApiKeyInput
        apiKey="test-key"
        setApiKey={setApiKey}
        hasApiKey={true}
      />,
    );

    const input = screen.getByPlaceholderText("Enter your API key");
    fireEvent.input(input, { target: { value: "new-key" } });

    expect(setApiKey).toHaveBeenCalledOnce();
    expect(setApiKey).toHaveBeenCalledWith("new-key");
  });

  it("shows help text when hasApiKey is false", () => {
    const setApiKey = vi.fn();
    render(
      <GeminiApiKeyInput apiKey="" setApiKey={setApiKey} hasApiKey={false} />,
    );

    expect(screen.getByText("Get a Gemini API Key")).toBeDefined();
    expect(screen.getByText(/free, requires Google account/)).toBeDefined();
  });

  it("hides help text when hasApiKey is true", () => {
    const setApiKey = vi.fn();
    render(
      <GeminiApiKeyInput
        apiKey="test-key"
        setApiKey={setApiKey}
        hasApiKey={true}
      />,
    );

    expect(screen.queryByText("Get a Gemini API Key")).toBeNull();
    expect(screen.queryByText(/free, requires Google account/)).toBeNull();
  });

  it("help text link has correct href", () => {
    const setApiKey = vi.fn();
    render(
      <GeminiApiKeyInput apiKey="" setApiKey={setApiKey} hasApiKey={false} />,
    );

    const link = screen.getByRole("link", { name: "Get a Gemini API Key" }) as HTMLAnchorElement;
    expect(link.href).toBe("https://aistudio.google.com/api-keys");
    expect(link.target).toBe("_blank");
  });
});
