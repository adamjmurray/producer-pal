// src/mcp-server/define-tool.test.js
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
});
