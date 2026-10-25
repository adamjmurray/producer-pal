// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { describe, expect, it } from "vitest";
import { setupExpressAppServer } from "../../../tests/express-app-test-helpers.ts";
import { connectMcpClient } from "../../../tests/server/mcp-client-test-helpers.ts";

// ENABLE_GEN_UI is unset: a release build.
const app = setupExpressAppServer();

/**
 * @param path - A server path
 * @param init - Request options
 * @returns The response status
 */
async function statusOf(path: string, init?: RequestInit): Promise<number> {
  const response = await fetch(`${app.baseUrl}${path}`, init);

  return response.status;
}

describe("generative UI in a build without ENABLE_GEN_UI", () => {
  it("has no ppal-ui tool, routes or stream", async () => {
    const configResponse = await fetch(app.configUrl);
    const config = (await configResponse.json()) as { tools: string[] };
    const callStatus = await statusOf("/api/tools/ppal-ui", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "list" }),
    });

    expect(config.tools).not.toContain("ppal-ui");
    expect(callStatus).toBe(404);
    expect(await statusOf("/api/ui/widgets")).toBe(404);
    expect(await statusOf("/api/ui/events")).toBe(404);
  });

  it("does not register ppal-ui on the MCP server", async () => {
    const { client } = await connectMcpClient();
    const { tools } = await client.listTools();

    expect(tools.map((t) => t.name)).not.toContain("ppal-ui");
  });
});
