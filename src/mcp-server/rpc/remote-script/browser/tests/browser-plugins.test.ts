// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { beforeEach, describe, expect, it, vi } from "vitest";
import { listBrowserPlugins } from "../browser-plugins.ts";

vi.mock(import("../browser-device-lookup.ts"), async (importOriginal) => ({
  ...(await importOriginal()),
  listBrowser: vi.fn(),
}));

const lookup = await import("../browser-device-lookup.ts");

function answer(items: object[], echoed = true): void {
  vi.mocked(lookup.listBrowser).mockResolvedValue({
    available: true,
    status: 200,
    body: echoed ? { items, plugins_only: true } : { items },
  });
}

describe("listBrowserPlugins", () => {
  beforeEach(() => {
    vi.mocked(lookup.listBrowser).mockReset();
  });

  it("asks for plug-ins without their presets", async () => {
    answer([]);

    await listBrowserPlugins();

    expect(lookup.listBrowser).toHaveBeenCalledWith(
      { type: "plugin", plugins_only: "true" },
      expect.any(Number),
    );
  });

  it("reads format, vendor and name off the browser path", async () => {
    answer([
      { name: "ValhallaRoom", path: "VST3/Valhalla DSP/ValhallaRoom" },
      { name: "Serum", path: "VST/Xfer Records/Serum" },
      { name: "AUDelay", path: "Audio Units/Apple/AUDelay" },
      { name: "Odd", path: "Mystery/Co/Odd" },
      { name: "Loose", path: "VST3/Loose" },
    ]);

    expect(await listBrowserPlugins()).toStrictEqual([
      { name: "ValhallaRoom", vendor: "Valhalla DSP", format: "VST3" },
      { name: "Serum", vendor: "Xfer Records", format: "VST" },
      { name: "AUDelay", vendor: "Apple", format: "AU" },
      { name: "Odd", vendor: "Co", format: null },
      { name: "Loose", vendor: null, format: "VST3" },
    ]);
  });

  it("returns null when the remote script isn't there", async () => {
    vi.mocked(lookup.listBrowser).mockResolvedValue({ available: false });

    expect(await listBrowserPlugins()).toBeNull();
  });

  it("returns null on an error status", async () => {
    vi.mocked(lookup.listBrowser).mockResolvedValue({
      available: true,
      status: 500,
      body: { error: "boom" },
    });

    expect(await listBrowserPlugins()).toBeNull();
  });

  it("returns null from a script that doesn't know plugins_only", async () => {
    answer(
      [{ name: "Big Hall", path: "VST3/Valhalla DSP/ValhallaRoom/Big Hall" }],
      false,
    );

    expect(await listBrowserPlugins()).toBeNull();
  });

  it("returns null when the browser times out", async () => {
    vi.mocked(lookup.listBrowser).mockRejectedValue(new Error("timed out"));

    expect(await listBrowserPlugins()).toBeNull();
  });
});
