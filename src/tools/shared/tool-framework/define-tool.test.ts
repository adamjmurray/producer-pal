import { describe, expect, it, vi, type Mock } from "vitest";
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  coerceArgsToSchema,
  defineTool,
  getExpectedPrimitiveType,
} from "./define-tool.ts";

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

  it("should coerce number to string before validation", async () => {
    const mockServer = createMockServer();
    const mockCallLiveApi = vi.fn().mockResolvedValue({ success: true });

    const toolOptions = {
      title: "Test Tool",
      description: "Test",
      inputSchema: {
        sceneIndex: z.string(), // String that accepts comma-separated values
      },
    };

    const toolRegistrar = defineTool("test-tool", toolOptions);

    toolRegistrar(mockServer, mockCallLiveApi);

    const toolHandler = mockServer.registerTool.mock.calls[0]![2];

    // LLM sends number instead of string
    const result = await toolHandler({ sceneIndex: 0 });

    expect(result).toStrictEqual({ success: true });
    expect(mockCallLiveApi).toHaveBeenCalledWith("test-tool", {
      sceneIndex: "0",
    });
  });

  it("should coerce string to number before validation", async () => {
    const mockServer = createMockServer();
    const mockCallLiveApi = vi.fn().mockResolvedValue({ success: true });

    const toolOptions = {
      title: "Test Tool",
      description: "Test",
      inputSchema: {
        trackIndex: z.number(),
      },
    };

    const toolRegistrar = defineTool("test-tool", toolOptions);

    toolRegistrar(mockServer, mockCallLiveApi);

    const toolHandler = mockServer.registerTool.mock.calls[0]![2];

    const result = await toolHandler({ trackIndex: "5" });

    expect(result).toStrictEqual({ success: true });
    expect(mockCallLiveApi).toHaveBeenCalledWith("test-tool", {
      trackIndex: 5,
    });
  });

  it("should coerce string to boolean before validation", async () => {
    const mockServer = createMockServer();
    const mockCallLiveApi = vi.fn().mockResolvedValue({ success: true });

    const toolOptions = {
      title: "Test Tool",
      description: "Test",
      inputSchema: {
        mute: z.boolean(),
      },
    };

    const toolRegistrar = defineTool("test-tool", toolOptions);

    toolRegistrar(mockServer, mockCallLiveApi);

    const toolHandler = mockServer.registerTool.mock.calls[0]![2];

    const result = await toolHandler({ mute: "true" });

    expect(result).toStrictEqual({ success: true });
    expect(mockCallLiveApi).toHaveBeenCalledWith("test-tool", { mute: true });
  });
});

describe("getExpectedPrimitiveType", () => {
  it("should return 'string' for ZodString", () => {
    expect(getExpectedPrimitiveType(z.string())).toBe("string");
  });

  it("should return 'number' for ZodNumber", () => {
    expect(getExpectedPrimitiveType(z.number())).toBe("number");
  });

  it("should return 'boolean' for ZodBoolean", () => {
    expect(getExpectedPrimitiveType(z.boolean())).toBe("boolean");
  });

  it("should unwrap optional wrappers", () => {
    expect(getExpectedPrimitiveType(z.string().optional())).toBe("string");
    expect(getExpectedPrimitiveType(z.number().optional())).toBe("number");
    expect(getExpectedPrimitiveType(z.boolean().optional())).toBe("boolean");
  });

  it("should unwrap default wrappers", () => {
    expect(getExpectedPrimitiveType(z.string().default("foo"))).toBe("string");
    expect(getExpectedPrimitiveType(z.number().default(0))).toBe("number");
  });

  it("should unwrap nullable wrappers", () => {
    expect(getExpectedPrimitiveType(z.string().nullable())).toBe("string");
  });

  it("should unwrap nested wrappers", () => {
    expect(getExpectedPrimitiveType(z.string().optional().default("x"))).toBe(
      "string",
    );
  });

  it("should return null for non-primitive types", () => {
    expect(getExpectedPrimitiveType(z.object({}))).toBeNull();
    expect(getExpectedPrimitiveType(z.array(z.string()))).toBeNull();
  });

  it("should return null for undefined/null input", () => {
    expect(getExpectedPrimitiveType(null)).toBeNull();
    expect(getExpectedPrimitiveType(undefined)).toBeNull();
  });
});

