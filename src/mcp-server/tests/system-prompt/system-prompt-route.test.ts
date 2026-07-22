// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { registerSystemPromptRoutes } from "#src/mcp-server/routes/system-prompt-route.ts";
import { VERSION } from "#src/shared/config.ts";
import {
  type MarkdownRouteServer,
  putJson,
  startMarkdownRouteServer,
  useTempConfigDir,
} from "../config-dir-test-helpers.ts";

// The shared route factory's branches (localhost gate, 400, content-faithful
// echo) are covered by global-context-route.test.ts. Here we confirm the
// /system-prompt path is registered, round-trips to the system-prompt store,
// and surfaces the store's drift state via the factory's `meta` hook.

// Register the temp-config-dir lifecycle so each request hits a fresh real dir
// rather than the inert-under-Vitest path (env unset).
useTempConfigDir();

let server: MarkdownRouteServer;
let url = "";

beforeAll(async () => {
  server = await startMarkdownRouteServer(registerSystemPromptRoutes);
  url = `${server.baseUrl}/system-prompt`;
});

afterAll(async () => {
  await server.close();
});

describe("system-prompt route", () => {
  it("GET returns empty content with no drift before anything is written", async () => {
    const res = await fetch(url);

    expect(res.status).toBe(200);
    expect(await res.json()).toStrictEqual({
      content: "",
      drifted: false,
      forkedFromVersion: null,
    });
  });

  it("PUT writes the prompt and echoes it with fork-time drift state; GET reads it back", async () => {
    const content = "Speak like a vintage synth manual.\n";

    const putRes = await putJson(url, { content });

    expect(putRes.status).toBe(200);
    // A fresh fork tracks the current built-in, so it is not drifted; the
    // version stamped is the running Producer Pal version.
    const putBody = (await putRes.json()) as {
      content: string;
      drifted: boolean;
      forkedFromVersion: string | null;
    };

    expect(putBody.content).toBe(content);
    expect(putBody.drifted).toBe(false);
    expect(putBody.forkedFromVersion).toBe(VERSION);

    const getRes = await fetch(url);

    expect(await getRes.json()).toStrictEqual({
      content,
      drifted: false,
      forkedFromVersion: VERSION,
    });
  });
});
