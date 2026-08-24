// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from "vitest";
import { DISPATCH_TOOL_NAMES } from "#src/live-api-adapter/live-api-adapter.ts";
import { TOOL_NAMES } from "#src/mcp-server/create-mcp-server.ts";
import { toolDefLiveApi } from "#src/tools/advanced/live-api.def.ts";

describe("V8 dispatch parity", () => {
  it("dispatches exactly the registered standard tools plus opt-in ppal-live-api", () => {
    // The V8 adapter's dispatch map is hand-maintained in parallel with the MCP
    // tool registry. A drift (a new tool def with no dispatch entry, or an
    // orphan dispatch key) would surface only at runtime as "Unknown tool".
    // ppal-live-api is opt-in (not in STANDARD_TOOL_DEFS) but is always
    // dispatchable, so it is expected in the map.
    const expected = [...TOOL_NAMES, toolDefLiveApi.toolName].toSorted();
    const actual = DISPATCH_TOOL_NAMES.toSorted();

    expect(actual).toStrictEqual(expected);
  });
});