describe("coerceArgsToSchema", () => {
  it("should coerce number to string", () => {
    const schema = { sceneIndex: z.string() };
    const result = coerceArgsToSchema({ sceneIndex: 0 }, schema);

    expect(result).toStrictEqual({ sceneIndex: "0" });
  });

  it("should coerce string to number when valid", () => {
    const schema = { trackIndex: z.number() };
    const result = coerceArgsToSchema({ trackIndex: "5" }, schema);

    expect(result).toStrictEqual({ trackIndex: 5 });
  });

  it("should not coerce invalid string to number", () => {
    const schema = { trackIndex: z.number() };
    const result = coerceArgsToSchema({ trackIndex: "invalid" }, schema);

    expect(result).toStrictEqual({ trackIndex: "invalid" }); // Let Zod catch it
  });

  it("should coerce 'true' string to boolean", () => {
    const schema = { mute: z.boolean() };
    const result = coerceArgsToSchema({ mute: "true" }, schema);

    expect(result).toStrictEqual({ mute: true });
  });

  it("should coerce 'false' string to boolean", () => {
    const schema = { mute: z.boolean() };
    const result = coerceArgsToSchema({ mute: "false" }, schema);

    expect(result).toStrictEqual({ mute: false });
  });

  it("should coerce case-insensitively for boolean strings", () => {
    const schema = { mute: z.boolean() };

    expect(coerceArgsToSchema({ mute: "TRUE" }, schema)).toStrictEqual({
      mute: true,
    });
    expect(coerceArgsToSchema({ mute: "False" }, schema)).toStrictEqual({
      mute: false,
    });
  });

  it("should not coerce invalid boolean strings", () => {
    const schema = { mute: z.boolean() };
    const result = coerceArgsToSchema({ mute: "yes" }, schema);

    expect(result).toStrictEqual({ mute: "yes" }); // Let Zod catch it
  });

  it("should coerce number to boolean (0 = false, non-0 = true)", () => {
    const schema = { mute: z.boolean() };

    expect(coerceArgsToSchema({ mute: 1 }, schema)).toStrictEqual({
      mute: true,
    });
    expect(coerceArgsToSchema({ mute: 0 }, schema)).toStrictEqual({
      mute: false,
    });
    // Negative and float numbers also coerce (any non-zero = true)
    expect(coerceArgsToSchema({ mute: -1 }, schema)).toStrictEqual({
      mute: true,
    });
    expect(coerceArgsToSchema({ mute: 0.5 }, schema)).toStrictEqual({
      mute: true,
    });
  });

  it("should not modify values that are already correct type", () => {
    const schema = { foo: z.string() };
    const result = coerceArgsToSchema({ foo: "bar" }, schema);

    expect(result).toStrictEqual({ foo: "bar" });
  });

  it("should handle null values by skipping them", () => {
    const schema = { foo: z.string().optional() };
    const result = coerceArgsToSchema({ foo: null }, schema);

    expect(result).toStrictEqual({ foo: null });
  });

  it("should handle undefined values by skipping them", () => {
    const schema = { foo: z.string().optional() };
    const result = coerceArgsToSchema({ foo: undefined }, schema);

    expect(result).toStrictEqual({ foo: undefined });
  });

  it("should handle missing keys by skipping them", () => {
    const schema = { foo: z.string(), bar: z.number() };
    const result = coerceArgsToSchema({ foo: "test" }, schema);

    expect(result).toStrictEqual({ foo: "test" });
  });

  it("should work with optional wrapped schemas", () => {
    const schema = { index: z.string().optional() };
    const result = coerceArgsToSchema({ index: 42 }, schema);

    expect(result).toStrictEqual({ index: "42" });
  });

  it("should work with default wrapped schemas", () => {
    const schema = { count: z.number().default(0) };
    const result = coerceArgsToSchema({ count: "10" }, schema);

    expect(result).toStrictEqual({ count: 10 });
  });

  it("should preserve extra keys not in schema", () => {
    const schema = { foo: z.string() };
    const result = coerceArgsToSchema({ foo: 1, extra: "value" }, schema);

    expect(result).toStrictEqual({ foo: "1", extra: "value" });
  });
});
