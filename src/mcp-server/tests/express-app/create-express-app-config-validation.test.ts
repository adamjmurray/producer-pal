// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import Max from "max-api";
import { describe, expect, it, vi } from "vitest";
import { setupExpressAppServer } from "../express-app-test-helpers.ts";

describe("POST /config validation", () => {
  const appState = setupExpressAppServer();

  /**
   * @returns The current config, read back with GET /config
   */
  async function getConfig(): Promise<Record<string, unknown>> {
    const response = await fetch(appState.configUrl);
    const config: Record<string, unknown> = await response.json();

    return config;
  }

  it("applies nothing and emits nothing when any field is bad", async () => {
    const before = await getConfig();

    vi.mocked(Max.outlet).mockClear();

    const response = await appState.postConfig({
      smallModelMode: true,
      projectContext: "X",
      liveApiEnabled: true,
      tools: ["bogus"],
    });

    expect(response.status).toBe(400);
    expect(await getConfig()).toStrictEqual(before);
    expect(Max.outlet).not.toHaveBeenCalled();
  });

  it("names every bad field", async () => {
    const response = await appState.postConfig({
      projectContext: 123,
      sampleFolder: ["x"],
      smallModelMode: "false",
      jsonOutput: 1,
      liveApiEnabled: "yes",
      notation: "nope",
      tools: ["bogus"],
    });
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(Object.keys(body.fields).toSorted()).toStrictEqual([
      "jsonOutput",
      "liveApiEnabled",
      "notation",
      "projectContext",
      "sampleFolder",
      "smallModelMode",
      "tools",
    ]);
    expect(body.error).toContain("smallModelMode");
    expect(body.error).toContain("bogus");
  });

  it("refuses a boolean sent as a string instead of reading it as true", async () => {
    const before = await getConfig();
    const response = await appState.postConfig({ smallModelMode: "false" });

    expect(response.status).toBe(400);
    const after = await getConfig();

    expect(after.smallModelMode).toBe(before.smallModelMode);
  });

  it("refuses a non-string projectContext so ppal-connect can't break on it", async () => {
    const before = await getConfig();
    const response = await appState.postConfig({ projectContext: 123 });

    expect(response.status).toBe(400);
    const after = await getConfig();

    expect(after.projectContext).toBe(before.projectContext);
  });

  it("refuses a tools list holding non-strings, such as a nested array", async () => {
    const before = await getConfig();
    const response = await appState.postConfig({ tools: [["ppal-connect"]] });

    expect(response.status).toBe(400);
    const after = await getConfig();

    expect(after.tools).toStrictEqual(before.tools);
  });

  it("still accepts a valid body", async () => {
    const response = await appState.postConfig({
      smallModelMode: false,
      projectContext: "ok",
      jsonOutput: false,
    });

    expect(response.status).toBe(200);
    await appState.postConfig({ projectContext: "" });
  });
});
