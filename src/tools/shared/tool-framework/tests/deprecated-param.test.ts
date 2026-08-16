// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { type McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { describe, expect, it, type Mock, vi } from "vitest";
import { z, type ZodRawShape } from "zod";
import { defineTool, type ToolOptions } from "../define-tool.ts";
import {
  collectDeprecatedParams,
  deprecatedParam,
  deprecatedParamWarning,
  getDeprecatedParam,
} from "../deprecated-param.ts";
import { getParamModes, param } from "../modal-config.ts";
import { resolveToolSchema } from "../resolve-tool-schema.ts";

type MockServer = McpServer & { registerTool: Mock };

describe("deprecatedParam", () => {
  it("tags a schema without changing how it validates", () => {
    const schema = deprecatedParam(z.coerce.string().optional(), {
      replacedBy: "toPath",
    });

    expect(schema.parse(7)).toBe("7");
    expect(getDeprecatedParam(schema)).toStrictEqual({ replacedBy: "toPath" });
  });

  it("leaves current params untagged", () => {
    expect(getDeprecatedParam(z.string())).toBeUndefined();
    expect(
      getDeprecatedParam(param(z.string().optional(), { default: "a param" })),
    ).toBeUndefined();
  });

  // Both helpers tag the instance `.describe()` returns, so before the tags
  // carried across, wrapping one in the other silently dropped the inner one —
  // republishing a deprecated param, or losing a param's modes.
  it.each([
    [
      "deprecatedParam(param(...))",
      deprecatedParam(
        param(z.coerce.string().optional(), {
          default: "a param",
          smallModel: null,
        }),
        { replacedBy: "toPath" },
      ),
    ],
    [
      "param(deprecatedParam(...))",
      param(
        deprecatedParam(z.coerce.string().optional(), {
          replacedBy: "toPath",
        }),
        { default: "a param", smallModel: null },
      ),
    ],
  ])("composes with param() as %s", (_label, schema) => {
    expect(getDeprecatedParam(schema)).toStrictEqual({ replacedBy: "toPath" });
    expect(getParamModes(schema)?.smallModel).toBeNull();
  });

  // filterSchemaForSmallModel swaps the instance two ways when a mode is active:
  // a description override re-describes it, and an enum trim rebuilds it
  // outright. The tag has to survive both.
  it.each([
    [
      "a description override",
      deprecatedParam(
        param(z.coerce.string().optional(), {
          default: "a param",
          smallModel: "shorter",
        }),
        { replacedBy: "toPath" },
      ),
    ],
    [
      "an enum trim",
      deprecatedParam(
        param(z.array(z.enum(["a", "b"])).default([]), {
          default: "a param",
          smallModel: { excludeEnumValues: ["b"] },
        }),
        { replacedBy: "toPath" },
      ),
    ],
  ])("survives %s", (_label, toSlot) => {
    expect(
      Object.keys(
        resolveToolSchema({ toSlot }, { smallModelMode: true }).published,
      ),
    ).toStrictEqual([]);
  });
});

describe("collectDeprecatedParams", () => {
  it("picks out only the deprecated params", () => {
    expect(
      collectDeprecatedParams({
        toPath: z.string().optional(),
        toSlot: deprecatedParam(z.string().optional(), {
          replacedBy: "toPath",
        }),
        toTrack: deprecatedParam(z.number().optional(), {
          replacedBy: "toPath",
        }),
      }),
    ).toStrictEqual({
      toSlot: { replacedBy: "toPath" },
      toTrack: { replacedBy: "toPath" },
    });
  });

  it("returns nothing for a schema with no deprecations", () => {
    expect(collectDeprecatedParams({ toPath: z.string() })).toStrictEqual({});
  });
});

describe("deprecatedParamWarning", () => {
  it("names the tool, the old param, and the replacement", () => {
    expect(
      deprecatedParamWarning("ppal-duplicate", "toSlot", {
        replacedBy: "toPath",
      }),
    ).toBe(
      'Warning: ppal-duplicate param "toSlot" is deprecated and will be removed; use "toPath" instead',
    );
  });
});

describe("defineTool with a deprecated param", () => {
  it("leaves the deprecated param out of the published schema", () => {
    // The model reads the published schema, so this is what stops it learning
    // the retired name.
    const { mockServer } = register();

    expect(Object.keys(publishedShape(mockServer))).toStrictEqual([
      "id",
      "toPath",
    ]);
  });

  it("still validates and forwards the deprecated param", () => {
    // Dropping it from the schema alone would have it stripped here, which is
    // the silent-destination-drop this whole mechanism exists to prevent.
    const { mockServer, mockCallLiveApi } = register();

    return handler(mockServer)({ id: "1", toSlot: 3 }).then(() => {
      expect(mockCallLiveApi).toHaveBeenCalledWith("test-tool", {
        id: "1",
        // z.coerce.string() ran, so the deprecated param is coerced like any other
        toSlot: "3",
      });
    });
  });

  it("warns that the param is deprecated, not that it was ignored", () => {
    const { mockServer } = register();

    return handler(mockServer)({ id: "1", toSlot: "2/0" }).then((result) => {
      const texts = result.content.map((c) => c.text);

      expect(texts).toContain(
        'Warning: test-tool param "toSlot" is deprecated and will be removed; use "toPath" instead',
      );
      expect(texts.join("\n")).not.toContain("ignored unexpected argument");
    });
  });

  it("stays quiet when the deprecated param is not sent", () => {
    const { mockServer } = register();

    return handler(mockServer)({ id: "1", toPath: "t7" }).then((result) => {
      expect(result.content.map((c) => c.text)).toStrictEqual(["success"]);
    });
  });

  it("still reports genuinely unknown params as ignored", () => {
    const { mockServer } = register();

    return handler(mockServer)({ id: "1", bogus: 1 }).then((result) => {
      expect(result.content.map((c) => c.text)).toContain(
        "Warning: test-tool ignored unexpected argument(s): bogus",
      );
    });
  });
});

/**
 * Register a tool carrying one deprecated param.
 * @returns Mock server and callLiveApi mock
 */
function register(): { mockServer: MockServer; mockCallLiveApi: Mock } {
  const options: ToolOptions = {
    description: "Test",
    inputSchema: {
      id: z.coerce.string(),
      toPath: z.string().optional(),
      toSlot: deprecatedParam(z.coerce.string().optional(), {
        replacedBy: "toPath",
      }),
    },
  };
  const mockServer = { registerTool: vi.fn() } as unknown as MockServer;
  const mockCallLiveApi = vi
    .fn()
    .mockResolvedValue({ content: [{ type: "text", text: "success" }] });

  defineTool("test-tool", options)(mockServer, mockCallLiveApi);

  return { mockServer, mockCallLiveApi };
}

/**
 * Read the schema shape the tool published to MCP.
 * @param mockServer - Mock MCP server
 * @returns Published Zod shape
 */
function publishedShape(mockServer: MockServer): ZodRawShape {
  const config = mockServer.registerTool.mock.calls[0]![1] as Record<
    string,
    unknown
  >;

  return (config.inputSchema as { shape: ZodRawShape }).shape;
}

/**
 * Read the registered tool handler.
 * @param mockServer - Mock MCP server
 * @returns The tool's async handler
 */
function handler(mockServer: MockServer): (
  args: Record<string, unknown>,
) => Promise<{
  content: Array<{ type: string; text: string }>;
}> {
  return mockServer.registerTool.mock.calls[0]![2] as (
    args: Record<string, unknown>,
  ) => Promise<{ content: Array<{ type: string; text: string }> }>;
}
