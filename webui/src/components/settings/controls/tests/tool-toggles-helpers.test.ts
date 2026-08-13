// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from "vitest";
import { type McpTool } from "#webui/hooks/connection/use-mcp-connection";
import { groupTools } from "#webui/components/settings/controls/helpers/tool-toggles-helpers";
import { LIVE_API_TOOL_ID } from "#src/shared/tool-groups";
import { SPAWN_SUBAGENT_TOOL_NAME } from "#webui/lib/utils/enabled-tools";
import { fullToolCatalog } from "#webui/lib/utils/tool-catalog";

const tool = (id: string, name: string): McpTool => ({ id, name });

describe("groupTools", () => {
  it("places Subagent in the Advanced group at the end", () => {
    const tools = [
      tool("ppal-connect", "Connect"),
      tool(SPAWN_SUBAGENT_TOOL_NAME, "Subagent"),
    ];

    const groups = groupTools(tools);

    expect(groups.at(-1)?.label).toBe("Advanced");
    expect(groups.at(-1)?.tools.map((t) => t.id)).toStrictEqual([
      SPAWN_SUBAGENT_TOOL_NAME,
    ]);
  });

  it("places Live API and Subagent together in the Advanced group", () => {
    const tools = fullToolCatalog([tool("ppal-connect", "Connect")]);

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
      { label: "Clip", tools: [tools[1], tools[2]] },
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
      "ppal-read-track",
      "ppal-create-track",
      "ppal-update-track",
    ]);
  });

  it("returns empty array for empty input", () => {
    expect(groupTools([])).toStrictEqual([]);
  });
});
