// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { afterEach, describe, expect, it, vi } from "vitest";
import { callerSmallModelMode } from "../portal-settings.ts";

const MCP_URL = "http://localhost:3350/mcp";

describe("callerSmallModelMode", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it.each([true, false])(
    "uses the portal's own setting (%s) without asking the device",
    async (setting) => {
      const fetchSpy = vi.spyOn(globalThis, "fetch");

      expect(await callerSmallModelMode(setting, MCP_URL)).toBe(setting);
      expect(fetchSpy).not.toHaveBeenCalled();
    },
  );

  it.each([true, false])(
    "reads the device's setting (%s) from GET /config when the portal has none",
    async (on) => {
      const fetchSpy = vi
        .spyOn(globalThis, "fetch")
        .mockResolvedValue(Response.json({ smallModelMode: on }));

      expect(await callerSmallModelMode(undefined, MCP_URL)).toBe(on);
      expect(fetchSpy.mock.calls[0]?.[0]).toStrictEqual(
        new URL("http://localhost:3350/config"),
      );
    },
  );

  it("is false for a config without the setting", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(Response.json({}));

    expect(await callerSmallModelMode(undefined, MCP_URL)).toBe(false);
  });

  it("is false when the device can't be asked", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("down"));

    expect(await callerSmallModelMode(undefined, MCP_URL)).toBe(false);
  });

  it("is false for an answer that isn't JSON", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("nope"));

    expect(await callerSmallModelMode(undefined, MCP_URL)).toBe(false);
  });
});
