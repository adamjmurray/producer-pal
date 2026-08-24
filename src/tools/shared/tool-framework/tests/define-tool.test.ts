// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it, vi, type Mock } from "vitest";
import { z, type ZodRawShape } from "zod";
import { type McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { type Notation } from "#src/shared/notation.ts";
import {
  defineTool,
  filterExcludedEnumValues,
  type ToolOptions,
} from "../define-tool.ts";
import { param } from "../modal-config.ts";

type MockServer = McpServer & { registerTool: Mock };

function createMockServer(): MockServer {
  return { registerTool: vi.fn() } as unknown as MockServer;
}

/**
 * Register a test tool with "test-tool" name and return mocks for assertions
 * @param toolOptions - tool definition options
 * @param options - registration options
 * @param options.smallModelMode - whether to enable small model mode
 * @param options.notation - active notation threaded to the tool
 * @param options.successMock - whether mockCallLiveApi resolves with success
 * @returns mock server and callLiveApi mock
 */
function registerTestTool(
  toolOptions: ToolOptions,
  options?: {
    smallModelMode?: boolean;
    notation?: Notation;
    successMock?: boolean;
  },
) {
  const mockServer = createMockServer();
  const mockCallLiveApi = options?.successMock
    ? vi.fn().mockResolvedValue({
        content: [{ type: "text", text: "success" }],
      })
    : vi.fn();
  const toolRegistrar = defineTool("test-tool", toolOptions);
  const registerOptions =
    options?.smallModelMode != null || options?.notation != null
      ? { smallModelMode: options.smallModelMode, notation: options.notation }
      : undefined;

  toolRegistrar(mockServer, mockCallLiveApi, registerOptions);

  return { mockServer, mockCallLiveApi };
}

/**
 * Get the registered tool config from a mock server
 * @param mockServer - mock MCP server
 * @returns registered tool config object
 */
function getRegisteredConfig(mockServer: MockServer) {
  return mockServer.registerTool.mock.calls[0]![1] as Record<string, unknown>;
}

/**
 * Get the schema shape from a mock server's registered tool
 * @param mockServer - mock MCP server
 * @returns Zod schema shape of the registered tool
 */
function getRegisteredShape(mockServer: MockServer): ZodRawShape {
  const config = getRegisteredConfig(mockServer);

  return (config.inputSchema as { shape: ZodRawShape }).shape;
}

/**
 * Get param descriptions from a mock server's registered tool
 * @param mockServer - mock MCP server
 * @returns registered shape typed for description access
 */
function getRegisteredDescriptions(mockServer: MockServer) {
  return getRegisteredShape(mockServer) as Record<
    string,
    { description?: string }
  >;
}

/**
 * Get the tool handler from a mock server's registered tool
 * @param mockServer - mock MCP server
 * @returns async tool handler function
 */
function getRegisteredHandler(mockServer: MockServer) {
  return mockServer.registerTool.mock.calls[0]![2] as (
    args: Record<string, unknown>,
  ) => Promise<{ content: Array<{ type: string; text: string }> }>;
}

describe("defineTool", () => {
  it("should expose toolName on the returned function", () => {
    const toolRegistrar = defineTool("my-custom-tool", {
      description: "Test",
      inputSchema: { param: z.string() },
    });

    expect(toolRegistrar.toolName).toBe("my-custom-tool");
  });

  it("should register tool with correct config", () => {
    const { mockServer } = registerTestTool({
      title: "Test Tool",
      description: "A test tool",
      inputSchema: {
        requiredParam: z.string(),
        optionalParam: z.number().optional(),
      },
    });

    expect(mockServer.registerTool).toHaveBeenCalledWith(
      "test-tool",
      expect.objectContaining({
        title: "Test Tool",
        description: "A test tool",
      }),
      expect.any(Function),
    );

    const shape = getRegisteredShape(mockServer);

    expect(Object.keys(shape)).toStrictEqual([
      "requiredParam",
      "optionalParam",
    ]);
  });

  it("should call liveApi for valid input", async () => {
    const { mockServer, mockCallLiveApi } = registerTestTool(
      {
        title: "Test Tool",
        description: "Test",
        inputSchema: { param: z.string() },
      },
      { successMock: true },
    );

    const toolHandler = getRegisteredHandler(mockServer);

    // Test valid input
    const validArgs = { param: "valid" };
    const result = await toolHandler(validArgs);

    expect(mockCallLiveApi).toHaveBeenCalledWith("test-tool", validArgs);
    expect(result).toStrictEqual({
      content: [{ type: "text", text: "success" }],
    });
  });

  it("should drop params hidden in smallModelMode (smallModel: null)", () => {
    const toolOptions: ToolOptions = {
      title: "Test Tool",
      description: "Test",
      inputSchema: {
        keepParam: z.string(),
        removeParam: param(z.number().optional(), {
          default: "removable",
          smallModel: null,
        }),
        alsoKeep: z.boolean().optional(),
      },
    };

    const { mockServer } = registerTestTool(toolOptions, {
      smallModelMode: true,
    });

    const shape = getRegisteredShape(mockServer);

    expect(Object.keys(shape)).toStrictEqual(["keepParam", "alsoKeep"]);
    expect(shape.keepParam).toBe(toolOptions.inputSchema.keepParam);
    expect(shape.alsoKeep).toBe(toolOptions.inputSchema.alsoKeep);
    expect(shape.removeParam).toBeUndefined();
  });

  it("should keep hidden params when smallModelMode is disabled", () => {
    const { mockServer } = registerTestTool(
      {
        title: "Test Tool",
        description: "Test",
        inputSchema: {
          keepParam: z.string(),
          removeParam: param(z.number().optional(), {
            default: "removable",
            smallModel: null,
          }),
        },
      },
      { smallModelMode: false },
    );

    // Verify tool was registered with full schema (all params present)
    const shape = getRegisteredShape(mockServer);

    expect(Object.keys(shape)).toStrictEqual(["keepParam", "removeParam"]);
  });

  it("should strip hidden parameters from args in smallModelMode", async () => {
    const { mockServer, mockCallLiveApi } = registerTestTool(
      {
        title: "Test Tool",
        description: "Test",
        inputSchema: {
          allowedParam: z.string(),
          filteredParam: param(z.number().optional(), {
            default: "removable",
            smallModel: null,
          }),
        },
      },
      { smallModelMode: true, successMock: true },
    );

    const toolHandler = getRegisteredHandler(mockServer);

    // Try to use filtered parameter - Zod will strip it from validated data
    const args = {
      allowedParam: "valid",
      filteredParam: 123, // This should be stripped by Zod
    };

    await toolHandler(args);

    // Verify callLiveApi was called WITHOUT the filtered parameter
    expect(mockCallLiveApi).toHaveBeenCalledWith("test-tool", {
      allowedParam: "valid",
      // filteredParam should NOT be here
    });
    expect(mockCallLiveApi.mock.calls[0]![1]).not.toHaveProperty(
      "filteredParam",
    );
  });

  it("should work normally without any modal params", () => {
    const { mockServer } = registerTestTool(
      {
        title: "Test Tool",
        description: "Test",
        inputSchema: {
          param1: z.string(),
          param2: z.number().optional(),
        },
      },
      { smallModelMode: true },
    );

    // Should use original schema even in small model mode
    const shape = getRegisteredShape(mockServer);

    expect(Object.keys(shape)).toStrictEqual(["param1", "param2"]);
  });

  it("should apply a param's small-model description override", () => {
    const { mockServer } = registerTestTool(
      {
        title: "Test Tool",
        description: "Test",
        inputSchema: {
          param1: param(z.string(), {
            default: "original description",
            smallModel: "simplified",
          }),
          param2: z.number().optional().describe("original number"),
        },
      },
      { smallModelMode: true },
    );

    const shape = getRegisteredDescriptions(mockServer);

    // param1 should have overridden description
    expect(shape.param1?.description).toBe("simplified");

    // param2 should keep original description
    expect(shape.param2?.description).toBe("original number");
  });

  it("should override description without hiding any params", () => {
    const { mockServer } = registerTestTool(
      {
        title: "Test Tool",
        description: "Test",
        inputSchema: {
          keepAll: param(z.string(), {
            default: "verbose description",
            smallModel: "short",
          }),
          alsoKeep: z.number().optional(),
        },
      },
      { smallModelMode: true },
    );

    const shape = getRegisteredDescriptions(mockServer);

    // Both params should be present
    expect(Object.keys(shape)).toStrictEqual(["keepAll", "alsoKeep"]);

    // keepAll should have overridden description
    expect(shape.keepAll?.description).toBe("short");
  });

  it("should apply a modal tool description in smallModelMode", () => {
    const { mockServer } = registerTestTool(
      {
        title: "Test Tool",
        description: {
          default: "Original verbose tool description with many details",
          smallModel: "Short description",
        },
        inputSchema: { param: z.string() },
      },
      { smallModelMode: true },
    );

    const config = getRegisteredConfig(mockServer);

    expect(config.description).toBe("Short description");
  });

  it("should use the default tool description when smallModelMode is disabled", () => {
    const { mockServer } = registerTestTool(
      {
        title: "Test Tool",
        description: {
          default: "Original verbose tool description",
          smallModel: "Short description",
        },
        inputSchema: { param: z.string() },
      },
      { smallModelMode: false },
    );

    const config = getRegisteredConfig(mockServer);

    expect(config.description).toBe("Original verbose tool description");
  });

  it("should warn when extra arguments are passed", async () => {
    const { mockServer, mockCallLiveApi } = registerTestTool(
      {
        title: "Test Tool",
        description: "Test",
        inputSchema: { knownParam: z.string() },
      },
      { successMock: true },
    );

    const toolHandler = getRegisteredHandler(mockServer);

    // Pass extra arguments that aren't in the schema
    const result = await toolHandler({
      knownParam: "valid",
      unknownParam: "extra",
      anotherExtra: 123,
    });

    // Tool should still succeed
    expect(mockCallLiveApi).toHaveBeenCalledWith("test-tool", {
      knownParam: "valid",
      // Extra params should be stripped by Zod
    });

    // But a warning should be appended
    expect(result.content).toHaveLength(2);
    expect(result.content[1]).toStrictEqual({
      type: "text",
      text: "WARNING: test-tool ignored unexpected argument(s): unknownParam, anotherExtra",
    });
  });

  it("should apply runtime filter for valid values in smallModelMode with excludeEnumValues", async () => {
    const { mockServer, mockCallLiveApi } = registerTestTool(
      excludeEnumValuesToolConfig(),
      { smallModelMode: true, successMock: true },
    );

    const toolHandler = getRegisteredHandler(mockServer);

    // Send valid values — runtime filter runs but nothing to remove
    await toolHandler({ include: ["notes", "sample"] });

    expect(mockCallLiveApi).toHaveBeenCalledWith("test-tool", {
      include: ["notes", "sample"],
    });
  });

  it("should reject excluded enum values via Zod in smallModelMode", async () => {
    const { mockServer } = registerTestTool(excludeEnumValuesToolConfig(), {
      smallModelMode: true,
      successMock: true,
    });

    const toolHandler = getRegisteredHandler(mockServer);

    // Model hallucinated "timing" — Zod rejects it (primary gate)
    // Zod's message lands inside a JSON dump, so the quotes around each value
    // arrive escaped.
    await expect(toolHandler({ include: ["notes", "timing"] })).rejects.toThrow(
      /Invalid option: expected one of .*notes.*sample/,
    );
  });

  it("should strip the errorCode discriminator before returning to the MCP SDK", async () => {
    const mockServer = createMockServer();
    // Simulate a timeout response from callLiveApi: it carries the internal
    // errorCode discriminator that the REST route uses, but the MCP wire result
    // must NOT include it (MCP errors ride as isError in the result body).
    const mockCallLiveApi = vi.fn().mockResolvedValue({
      content: [{ type: "text", text: "Tool call 'test-tool' timed out" }],
      isError: true,
      errorCode: "timeout",
    });
    const toolRegistrar = defineTool("test-tool", {
      title: "Test Tool",
      description: "Test",
      inputSchema: { param: z.string() },
    });

    toolRegistrar(mockServer, mockCallLiveApi);

    const toolHandler = getRegisteredHandler(mockServer);
    const result = (await toolHandler({ param: "x" })) as {
      content: Array<{ type: string; text: string }>;
      isError?: boolean;
      errorCode?: unknown;
    };

    expect(result).toStrictEqual({
      content: [{ type: "text", text: "Tool call 'test-tool' timed out" }],
      isError: true,
    });
    expect(result).not.toHaveProperty("errorCode");
  });

  it("should coerce number to string when using z.coerce.string()", async () => {
    const { mockServer, mockCallLiveApi } = registerTestTool(
      {
        title: "Test Tool",
        description: "Test",
        inputSchema: {
          sceneIndex: z.coerce.string(), // Use Zod coercion for transport-layer tolerance
        },
      },
      { successMock: true },
    );

    const toolHandler = getRegisteredHandler(mockServer);

    // LLM sends number instead of string - Zod coerces it
    const result = await toolHandler({ sceneIndex: 0 });

    expect(result).toStrictEqual({
      content: [{ type: "text", text: "success" }],
    });
    expect(mockCallLiveApi).toHaveBeenCalledWith("test-tool", {
      sceneIndex: "0",
    });
  });
});

describe("defineTool modal params (notation)", () => {
  /**
   * Tool config with a notation-keyed `notes` override and a bar|beat base.
   * @returns Tool options exercising a param's notation modes
   */
  function notationToolConfig(): ToolOptions {
    return {
      title: "Test Tool",
      description: "Base tool description",
      inputSchema: {
        notes: param(z.string().optional(), {
          default: "notes in bar|beat",
          "midi-json": "notes as JSON array",
        }),
        other: z.string().optional().describe("other param"),
      },
    };
  }

  it("overrides the param description for the active notation", () => {
    const { mockServer } = registerTestTool(notationToolConfig(), {
      notation: "midi-json",
    });

    const shape = getRegisteredDescriptions(mockServer);

    expect(shape.notes?.description).toBe("notes as JSON array");
    // Params without an override keep their base description.
    expect(shape.other?.description).toBe("other param");
  });

  it("keeps the base description for the default (barbeat) notation", () => {
    const { mockServer } = registerTestTool(notationToolConfig(), {
      notation: "barbeat",
    });

    const shape = getRegisteredDescriptions(mockServer);

    // barbeat has no override key, so the base default stands.
    expect(shape.notes?.description).toBe("notes in bar|beat");
  });

  it("lets a notation override win over the small-model override", () => {
    const { mockServer } = registerTestTool(
      {
        title: "Test Tool",
        description: "Base tool description",
        inputSchema: {
          notes: param(z.string().optional(), {
            default: "notes in bar|beat",
            smallModel: "small-model bar|beat notes",
            "midi-json": "notes as JSON array",
          }),
          advanced: param(z.string().optional(), {
            default: "advanced param",
            smallModel: null,
          }),
        },
      },
      { smallModelMode: true, notation: "midi-json" },
    );

    const shape = getRegisteredDescriptions(mockServer);

    // Small-model still trims params; notation is authoritative for the kept one.
    expect(Object.keys(shape)).toStrictEqual(["notes"]);
    expect(shape.notes?.description).toBe("notes as JSON array");
  });

  it("applies a notation-specific tool description over the base", () => {
    const { mockServer } = registerTestTool(
      {
        title: "Test Tool",
        description: {
          default: "Base tool description",
          "midi-json": "JSON-notes tool",
        },
        inputSchema: { notes: z.string().optional() },
      },
      { notation: "midi-json" },
    );

    expect(getRegisteredConfig(mockServer).description).toBe("JSON-notes tool");
  });
});

describe("filterExcludedEnumValues", () => {
  it("should remove excluded values from array params", () => {
    const args = { include: ["notes", "timing", "sample"], name: "test" };

    const result = filterExcludedEnumValues(args, {
      include: ["timing"],
    });

    expect(result).toStrictEqual({
      include: ["notes", "sample"],
      name: "test",
    });
  });

  it("should remove multiple excluded values", () => {
    const args = { include: ["notes", "timing", "warp", "sample"] };

    const result = filterExcludedEnumValues(args, {
      include: ["timing", "warp"],
    });

    expect(result).toStrictEqual({ include: ["notes", "sample"] });
  });

  it("should not modify non-array params", () => {
    const args = { include: "timing", count: 5 };

    const result = filterExcludedEnumValues(args, {
      include: ["timing"],
    });

    expect(result).toStrictEqual({ include: "timing", count: 5 });
  });

  it("should not modify params not in exclusion map", () => {
    const args = { include: ["notes", "timing"], other: ["a", "b"] };

    const result = filterExcludedEnumValues(args, {
      include: ["timing"],
    });

    expect(result).toStrictEqual({
      include: ["notes"],
      other: ["a", "b"],
    });
  });

  it("should return shallow copy without modifying original", () => {
    const args = { include: ["notes", "timing"] };

    const result = filterExcludedEnumValues(args, {
      include: ["timing"],
    });

    expect(args.include).toStrictEqual(["notes", "timing"]);
    expect(result).not.toBe(args);
  });
});

/**
 * Creates a tool config with excludeEnumValues for testing.
 * @returns Tool options with enum exclusion config
 */
function excludeEnumValuesToolConfig(): ToolOptions {
  return {
    title: "Test Tool",
    description: "Test",
    inputSchema: {
      include: param(
        z.array(z.enum(["notes", "timing", "sample"])).default([]),
        {
          default: "include options",
          smallModel: { excludeEnumValues: ["timing"] },
        },
      ),
    },
  };
}
