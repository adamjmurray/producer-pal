import { describe, expect, it, vi, type Mock } from "vitest";
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { defineTool } from "./define-tool.ts";

// Helper to create mock server with proper typing
function createMockServer() {
  return { registerTool: vi.fn() } as unknown as McpServer & {
    registerTool: Mock;
  };
}

describe("defineTool", () => {
  it("should register tool and handle validation errors", async () => {
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

    // Create and register the tool
    const toolRegistrar = defineTool(toolName, toolOptions);

    toolRegistrar(mockServer, mockCallLiveApi);

    // Verify tool was registered
    expect(mockServer.registerTool).toHaveBeenCalledWith(
      toolName,
      expect.objectContaining({
        title: "Test Tool",
        description: "A test tool",
        inputSchema: toolOptions.inputSchema,
      }),
      expect.any(Function),
    );

    // Get the registered tool handler
    const toolHandler = mockServer.registerTool.mock.calls[0]![2];

    // Test validation error case
    const invalidArgs = { optionalParam: "not a number" };
    const result = await toolHandler(invalidArgs);

    expect(result).toStrictEqual({
      content: [
        {
          type: "text",
          text: expect.stringContaining("Validation error in test-tool:"),
        },
      ],
      isError: true,
    });

    expect(result.content[0].text).toContain(
      "requiredParam: Invalid input: expected string, received undefined",
    );
    expect(result.content[0].text).toContain(
      "optionalParam: Invalid input: expected number, received string",
    );
  });

  it("should call liveApi for valid input", async () => {
    const mockServer = createMockServer();
    const mockCallLiveApi = vi.fn().mockResolvedValue({ success: true });

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
    expect(result).toStrictEqual({ success: true });
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

    expect(Object.keys(registeredConfig.inputSchema)).toStrictEqual([
      "keepParam",
      "alsoKeep",
    ]);
    expect(registeredConfig.inputSchema.keepParam).toBe(
      toolOptions.inputSchema.keepParam,
    );
    expect(registeredConfig.inputSchema.alsoKeep).toBe(
      toolOptions.inputSchema.alsoKeep,
    );
    expect(registeredConfig.inputSchema.removeParam).toBeUndefined();
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

    // Verify tool was registered with full schema
    const registeredConfig = mockServer.registerTool.mock.calls[0]![1];

    expect(registeredConfig.inputSchema).toStrictEqual(toolOptions.inputSchema);
  });

  it("should strip filtered parameters in smallModelMode", async () => {
    const mockServer = createMockServer();
    const mockCallLiveApi = vi.fn().mockResolvedValue({ success: true });

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

    expect(registeredConfig.inputSchema).toStrictEqual(toolOptions.inputSchema);
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

    // param1 should have overridden description
    expect(registeredConfig.inputSchema.param1.description).toBe("simplified");

    // param2 should keep original description
    expect(registeredConfig.inputSchema.param2.description).toBe(
      "original number",
    );
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

    // Both params should be present
    expect(Object.keys(registeredConfig.inputSchema)).toStrictEqual([
      "keepAll",
      "alsoKeep",
    ]);

    // keepAll should have overridden description
    expect(registeredConfig.inputSchema.keepAll.description).toBe("short");
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

  it("should format validation errors without path for root-level errors", async () => {
    const mockServer = createMockServer();
    const mockCallLiveApi = vi.fn();

    // Create a tool with a refinement at the root level that produces an error with empty path
    const toolOptions = {
      title: "Test Tool",
      description: "A test tool",
      inputSchema: {
        param: z.string(),
      },
    };

    const toolRegistrar = defineTool("test-tool", toolOptions);

    toolRegistrar(mockServer, mockCallLiveApi);

    const toolHandler = mockServer.registerTool.mock.calls[0]![2];

    // Pass null which triggers a root-level error
    // When safeParse receives null/undefined for an object, it creates an error with empty path
    const result = await toolHandler(null);

    expect(result).toStrictEqual({
      content: [
        {
          type: "text",
          text: expect.stringContaining("Validation error in test-tool:"),
        },
      ],
      isError: true,
    });
    // The error message should not have a path prefix (just the message)
    expect(result.content[0].text).toMatch(/Invalid input: expected object/);
  });

  it("should coerce number to string when using z.coerce.string()", async () => {
    const mockServer = createMockServer();
    const mockCallLiveApi = vi.fn().mockResolvedValue({ success: true });

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

    expect(result).toStrictEqual({ success: true });
    expect(mockCallLiveApi).toHaveBeenCalledWith("test-tool", {
      sceneIndex: "0",
    });
  });
});
