// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { registerSystemPromptRoutes } from "#src/mcp-server/routes/system-prompt-route.ts";
import {
  type MarkdownRouteServer,
  putJson,
  startMarkdownRouteServer,
  useTempConfigDir,
} from "../config-dir-test-helpers.ts";

// The shared route factory's branches (localhost gate, 400, byte-faithful echo)
// are covered by global-context-route.test.ts. Here we only confirm the
// /system-prompt path is registered and round-trips to the system-prompt store.

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
  it("GET returns an empty string before anything is written", async () => {
    const res = await fetch(url);

    expect(res.status).toBe(200);
    expect(await res.json()).toStrictEqual({ content: "" });
  });

  it("PUT writes the prompt and echoes it; GET reads it back verbatim", async () => {
    const content = "Speak like a vintage synth manual.\n";

    const putRes = await putJson(url, { content });

    expect(putRes.status).toBe(200);
    expect(await putRes.json()).toStrictEqual({ content });

    const getRes = await fetch(url);

    expect(await getRes.json()).toStrictEqual({ content });
  });
});
