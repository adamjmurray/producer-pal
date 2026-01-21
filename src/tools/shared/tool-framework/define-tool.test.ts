import { describe, expect, it, vi, type Mock } from "vitest";
import { z, type ZodObject, type ZodRawShape } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { defineTool } from "./define-tool.ts";

// Helper to create mock server with proper typing
function createMockServer() {
  return { registerTool: vi.fn() } as unknown as McpServer & {
    registerTool: Mock;
  };
}

// Helper to extract shape from a Zod object schema (works with passthrough schemas)
function getSchemaShape(schema: ZodObject<ZodRawShape>): ZodRawShape {
  return schema.shape;
}

describe("defineTool", () => {
  it("should register tool with correct config", () => {
    const mockServer = createMockServer();
    const mockCallLiveApi = vi.fn();

    const toolName = "test-tool";
    const toolOptions = {
      title: "Test Tool",
      description: "A test tool",
      inputSchema: {
        requiredParam: z.string(),
        optionalParam: z.number().optional(),
      },
    };

    const toolRegistrar = defineTool(toolName, toolOptions);

    toolRegistrar(mockServer, mockCallLiveApi);

    expect(mockServer.registerTool).toHaveBeenCalledWith(
      toolName,
      expect.objectContaining({
        title: "Test Tool",
        description: "A test tool",
      }),
      expect.any(Function),
    );

    // Verify schema shape matches (inputSchema is now a Zod object with passthrough)
    const registeredConfig = mockServer.registerTool.mock.calls[0]![1];
    const shape = getSchemaShape(registeredConfig.inputSchema);

    expect(Object.keys(shape)).toStrictEqual([
      "requiredParam",
      "optionalParam",
    ]);
  });

  it("should call liveApi for valid input", async () => {
    const mockServer = createMockServer();
    const mockCallLiveApi = vi.fn().mockResolvedValue({
      content: [{ type: "text", text: "success" }],
    });

    const toolOptions = {
      title: "Test Tool",
      description: "Test",
      inputSchema: {
        param: z.string(),
      },
    };

    const toolRegistrar = defineTool("test-tool", toolOptions);

    toolRegistrar(mockServer, mockCallLiveApi);

    const toolHandler = mockServer.registerTool.mock.calls[0]![2];

    // Test valid input
    const validArgs = { param: "valid" };
    const result = await toolHandler(validArgs);

    expect(mockCallLiveApi).toHaveBeenCalledWith("test-tool", validArgs);
    expect(result).toStrictEqual({
      content: [{ type: "text", text: "success" }],
    });
  });

  it("should filter schema parameters when smallModelMode is enabled", () => {
    const mockServer = createMockServer();
    const mockCallLiveApi = vi.fn();

    const toolOptions = {
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

    const toolRegistrar = defineTool("test-tool", toolOptions);

    toolRegistrar(mockServer, mockCallLiveApi, { smallModelMode: true });

    // Verify tool was registered with filtered schema
    const registeredConfig = mockServer.registerTool.mock.calls[0]![1];
    const shape = getSchemaShape(registeredConfig.inputSchema);

    expect(Object.keys(shape)).toStrictEqual(["keepParam", "alsoKeep"]);
    expect(shape.keepParam).toBe(toolOptions.inputSchema.keepParam);
    expect(shape.alsoKeep).toBe(toolOptions.inputSchema.alsoKeep);
    expect(shape.removeParam).toBeUndefined();
  });

  it("should use full schema when smallModelMode is disabled", () => {
    const mockServer = createMockServer();
    const mockCallLiveApi = vi.fn();

    const toolOptions = {
      title: "Test Tool",
      description: "Test",
      inputSchema: {
        keepParam: z.string(),
        removeParam: z.number().optional(),
      },
      smallModelModeConfig: {
        excludeParams: ["removeParam"],
      },
    };

    const toolRegistrar = defineTool("test-tool", toolOptions);

    toolRegistrar(mockServer, mockCallLiveApi, { smallModelMode: false });

    // Verify tool was registered with full schema (all params present)
    const registeredConfig = mockServer.registerTool.mock.calls[0]![1];
    const shape = getSchemaShape(registeredConfig.inputSchema);

    expect(Object.keys(shape)).toStrictEqual(["keepParam", "removeParam"]);
  });

  it("should strip filtered parameters in smallModelMode", async () => {
    const mockServer = createMockServer();
    const mockCallLiveApi = vi.fn().mockResolvedValue({
      content: [{ type: "text", text: "success" }],
    });

    const toolOptions = {
      title: "Test Tool",
      description: "Test",
      inputSchema: {
        allowedParam: z.string(),
        filteredParam: z.number().optional(),
      },
      smallModelModeConfig: {
        excludeParams: ["filteredParam"],
      },
    };

    const toolRegistrar = defineTool("test-tool", toolOptions);

    toolRegistrar(mockServer, mockCallLiveApi, { smallModelMode: true });

    const toolHandler = mockServer.registerTool.mock.calls[0]![2];

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
    const mockServer = createMockServer();
    const mockCallLiveApi = vi.fn();

    const toolOptions = {
      title: "Test Tool",
      description: "Test",
      inputSchema: {
        param1: z.string(),
        param2: z.number().optional(),
      },
      // No smallModelModeConfig
    };

    const toolRegistrar = defineTool("test-tool", toolOptions);

    toolRegistrar(mockServer, mockCallLiveApi, { smallModelMode: true });

    // Should use original schema even in small model mode
    const registeredConfig = mockServer.registerTool.mock.calls[0]![1];
    const shape = getSchemaShape(registeredConfig.inputSchema);

    expect(Object.keys(shape)).toStrictEqual(["param1", "param2"]);
  });

  it("should apply description overrides when smallModelMode is enabled", () => {
    const mockServer = createMockServer();
    const mockCallLiveApi = vi.fn();

    const toolOptions = {
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
    };

    const toolRegistrar = defineTool("test-tool", toolOptions);

    toolRegistrar(mockServer, mockCallLiveApi, { smallModelMode: true });

    const registeredConfig = mockServer.registerTool.mock.calls[0]![1];
    const shape = getSchemaShape(registeredConfig.inputSchema) as Record<
      string,
      { description?: string }
    >;

    // param1 should have overridden description
    expect(shape.param1?.description).toBe("simplified");

    // param2 should keep original description
    expect(shape.param2?.description).toBe("original number");
  });

  it("should work with only descriptionOverrides (no excludeParams)", () => {
    const mockServer = createMockServer();
    const mockCallLiveApi = vi.fn();

    const toolOptions = {
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
    };

    const toolRegistrar = defineTool("test-tool", toolOptions);

    toolRegistrar(mockServer, mockCallLiveApi, { smallModelMode: true });

    const registeredConfig = mockServer.registerTool.mock.calls[0]![1];
    const shape = getSchemaShape(registeredConfig.inputSchema) as Record<
      string,
      { description?: string }
    >;

    // Both params should be present
    expect(Object.keys(shape)).toStrictEqual(["keepAll", "alsoKeep"]);

    // keepAll should have overridden description
    expect(shape.keepAll?.description).toBe("short");
  });

  it("should apply toolDescription override when smallModelMode is enabled", () => {
    const mockServer = createMockServer();
    const mockCallLiveApi = vi.fn();

    const toolOptions = {
      title: "Test Tool",
      description: "Original verbose tool description with many details",
      inputSchema: {
        param: z.string(),
      },
      smallModelModeConfig: {
        toolDescription: "Short description",
      },
    };

    const toolRegistrar = defineTool("test-tool", toolOptions);

    toolRegistrar(mockServer, mockCallLiveApi, { smallModelMode: true });

    const registeredConfig = mockServer.registerTool.mock.calls[0]![1];

    expect(registeredConfig.description).toBe("Short description");
  });

  it("should use original description when smallModelMode is disabled", () => {
    const mockServer = createMockServer();
    const mockCallLiveApi = vi.fn();

    const toolOptions = {
      title: "Test Tool",
      description: "Original verbose tool description",
      inputSchema: {
        param: z.string(),
      },
      smallModelModeConfig: {
        toolDescription: "Short description",
      },
    };

    const toolRegistrar = defineTool("test-tool", toolOptions);

    toolRegistrar(mockServer, mockCallLiveApi, { smallModelMode: false });

    const registeredConfig = mockServer.registerTool.mock.calls[0]![1];

    expect(registeredConfig.description).toBe(
      "Original verbose tool description",
    );
  });

  it("should warn when extra arguments are passed", async () => {
    const mockServer = createMockServer();
    const mockCallLiveApi = vi.fn().mockResolvedValue({
      content: [{ type: "text", text: "success" }],
    });

    const toolOptions = {
      title: "Test Tool",
      description: "Test",
      inputSchema: {
        knownParam: z.string(),
      },
    };

    const toolRegistrar = defineTool("test-tool", toolOptions);

    toolRegistrar(mockServer, mockCallLiveApi);

    const toolHandler = mockServer.registerTool.mock.calls[0]![2];

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
    const mockServer = createMockServer();
    const mockCallLiveApi = vi.fn().mockResolvedValue({
      content: [{ type: "text", text: "success" }],
    });

    const toolOptions = {
      title: "Test Tool",
      description: "Test",
      inputSchema: {
        sceneIndex: z.coerce.string(), // Use Zod coercion for transport-layer tolerance
      },
    };

    const toolRegistrar = defineTool("test-tool", toolOptions);

    toolRegistrar(mockServer, mockCallLiveApi);

    const toolHandler = mockServer.registerTool.mock.calls[0]![2];

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
