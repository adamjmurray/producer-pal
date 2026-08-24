// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { type McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { describe, expect, it, type Mock, vi } from "vitest";
import { z, type ZodRawShape } from "zod";
import { defineTool, type ToolOptions } from "../define-tool.ts";
import {
  aliasParam,
  collectHiddenParams,
  deprecatedParam,
  getHiddenParam,
  hiddenParamWarnings,
} from "../hidden-param.ts";
import { getParamModes, param } from "../modal-config.ts";
import { resolveToolSchema } from "../resolve-tool-schema.ts";

type MockServer = McpServer & { registerTool: Mock };

describe("deprecatedParam", () => {
  it("tags a schema without changing how it validates", () => {
    const schema = deprecatedParam(z.coerce.string().optional(), {
      replacedBy: "toPath",
    });

    expect(schema.parse(7)).toBe("7");
    expect(getHiddenParam(schema)).toStrictEqual({
      kind: "deprecated",
      replacedBy: "toPath",
    });
  });

  it("leaves published params untagged", () => {
    expect(getHiddenParam(z.string())).toBeUndefined();
    expect(
      getHiddenParam(param(z.string().optional(), { default: "a param" })),
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
    expect(getHiddenParam(schema)).toStrictEqual({
      kind: "deprecated",
      replacedBy: "toPath",
    });
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

describe("aliasParam", () => {
  it("tags a schema without changing how it validates", () => {
    const schema = aliasParam(z.coerce.number().optional(), {
      canonical: "path",
      example: "t0/s1",
    });

    expect(schema.parse("7")).toBe(7);
    expect(getHiddenParam(schema)).toStrictEqual({
      kind: "alias",
      canonical: "path",
      example: "t0/s1",
    });
  });

  it("composes with param()", () => {
    const schema = param(
      aliasParam(z.coerce.number().optional(), { canonical: "path" }),
      { default: "a param", smallModel: null },
    );

    expect(getHiddenParam(schema)).toStrictEqual({
      kind: "alias",
      canonical: "path",
    });
    expect(getParamModes(schema)?.smallModel).toBeNull();
  });
});

describe("collectHiddenParams", () => {
  it("picks out only the hidden params, keeping why each is hidden", () => {
    expect(
      collectHiddenParams({
        path: z.string().optional(),
        slot: deprecatedParam(z.string().optional(), { replacedBy: "path" }),
        trackIndex: aliasParam(z.number().optional(), { canonical: "path" }),
      }),
    ).toStrictEqual({
      slot: { kind: "deprecated", replacedBy: "path" },
      trackIndex: { kind: "alias", canonical: "path" },
    });
  });

  it("returns nothing for a schema with no hidden params", () => {
    expect(collectHiddenParams({ toPath: z.string() })).toStrictEqual({});
  });
});

describe("hiddenParamWarnings", () => {
  const hidden = collectHiddenParams({
    slot: deprecatedParam(z.string().optional(), { replacedBy: "path" }),
    trackIndex: aliasParam(z.number().optional(), {
      canonical: "path",
      example: "t0/s1",
    }),
    sceneIndex: aliasParam(z.number().optional(), {
      canonical: "path",
      example: "t0/s1",
    }),
  });

  it("names the tool, the retired param, and the replacement", () => {
    expect(
      hiddenParamWarnings("ppal-duplicate", ["slot"], hidden),
    ).toStrictEqual([
      'WARNING: ppal-duplicate param "slot" is deprecated and will be removed; use "path" instead',
    ]);
  });

  // Two halves of one destination are one mistake, so they read as one
  // correction rather than two near-identical lines.
  it("groups aliases by the param they fold into", () => {
    expect(
      hiddenParamWarnings(
        "ppal-create-clip",
        ["trackIndex", "sceneIndex"],
        hidden,
      ),
    ).toStrictEqual([
      'WARNING: ppal-create-clip accepts "trackIndex", "sceneIndex" as a fallback; the parameter is "path" (e.g. path: "t0/s1")',
    ]);
  });

  it("omits the example when the alias has none", () => {
    expect(
      hiddenParamWarnings(
        "ppal-select",
        ["trackIndex"],
        collectHiddenParams({
          trackIndex: aliasParam(z.number().optional(), { canonical: "path" }),
        }),
      ),
    ).toStrictEqual([
      'WARNING: ppal-select accepts "trackIndex" as a fallback; the parameter is "path"',
    ]);
  });

  it("says nothing when no hidden param was sent", () => {
    expect(hiddenParamWarnings("ppal-duplicate", [], hidden)).toStrictEqual([]);
  });

  // Both callers filter Object.keys(hidden), but the signature takes any key
  // list, and a visible param has nothing to correct.
  it("skips a key that isn't hidden", () => {
    expect(
      hiddenParamWarnings("ppal-duplicate", ["name", "slot"], hidden),
    ).toStrictEqual([
      'WARNING: ppal-duplicate param "slot" is deprecated and will be removed; use "path" instead',
    ]);
  });
});

describe("defineTool with hidden params", () => {
  it("leaves the hidden params out of the published schema", () => {
    // The model reads the published schema, so this is what stops it learning
    // the retired name.
    const { mockServer } = register();

    expect(Object.keys(publishedShape(mockServer))).toStrictEqual([
      "id",
      "toPath",
    ]);
  });

  it("still validates and forwards a hidden param", () => {
    // Dropping it from the schema alone would have it stripped here, which is
    // the silent-destination-drop this whole mechanism exists to prevent.
    const { mockServer, mockCallLiveApi } = register();

    return handler(mockServer)({ id: "1", toSlot: 3 }).then(() => {
      expect(mockCallLiveApi).toHaveBeenCalledWith("test-tool", {
        id: "1",
        // z.coerce.string() ran, so the hidden param is coerced like any other
        toSlot: "3",
      });
    });
  });

  it("warns that the param is deprecated, not that it was ignored", () => {
    const { mockServer } = register();

    return handler(mockServer)({ id: "1", toSlot: "2/0" }).then((result) => {
      const texts = result.content.map((c) => c.text);

      expect(texts).toContain(
        'WARNING: test-tool param "toSlot" is deprecated and will be removed; use "toPath" instead',
      );
      expect(texts.join("\n")).not.toContain("ignored unexpected argument");
    });
  });

  it("warns an alias caller which param is the real one", () => {
    const { mockServer } = register();

    return handler(mockServer)({ id: "1", toTrack: 2 }).then((result) => {
      expect(result.content.map((c) => c.text)).toContain(
        'WARNING: test-tool accepts "toTrack" as a fallback; the parameter is "toPath" (e.g. toPath: "t0/s1")',
      );
    });
  });

  it("stays quiet when no hidden param is sent", () => {
    const { mockServer } = register();

    return handler(mockServer)({ id: "1", toPath: "t7" }).then((result) => {
      expect(result.content.map((c) => c.text)).toStrictEqual(["success"]);
    });
  });

  // The warning points the caller at the real name. Firing it for a value the
  // handler never honored points them at nothing.
  it.each([
    ["a JSON null", null],
    ['the string "null" that coerces into', "null"],
    ['the string "undefined"', "undefined"],
    ["an empty string", ""],
    ["whitespace only", "   "],
  ])("stays quiet when the hidden param is %s", (_label, toSlot) => {
    const { mockServer } = register();

    return handler(mockServer)({ id: "1", toSlot }).then((result) => {
      expect(result.content.map((c) => c.text)).toStrictEqual(["success"]);
    });
  });

  it("still reports genuinely unknown params as ignored", () => {
    const { mockServer } = register();

    return handler(mockServer)({ id: "1", bogus: 1 }).then((result) => {
      expect(result.content.map((c) => c.text)).toContain(
        "WARNING: test-tool ignored unexpected argument(s): bogus",
      );
    });
  });
});

/**
 * Register a tool carrying one deprecated param and one alias param.
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
      toTrack: aliasParam(z.coerce.number().optional(), {
        canonical: "toPath",
        example: "t0/s1",
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
