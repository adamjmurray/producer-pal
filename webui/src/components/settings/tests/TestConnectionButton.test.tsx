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

import { TestConnectionButton } from "#webui/components/settings/TestConnectionButton";

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

    expect(screen.getByTestId("test-connection-button").textContent).toBe(
      "Test Connection",
    );
  });

  it("shows Testing... while in progress", async () => {
    let resolve!: (value: { ok: boolean; message: string }) => void;

    mockTestConnection.mockReturnValue(
      new Promise((r) => {
        resolve = r;
      }),
    );

    render(<TestConnectionButton provider="openai" apiKey="key" />);

    fireEvent.click(screen.getByTestId("test-connection-button"));

    expect(screen.getByTestId("test-connection-button").textContent).toBe(
      "Testing\u2026",
    );

    expect(
      (screen.getByTestId("test-connection-button") as HTMLButtonElement)
        .disabled,
    ).toBe(true);

    resolve({ ok: true, message: "Connected" });
  });

  it("shows success message", async () => {
    mockTestConnection.mockResolvedValue({ ok: true, message: "Connected" });

    render(<TestConnectionButton provider="openai" apiKey="key" />);

    fireEvent.click(screen.getByTestId("test-connection-button"));

    await waitFor(() => {
      expect(screen.getByTestId("test-connection-message").textContent).toBe(
        "Connected",
      );
    });

    expect(screen.getByTestId("test-connection-message").className).toContain(
      "text-green",
    );
  });

  it("shows error message", async () => {
    mockTestConnection.mockResolvedValue({
      ok: false,
      message: "Invalid API key",
    });

    render(<TestConnectionButton provider="openai" apiKey="key" />);

    fireEvent.click(screen.getByTestId("test-connection-button"));

    await waitFor(() => {
      expect(screen.getByTestId("test-connection-message").textContent).toBe(
        "Invalid API key",
      );
    });

    expect(screen.getByTestId("test-connection-message").className).toContain(
      "text-red",
    );
  });

  it("auto-clears status after timeout", async () => {
    mockTestConnection.mockResolvedValue({ ok: true, message: "Connected" });

    render(<TestConnectionButton provider="openai" apiKey="key" />);

    fireEvent.click(screen.getByTestId("test-connection-button"));

    await waitFor(() => {
      expect(screen.getByTestId("test-connection-message")).toBeDefined();
    });

    vi.advanceTimersByTime(5000);

    await waitFor(() => {
      expect(screen.queryByTestId("test-connection-message")).toBeNull();
    });
  });

  it("passes provider, apiKey, and baseUrl to testConnection", async () => {
    mockTestConnection.mockResolvedValue({ ok: true, message: "Connected" });

    render(
      <TestConnectionButton
        provider="ollama"
        apiKey=""
        baseUrl="http://myhost:9999"
      />,
    );

    fireEvent.click(screen.getByTestId("test-connection-button"));

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

    render(
      <TestConnectionButton provider="openai" apiKey="key" baseUrl={null} />,
    );

    fireEvent.click(screen.getByTestId("test-connection-button"));

    await waitFor(() => {
      expect(mockTestConnection).toHaveBeenCalledWith(
        "openai",
        "key",
        undefined,
      );
    });
  });
});
