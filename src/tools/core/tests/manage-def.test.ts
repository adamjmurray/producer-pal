// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { type McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { describe, expect, it, vi } from "vitest";
import {
  createMcpServer,
  SMALL_MODEL_EXCLUDED_PARAMS,
  STANDARD_TOOL_DEFS,
} from "#src/mcp-server/create-mcp-server.ts";
import { isOfferedInMode } from "#src/tools/shared/tool-framework/define-tool.ts";
import { toolDefManage } from "../manage.def.ts";

/**
 * @param smallModelMode - Whether small-model mode is on
 * @returns The config ppal-manage registered with, or undefined if it didn't
 */
function registered(
  smallModelMode: boolean,
): Record<string, unknown> | undefined {
  const registerTool = vi.fn();

  toolDefManage({ registerTool } as unknown as McpServer, vi.fn(), {
    smallModelMode,
  });

  return registerTool.mock.calls[0]?.[1] as Record<string, unknown> | undefined;
}

describe("ppal-manage definition", () => {
  it("is registered with a description of undo covering the user's own edits", () => {
    expect(registered(false)?.description).toContain("user's own edits");
  });

  it("is a write tool whose undo and redo revert changes", () => {
    expect(registered(false)?.annotations).toStrictEqual({
      readOnlyHint: false,
      destructiveHint: true,
    });
  });

  it("does not pass the small-model flag on to the MCP SDK", () => {
    expect(registered(false)).not.toHaveProperty("omitInSmallModel");
  });

  it("is left out of small-model mode entirely", () => {
    expect(registered(true)).toBeUndefined();
    expect(isOfferedInMode(toolDefManage, true)).toBe(false);
    expect(isOfferedInMode(toolDefManage, false)).toBe(true);
  });

  it("is the only standard tool small-model mode leaves out", () => {
    expect(
      STANDARD_TOOL_DEFS.filter((def) => !isOfferedInMode(def, true)).map(
        (def) => def.toolName,
      ),
    ).toStrictEqual(["ppal-manage"]);
  });

  it("is offered by the server normally and not in small-model mode", () => {
    const names = (smallModelMode: boolean): string[] =>
      Object.keys(
        (
          createMcpServer(vi.fn(), { smallModelMode }) as unknown as {
            _registeredTools: Record<string, unknown>;
          }
        )._registeredTools,
      );

    expect(names(false)).toContain("ppal-manage");
    expect(names(true)).not.toContain("ppal-manage");
  });

  it("does not count its params as ones small models lose", () => {
    expect(SMALL_MODEL_EXCLUDED_PARAMS.has("userLibrary")).toBe(false);
  });
});
