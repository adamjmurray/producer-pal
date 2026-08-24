// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
  type MockInstance,
} from "vitest";
import { library } from "../library.ts";

vi.mock(import("#src/live-api-adapter/node-request-v8-protocol.ts"), () => ({
  requestNode: vi.fn(),
  handleNodeResponse: vi.fn(),
}));

const protocolMock =
  await import("#src/live-api-adapter/node-request-v8-protocol.ts");

/**
 * Stub the library.listPlugins route with the given plugins.
 *
 * @param plugins - Plugins the route should return
 */
function mockPluginsRoute(plugins: unknown[] = []): void {
  vi.mocked(protocolMock.requestNode).mockResolvedValue({
    success: true,
    result: { dbAvailable: true, plugins },
  });
}

describe("library tool — listPlugins action", () => {
  let warnSpy: MockInstance<(...args: unknown[]) => void>;

  beforeEach(async () => {
    vi.clearAllMocks();

    const consoleModule = await import("#src/shared/max/v8-max-console.ts");

    warnSpy = vi.spyOn(consoleModule, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    warnSpy.mockRestore();
  });

  it("dispatches to the library.listPlugins route with filters", async () => {
    mockPluginsRoute();

    await library({
      action: "listPlugins",
      query: "serum",
      vendor: "xfer",
      format: "VST",
      subcategory: "synth",
      limit: 10,
    });

    expect(protocolMock.requestNode).toHaveBeenCalledWith(
      "library.listPlugins",
      {
        query: "serum",
        vendor: "xfer",
        format: "VST",
        category: undefined,
        subcategory: "synth",
        limit: 10,
      },
    );
  });

  it("maps deviceKind=instrument to the category filter", async () => {
    mockPluginsRoute();

    await library({ action: "listPlugins", deviceKind: "instrument" });

    expect(protocolMock.requestNode).toHaveBeenCalledWith(
      "library.listPlugins",
      expect.objectContaining({ category: "instrument" }),
    );
  });

  it("drops deviceKind=midifx and warns instead of silently dropping it", async () => {
    mockPluginsRoute();

    await library({ action: "listPlugins", deviceKind: "midifx" });

    expect(protocolMock.requestNode).toHaveBeenCalledWith(
      "library.listPlugins",
      expect.objectContaining({ category: undefined }),
    );
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('deviceKind "midifx"'),
    );
  });

  it("maps deviceKind=audiofx to the category filter without warning", async () => {
    // Pins the second PLUGIN_CATEGORIES member: audiofx is a valid plugin
    // category, so it passes through as category and must not warn.
    mockPluginsRoute();

    await library({ action: "listPlugins", deviceKind: "audiofx" });

    expect(protocolMock.requestNode).toHaveBeenCalledWith(
      "library.listPlugins",
      expect.objectContaining({ category: "audiofx" }),
    );
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it("does not warn for a valid deviceKind or when deviceKind is absent", async () => {
    // Negative control for the warn guard: only an invalid plugin category
    // (e.g. midifx) should warn — a valid one and an absent one must stay silent.
    mockPluginsRoute();

    await library({ action: "listPlugins", deviceKind: "instrument" });
    await library({ action: "listPlugins" });

    expect(warnSpy).not.toHaveBeenCalled();
  });

  it("returns the plugins payload from the route", async () => {
    mockPluginsRoute([
      {
        name: "Serum",
        vendor: "Xfer Records",
        version: "1.3.6",
        format: "VST",
        category: "instrument",
      },
    ]);

    const result = await library({ action: "listPlugins" });

    if (!("plugins" in result)) throw new Error("expected plugins");
    expect(result.plugins.map((p) => p.name)).toStrictEqual(["Serum"]);
    expect(result.dbAvailable).toBe(true);
  });
});
