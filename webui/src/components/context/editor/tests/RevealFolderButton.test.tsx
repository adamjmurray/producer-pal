// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * @vitest-environment happy-dom
 */
import { act, fireEvent, render, screen } from "@testing-library/preact";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RevealFolderButton } from "#webui/components/context/editor/RevealFolderButton";

describe("RevealFolderButton", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn().mockResolvedValue({ ok: true });
    globalThis.fetch = fetchMock as unknown as typeof fetch;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("POSTs to the reveal-config-folder endpoint on click", async () => {
    render(<RevealFolderButton />);

    await act(async () => {
      fireEvent.click(screen.getByLabelText("Open config folder"));
      await Promise.resolve();
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];

    expect(url).toMatch(/\/reveal-config-folder$/);
    expect(init.method).toBe("POST");
  });

  it("warns without throwing when the request rejects", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    fetchMock.mockRejectedValue(new Error("network down"));
    render(<RevealFolderButton />);

    await act(async () => {
      fireEvent.click(screen.getByLabelText("Open config folder"));
      await Promise.resolve();
    });

    expect(warn).toHaveBeenCalled();
  });

  it("warns when the server responds non-ok", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    fetchMock.mockResolvedValue({ ok: false, status: 403 });
    render(<RevealFolderButton />);

    await act(async () => {
      fireEvent.click(screen.getByLabelText("Open config folder"));
      await Promise.resolve();
    });

    expect(warn).toHaveBeenCalledWith(expect.stringContaining("403"));
  });
});
