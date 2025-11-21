import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { defineTool } from "./define-tool.js";

describe("defineTool", () => {
  it("should register tool and handle validation errors", async () => {
    const mockServer = {
      registerTool: vi.fn(),
    };
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
    const toolHandler = mockServer.registerTool.mock.calls[0][2];

    // Test validation error case
    const invalidArgs = { optionalParam: "not a number" };
    const result = await toolHandler(invalidArgs);

    expect(result).toEqual({
      content: [
        {
          type: "text",
          text: expect.stringContaining("Validation error in test-tool:"),
        },
      ],
      isError: true,
    });

    expect(result.content[0].text).toContain("requiredParam: Required");
    expect(result.content[0].text).toContain(
      "optionalParam: Expected number, received string",
    );
  });

  it("should call liveApi for valid input", async () => {
    const mockServer = {
      registerTool: vi.fn(),
    };
    const mockCallLiveApi = vi.fn().mockResolvedValue({ success: true });

    const toolOptions = {
      title: "Test Tool",
      inputSchema: {
        param: z.string(),
      },
    };

    const toolRegistrar = defineTool("test-tool", toolOptions);
    toolRegistrar(mockServer, mockCallLiveApi);

    const toolHandler = mockServer.registerTool.mock.calls[0][2];

    // Test valid input
    const validArgs = { param: "valid" };
    const result = await toolHandler(validArgs);

    expect(mockCallLiveApi).toHaveBeenCalledWith("test-tool", validArgs);
    expect(result).toEqual({ success: true });
  });

  it("should filter schema parameters when smallModelMode is enabled", () => {
    const mockServer = {
      registerTool: vi.fn(),
    };
    const mockCallLiveApi = vi.fn();

    const toolOptions = {
      title: "Test Tool",
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
    const registeredConfig = mockServer.registerTool.mock.calls[0][1];
    expect(Object.keys(registeredConfig.inputSchema)).toEqual([
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
    const mockServer = {
      registerTool: vi.fn(),
    };
    const mockCallLiveApi = vi.fn();

    const toolOptions = {
      title: "Test Tool",
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
    const registeredConfig = mockServer.registerTool.mock.calls[0][1];
    expect(registeredConfig.inputSchema).toEqual(toolOptions.inputSchema);
  });

  it("should strip filtered parameters in smallModelMode", async () => {
    const mockServer = {
      registerTool: vi.fn(),
    };
    const mockCallLiveApi = vi.fn().mockResolvedValue({ success: true });

    const toolOptions = {
      title: "Test Tool",
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

    const toolHandler = mockServer.registerTool.mock.calls[0][2];

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
    expect(mockCallLiveApi.mock.calls[0][1]).not.toHaveProperty(
      "filteredParam",
    );
  });

  it("should work normally without smallModelModeConfig", () => {
    const mockServer = {
      registerTool: vi.fn(),
    };
    const mockCallLiveApi = vi.fn();

    const toolOptions = {
      title: "Test Tool",
      inputSchema: {
        param1: z.string(),
        param2: z.number().optional(),
      },
      // No smallModelModeConfig
    };

    const toolRegistrar = defineTool("test-tool", toolOptions);
    toolRegistrar(mockServer, mockCallLiveApi, { smallModelMode: true });

    // Should use original schema even in small model mode
    const registeredConfig = mockServer.registerTool.mock.calls[0][1];
    expect(registeredConfig.inputSchema).toEqual(toolOptions.inputSchema);
  });
});
