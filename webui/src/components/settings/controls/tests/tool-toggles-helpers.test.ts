// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from "vitest";
import { type McpTool } from "#webui/hooks/connection/use-mcp-connection";
import {
  ensureLiveApiTool,
  ensureSpawnSubagentTool,
  groupTools,
} from "#webui/components/settings/controls/helpers/tool-toggles-helpers";
import { LIVE_API_TOOL_ID } from "#src/shared/tool-groups";
import { SPAWN_SUBAGENT_TOOL_NAME } from "#webui/lib/utils/enabled-tools";

const tool = (id: string, name: string): McpTool => ({ id, name });

describe("ensureLiveApiTool", () => {
  it("appends a Live API fallback when missing", () => {
    const tools = [tool("ppal-connect", "Connect")];
    const result = ensureLiveApiTool(tools);

    expect(result).toHaveLength(2);
    expect(result[1]?.id).toBe(LIVE_API_TOOL_ID);
    expect(result[1]?.name).toBe("Live API");
    expect(result[1]?.description).toBeDefined();
  });

  it("returns the original list when Live API is already present", () => {
    const tools = [
      tool("ppal-connect", "Connect"),
      tool(LIVE_API_TOOL_ID, "Live API From Server"),
    ];
    const result = ensureLiveApiTool(tools);

    expect(result).toBe(tools);
  });
});

describe("ensureSpawnSubagentTool", () => {
  it("appends a Subagent placeholder when missing", () => {
    const tools = [tool("ppal-connect", "Connect")];
    const result = ensureSpawnSubagentTool(tools);

    expect(result).toHaveLength(2);
    expect(result[1]?.id).toBe(SPAWN_SUBAGENT_TOOL_NAME);
    expect(result[1]?.name).toBe("Subagent");
    expect(result[1]?.description).toBeDefined();
  });

  it("returns the original list when Subagent is already present", () => {
    const tools = [
      tool("ppal-connect", "Connect"),
      tool(SPAWN_SUBAGENT_TOOL_NAME, "Subagent"),
    ];
    const result = ensureSpawnSubagentTool(tools);

    expect(result).toBe(tools);
  });
});

describe("groupTools", () => {
  it("places Subagent in the Advanced group at the end", () => {
    const tools = ensureSpawnSubagentTool([tool("ppal-connect", "Connect")]);

    const groups = groupTools(tools);

    expect(groups.at(-1)?.label).toBe("Advanced");
    expect(groups.at(-1)?.tools.map((t) => t.id)).toStrictEqual([
      SPAWN_SUBAGENT_TOOL_NAME,
    ]);
  });

  it("places Live API and Subagent together in the Advanced group", () => {
    const tools = ensureSpawnSubagentTool([
      tool("ppal-connect", "Connect"),
      tool(LIVE_API_TOOL_ID, "Live API"),
    ]);

    const groups = groupTools(tools);

    expect(groups).toHaveLength(2);
    expect(groups[0]?.label).toBe("Core");
    expect(groups[0]?.tools.map((t) => t.id)).toStrictEqual(["ppal-connect"]);
    expect(groups[1]?.label).toBe("Advanced");
    expect(groups[1]?.tools.map((t) => t.id)).toStrictEqual([
      LIVE_API_TOOL_ID,
      SPAWN_SUBAGENT_TOOL_NAME,
    ]);
  });

  it("groups tools by category", () => {
    const tools = [
      tool("ppal-connect", "Connect"),
      tool("ppal-read-clip", "Read Clip"),
      tool("ppal-create-clip", "Create Clip"),
    ];

    const groups = groupTools(tools);

    expect(groups).toStrictEqual([
      { label: "Core", tools: [tools[0]] },
      { label: "Clip", tools: [tools[2], tools[1]] },
    ]);
  });

  it("omits groups with no matching tools", () => {
    const tools = [tool("ppal-playback", "Playback")];
    const groups = groupTools(tools);

    expect(groups).toHaveLength(1);
    expect(groups[0]?.label).toBe("Session");
  });

  it("collects unknown tools into Debugging group", () => {
    const tools = [
      tool("ppal-connect", "Connect"),
      tool("ppal-unknown", "Unknown Tool"),
    ];

    const groups = groupTools(tools);

    expect(groups).toHaveLength(2);
    expect(groups[1]).toStrictEqual({
      label: "Debugging",
      tools: [tools[1]],
    });
  });

  it("preserves tool order within groups per TOOL_GROUPS definition", () => {
    const tools = [
      tool("ppal-update-track", "Update Track"),
      tool("ppal-read-track", "Read Track"),
      tool("ppal-create-track", "Create Track"),
    ];

    const groups = groupTools(tools);

    expect(groups[0]?.tools.map((t) => t.id)).toStrictEqual([
      "ppal-create-track",
      "ppal-read-track",
      "ppal-update-track",
    ]);
  });

  it("returns empty array for empty input", () => {
    expect(groupTools([])).toStrictEqual([]);
  });
});
