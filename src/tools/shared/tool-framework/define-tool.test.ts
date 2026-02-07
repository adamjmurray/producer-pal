// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it, vi, type Mock } from "vitest";
import { z, type ZodRawShape } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { defineTool, type ToolOptions } from "./define-tool.ts";

type MockServer = McpServer & { registerTool: Mock };

function createMockServer(): MockServer {
  return { registerTool: vi.fn() } as unknown as MockServer;
}

/**
 * Register a test tool with "test-tool" name and return mocks for assertions
 * @param toolOptions - tool definition options
 * @param options - registration options
 * @param options.smallModelMode - whether to enable small model mode
 * @param options.successMock - whether mockCallLiveApi resolves with success
 * @returns mock server and callLiveApi mock
 */
function registerTestTool(
  toolOptions: ToolOptions,
  options?: { smallModelMode?: boolean; successMock?: boolean },
) {
  const mockServer = createMockServer();
  const mockCallLiveApi = options?.successMock
    ? vi.fn().mockResolvedValue({
        content: [{ type: "text", text: "success" }],
      })
    : vi.fn();
  const toolRegistrar = defineTool("test-tool", toolOptions);
  const registerOptions =
    options?.smallModelMode != null
      ? { smallModelMode: options.smallModelMode }
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

  it("should filter schema parameters when smallModelMode is enabled", () => {
    const toolOptions: ToolOptions = {
      title: "Test Tool",
      description: "Test",
      inputSchema: {
        keepParam: z.string(),
        removeParam: z.number().optional(),
        alsoKeep: z.boolean().optional(),
      },
      smallModelModeConfig: {
        excludeParams: ["removeParam"],
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

  it("should use full schema when smallModelMode is disabled", () => {
    const { mockServer } = registerTestTool(
      {
        title: "Test Tool",
        description: "Test",
        inputSchema: {
          keepParam: z.string(),
          removeParam: z.number().optional(),
        },
        smallModelModeConfig: {
          excludeParams: ["removeParam"],
        },
      },
      { smallModelMode: false },
    );

    // Verify tool was registered with full schema (all params present)
    const shape = getRegisteredShape(mockServer);

    expect(Object.keys(shape)).toStrictEqual(["keepParam", "removeParam"]);
  });

  it("should strip filtered parameters in smallModelMode", async () => {
    const { mockServer, mockCallLiveApi } = registerTestTool(
      {
        title: "Test Tool",
        description: "Test",
        inputSchema: {
          allowedParam: z.string(),
          filteredParam: z.number().optional(),
        },
        smallModelModeConfig: {
          excludeParams: ["filteredParam"],
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

  it("should work normally without smallModelModeConfig", () => {
    const { mockServer } = registerTestTool(
      {
        title: "Test Tool",
        description: "Test",
        inputSchema: {
          param1: z.string(),
          param2: z.number().optional(),
        },
        // No smallModelModeConfig
      },
      { smallModelMode: true },
    );

    // Should use original schema even in small model mode
    const shape = getRegisteredShape(mockServer);

    expect(Object.keys(shape)).toStrictEqual(["param1", "param2"]);
  });

  it("should apply description overrides when smallModelMode is enabled", () => {
    const { mockServer } = registerTestTool(
      {
        title: "Test Tool",
        description: "Test",
        inputSchema: {
          param1: z.string().describe("original description"),
          param2: z.number().optional().describe("original number"),
        },
        smallModelModeConfig: {
          descriptionOverrides: {
            param1: "simplified",
          },
        },
      },
      { smallModelMode: true },
    );

    const shape = getRegisteredShape(mockServer) as Record<
      string,
      { description?: string }
    >;

    // param1 should have overridden description
    expect(shape.param1?.description).toBe("simplified");

    // param2 should keep original description
    expect(shape.param2?.description).toBe("original number");
  });

  it("should work with only descriptionOverrides (no excludeParams)", () => {
    const { mockServer } = registerTestTool(
      {
        title: "Test Tool",
        description: "Test",
        inputSchema: {
          keepAll: z.string().describe("verbose description"),
          alsoKeep: z.number().optional(),
        },
        smallModelModeConfig: {
          descriptionOverrides: {
            keepAll: "short",
          },
        },
      },
      { smallModelMode: true },
    );

    const shape = getRegisteredShape(mockServer) as Record<
      string,
      { description?: string }
    >;

    // Both params should be present
    expect(Object.keys(shape)).toStrictEqual(["keepAll", "alsoKeep"]);

    // keepAll should have overridden description
    expect(shape.keepAll?.description).toBe("short");
  });

  it("should apply toolDescription override when smallModelMode is enabled", () => {
    const { mockServer } = registerTestTool(
      {
        title: "Test Tool",
        description: "Original verbose tool description with many details",
        inputSchema: { param: z.string() },
        smallModelModeConfig: {
          toolDescription: "Short description",
        },
      },
      { smallModelMode: true },
    );

    const config = getRegisteredConfig(mockServer);

    expect(config.description).toBe("Short description");
  });

  it("should use original description when smallModelMode is disabled", () => {
    const { mockServer } = registerTestTool(
      {
        title: "Test Tool",
        description: "Original verbose tool description",
        inputSchema: { param: z.string() },
        smallModelModeConfig: {
          toolDescription: "Short description",
        },
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
      text: "Warning: test-tool ignored unexpected argument(s): unknownParam, anotherExtra",
    });
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
