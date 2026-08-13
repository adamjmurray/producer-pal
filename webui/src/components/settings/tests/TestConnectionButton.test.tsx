// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * @vitest-environment happy-dom
 */
import { fireEvent, render, screen, waitFor } from "@testing-library/preact";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { mockTestConnection } = vi.hoisted(() => ({
  mockTestConnection: vi.fn(),
}));

vi.mock(import("#webui/utils/test-connection"), () => ({
  testConnection: mockTestConnection,
}));

import { type ComponentProps } from "preact";
import { TestConnectionButton } from "#webui/components/settings/TestConnectionButton";

const button = () =>
  screen.getByTestId("test-connection-button") as HTMLButtonElement;
const message = () => screen.getByTestId("test-connection-message");

/**
 * Render the button and click it. Defaults to the openai/key pairing the
 * status tests use; the prop-forwarding tests pass overrides.
 */
const clickTest = (
  overrides: Partial<ComponentProps<typeof TestConnectionButton>> = {},
): void => {
  render(
    <TestConnectionButton provider="openai" apiKey="key" {...overrides} />,
  );
  fireEvent.click(button());
};

/** Wait for the status message to appear. */
const waitForMessage = (): Promise<void> =>
  waitFor(() => {
    expect(message()).toBeDefined();
  });

/** Wait for the status message to read `text`. */
const waitForMessageText = (text: string): Promise<void> =>
  waitFor(() => {
    expect(message().textContent).toBe(text);
  });

describe("TestConnectionButton", () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("renders button with idle text", () => {
    render(<TestConnectionButton provider="openai" apiKey="key" />);

    expect(button().textContent).toBe("Test Connection");
  });

  it("shows Testing... while in progress", async () => {
    let resolve!: (value: { ok: boolean; message: string }) => void;

    mockTestConnection.mockReturnValue(
      new Promise((r) => {
        resolve = r;
      }),
    );

    clickTest();

    expect(button().textContent).toBe("Testing\u2026");

    expect(button().disabled).toBe(true);

    resolve({ ok: true, message: "Connected" });
  });

  it("shows success message", async () => {
    mockTestConnection.mockResolvedValue({ ok: true, message: "Connected" });

    clickTest();

    await waitForMessageText("Connected");

    expect(message().className).toContain("text-green");
  });

  it("shows error message", async () => {
    mockTestConnection.mockResolvedValue({
      ok: false,
      message: "Invalid API key",
    });

    clickTest();

    await waitForMessageText("Invalid API key");

    expect(message().className).toContain("text-red");
  });

  it("auto-clears status after timeout", async () => {
    mockTestConnection.mockResolvedValue({ ok: true, message: "Connected" });

    clickTest();

    await waitForMessage();

    vi.advanceTimersByTime(5000);

    await waitFor(() => {
      expect(screen.queryByTestId("test-connection-message")).toBeNull();
    });
  });

  it("restarts the auto-clear window when tested again", async () => {
    mockTestConnection.mockResolvedValue({ ok: true, message: "Connected" });

    clickTest();
    await waitForMessage();

    vi.advanceTimersByTime(4000);
    fireEvent.click(button());
    await waitForMessage();

    // Past the first click's 5s deadline; only the second timer is live.
    vi.advanceTimersByTime(2000);

    expect(message()).toBeDefined();
  });

  it("passes provider, apiKey, and baseUrl to testConnection", async () => {
    mockTestConnection.mockResolvedValue({ ok: true, message: "Connected" });

    clickTest({
      provider: "ollama",
      apiKey: "",
      baseUrl: "http://myhost:9999",
    });

    await waitFor(() => {
      expect(mockTestConnection).toHaveBeenCalledWith(
        "ollama",
        "",
        "http://myhost:9999",
      );
    });
  });

  it("converts null baseUrl to undefined", async () => {
    mockTestConnection.mockResolvedValue({ ok: true, message: "Connected" });

    clickTest({ baseUrl: null });

    await waitFor(() => {
      expect(mockTestConnection).toHaveBeenCalledWith(
        "openai",
        "key",
        undefined,
      );
    });
  });
});
