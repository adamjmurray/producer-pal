// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from "vitest";
import { LIVE_API_TOOL_ID } from "#src/shared/tool-groups";
import { type McpTool } from "#webui/hooks/connection/use-mcp-connection";
import { SPAWN_SUBAGENT_TOOL_NAME } from "#webui/lib/utils/enabled-tools";
import {
  EXPERIMENTAL_TOOL_NAMES,
  fullToolCatalog,
} from "#webui/lib/utils/tool-catalog";

const tool = (id: string, name: string): McpTool => ({ id, name });

describe("fullToolCatalog", () => {
  it("appends both experimental tools when the server lists neither", () => {
    const result = fullToolCatalog([tool("ppal-connect", "Connect")]);

    expect(result.map((t) => t.id)).toStrictEqual([
      "ppal-connect",
      LIVE_API_TOOL_ID,
      SPAWN_SUBAGENT_TOOL_NAME,
    ]);
    expect(result[1]?.name).toBe("Live API");
    expect(result[2]?.name).toBe("Subagent");
    // The Tools tab hangs a tooltip off each description.
    expect(result[1]?.description).toBeDefined();
    expect(result[2]?.description).toBeDefined();
  });

  it("keeps the server's own Live API entry when the device flag is on", () => {
    // Its real description comes from the tool def; the placeholder is only a
    // stand-in for while the tool is withheld.
    const tools = [
      tool("ppal-connect", "Connect"),
      tool(LIVE_API_TOOL_ID, "Live API From Server"),
    ];

    const result = fullToolCatalog(tools);

    expect(result).toHaveLength(3);
    expect(result[1]?.name).toBe("Live API From Server");
    expect(result[2]?.id).toBe(SPAWN_SUBAGENT_TOOL_NAME);
  });

  it("returns the original list when nothing is missing", () => {
    const tools = [
      tool("ppal-connect", "Connect"),
      tool(LIVE_API_TOOL_ID, "Live API"),
      tool(SPAWN_SUBAGENT_TOOL_NAME, "Subagent"),
    ];

    expect(fullToolCatalog(tools)).toBe(tools);
  });

  it("grows a narrowed catalog by the same two, not to a fixed size", () => {
    // A portal started with --tools serves fewer: the denominator has to follow
    // it, or a narrowed session reads as tools the user switched off.
    expect(fullToolCatalog([tool("ppal-connect", "Connect")])).toHaveLength(3);
  });
});

describe("EXPERIMENTAL_TOOL_NAMES", () => {
  it("names the tools the catalog adds, for the header tooltip", () => {
    expect(EXPERIMENTAL_TOOL_NAMES).toStrictEqual(["Live API", "Subagent"]);
  });
});
