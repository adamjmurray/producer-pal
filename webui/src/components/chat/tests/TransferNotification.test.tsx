// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * @vitest-environment happy-dom
 */
import { render, screen } from "@testing-library/preact";
import { describe, expect, it, vi } from "vitest";
import { TransferNotification } from "#webui/components/chat/TransferNotification";

describe("TransferNotification", () => {
  it("renders success notification with green styling", () => {
    render(
      <TransferNotification
        notification={{ message: "Exported 3 conversations", type: "success" }}
        onDismiss={vi.fn()}
      />,
    );

    expect(screen.getByText("Exported 3 conversations")).toBeDefined();

    const banner = screen.getByRole("status");

    expect(banner.className).toContain("bg-green-50");
  });

  it("renders error notification with red styling", () => {
    render(
      <TransferNotification
        notification={{ message: "Import failed: bad data", type: "error" }}
        onDismiss={vi.fn()}
      />,
    );

    expect(screen.getByText("Import failed: bad data")).toBeDefined();

    const banner = screen.getByRole("status");

    expect(banner.className).toContain("bg-red-50");
  });

  it("renders warning notification with amber styling", () => {
    render(
      <TransferNotification
        notification={{ message: "Some items skipped", type: "warning" }}
        onDismiss={vi.fn()}
      />,
    );

    expect(screen.getByText("Some items skipped")).toBeDefined();

    const banner = screen.getByRole("status");

    expect(banner.className).toContain("bg-amber-50");
  });

  it("calls onDismiss when dismiss button is clicked", () => {
    const onDismiss = vi.fn();

    render(
      <TransferNotification
        notification={{ message: "Test", type: "success" }}
        onDismiss={onDismiss}
      />,
    );

    screen.getByLabelText("Dismiss notification").click();
    expect(onDismiss).toHaveBeenCalledOnce();
  });
});
