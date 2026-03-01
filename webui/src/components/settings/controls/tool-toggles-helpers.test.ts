// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from "vitest";
import { type McpTool } from "#webui/hooks/connection/use-mcp-connection";
import { groupTools } from "./tool-toggles-helpers";

const tool = (id: string, name: string): McpTool => ({ id, name });

describe("groupTools", () => {
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
    expect(groups[0]?.label).toBe("Transport");
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
