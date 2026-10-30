// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { connectMcpClient } from "../../../tests/server/mcp-client-test-helpers.ts";

const previous = process.env.ENABLE_GEN_UI;

beforeEach(() => {
  process.env.ENABLE_GEN_UI = "true";
});

afterEach(() => {
  if (previous == null) {
    delete process.env.ENABLE_GEN_UI;
  } else {
    process.env.ENABLE_GEN_UI = previous;
  }
});

describe("ppal-ui on the MCP server", () => {
  it("is registered in a flagged build and its call goes to the dispatcher", async () => {
    const { client, callLiveApi } = await connectMcpClient();
    const { tools } = await client.listTools();

    expect(tools.map((t) => t.name)).toContain("ppal-ui");

    await client.callTool({
      name: "ppal-ui",
      arguments: { action: "create", kind: "text", text: "hi" },
    });

    expect(callLiveApi).toHaveBeenCalledWith(
      "ppal-ui",
      { action: "create", kind: "text", text: "hi" },
      expect.anything(),
    );
  });

  it("honors the tools whitelist", async () => {
    const { client } = await connectMcpClient({ tools: ["ppal-connect"] });
    const { tools } = await client.listTools();

    expect(tools.map((t) => t.name)).toStrictEqual(["ppal-connect"]);
  });
});
