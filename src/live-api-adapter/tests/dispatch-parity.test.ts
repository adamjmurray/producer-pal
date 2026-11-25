// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { describe, expect, it } from "vitest";
import { DISPATCH_TOOL_NAMES } from "#src/live-api-adapter/live-api-adapter.ts";
import {
  OPT_IN_TOOL_DEFS,
  TOOL_NAMES,
} from "#src/mcp-server/create-mcp-server.ts";

describe("V8 dispatch parity", () => {
  it("dispatches exactly the registered standard tools plus the opt-in tools", () => {
    // The V8 adapter's dispatch map is hand-maintained in parallel with the MCP
    // tool registry. A drift (a new tool def with no dispatch entry, or an
    // orphan dispatch key) would surface only at runtime as "Unknown tool".
    // ppal-live-api is opt-in (not in STANDARD_TOOL_DEFS) but is always
    // dispatchable, so it is expected in the map.
    const expected = [
      ...TOOL_NAMES,
      ...OPT_IN_TOOL_DEFS.map((def) => def.toolName),
    ].toSorted();
    const actual = DISPATCH_TOOL_NAMES.toSorted();

    expect(actual).toStrictEqual(expected);
  });
});
