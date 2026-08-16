// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// tool-groups.ts is import-free so the web UI can compile it, which means it
// spells the tool names as literals. These are the tests that keep those literals
// honest against the real registry: add a tool and one of them fails, rather than
// the tool silently going ungrouped and unreachable by --tools.

import { describe, expect, it } from "vitest";
import {
  STANDARD_TOOL_DEFS,
  TOOL_NAMES,
} from "#src/mcp-server/create-mcp-server.ts";
import { toolDefLiveApi } from "#src/tools/advanced/live-api.def.ts";
import {
  ALL_TOOL_IDS,
  CONNECT_TOOL_ID,
  LIVE_API_TOOL_ID,
  READ_ONLY_TOOLS,
} from "#src/shared/tool-groups.ts";

describe("tool-groups vs the real catalog", () => {
  it("covers every registered tool, and nothing else", () => {
    expect(ALL_TOOL_IDS.toSorted()).toStrictEqual(
      [...TOOL_NAMES, toolDefLiveApi.toolName].toSorted(),
    );
  });

  it("names the Direct Live API tool the way the tool def does", () => {
    expect(LIVE_API_TOOL_ID).toBe(toolDefLiveApi.toolName);
  });

  it("names the entry-point tool the way the tool def does", () => {
    expect(TOOL_NAMES).toContain(CONNECT_TOOL_ID);
  });

  it("defines read-only as exactly the tools declaring readOnlyHint", () => {
    // The definition, not a coincidence: ppal-select moves the user's view,
    // ppal-playback runs the transport, and ppal-context can rewrite stored
    // memory, so none of them are read-only however harmless they look.
    const readOnly = [...STANDARD_TOOL_DEFS, toolDefLiveApi]
      .filter((def) => def.toolOptions.annotations?.readOnlyHint === true)
      .map((def) => def.toolName);

    expect(READ_ONLY_TOOLS.toSorted()).toStrictEqual(readOnly.toSorted());
  });
});
