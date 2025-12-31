import type { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { describe, expect, it, vi } from "vitest";
import { OpenAIClient } from "./openai-client";

// Mock MCP SDK
// @ts-expect-error vi.mock partial implementation
vi.mock(import("@modelcontextprotocol/sdk/client/index.js"), () => ({
  Client: class MockClient {
    connect = vi.fn();
    close = vi.fn();
    listTools = vi.fn();
    callTool = vi.fn();
  },
}));

vi.mock(import("@modelcontextprotocol/sdk/client/streamableHttp.js"), () => ({
  StreamableHTTPClientTransport: vi.fn(),
}));

describe("OpenAIClient.sendMessage", () => {
  it("throws error when MCP client is not initialized", async () => {
    const client = new OpenAIClient("test-key", { model: "gpt-4" });

    await expect(async () => {
      const stream = client.sendMessage("test");

      await stream.next();
    }).rejects.toThrow("MCP client not initialized. Call initialize() first.");
  });

  it("adds user message to history and yields it", async () => {
    const client = new OpenAIClient("test-key", { model: "gpt-4" });

    // Mock the MCP client
    const mockMcpClient = {
      connect: vi.fn(),
      listTools: vi.fn().mockResolvedValue({ tools: [] }),
      callTool: vi.fn(),
    };

    client.mcpClient = mockMcpClient as unknown as Client;

    // Mock the OpenAI client
    client.ai = {
      chat: {
        completions: {
          create: vi.fn().mockImplementation(async function* () {
            yield {
              choices: [
                {
                  delta: { content: "Hello" },
                  finish_reason: null,
                },
              ],
            };
            yield {
              choices: [
                {
                  delta: {},
                  finish_reason: "stop",
                },
              ],
            };
          }),
        },
      },
    } as unknown as typeof client.ai;

    // Send message and collect history updates
    const historyUpdates = [];

    for await (const history of client.sendMessage("test message")) {
      historyUpdates.push([...history]);
    }

    // First yield should have the user message
    expect(historyUpdates[0]).toHaveLength(1);
    expect(historyUpdates[0]?.[0]).toMatchObject({
      role: "user",
      content: "test message",
    });
  });

  it("processes streaming response and updates history", async () => {
    const client = new OpenAIClient("test-key", { model: "gpt-4" });

    // Mock the MCP client
    const mockMcpClient = {
      connect: vi.fn(),
      listTools: vi.fn().mockResolvedValue({ tools: [] }),
      callTool: vi.fn(),
    };

    client.mcpClient = mockMcpClient as unknown as Client;

    // Mock the OpenAI client with streaming response
    client.ai = {
      chat: {
        completions: {
          create: vi.fn().mockImplementation(async function* () {
            yield {
              choices: [
                {
                  delta: { role: "assistant", content: "Hello" },
                  finish_reason: null,
                },
              ],
            };
            yield {
              choices: [
                {
                  delta: { content: " world" },
                  finish_reason: null,
                },
              ],
            };
            yield {
              choices: [
                {
                  delta: {},
                  finish_reason: "stop",
                },
              ],
            };
          }),
        },
      },
    } as unknown as typeof client.ai;

    // Send message and collect history updates
    const historyUpdates = [];

    for await (const history of client.sendMessage("Hi")) {
      historyUpdates.push([...history]);
    }

    // Last update should have accumulated content
    const finalHistory = historyUpdates[historyUpdates.length - 1];

    expect(finalHistory).toHaveLength(2);
    expect(finalHistory?.[1]).toMatchObject({
      role: "assistant",
      content: "Hello world",
    });
  });

  it("executes tool calls and adds tool response to history", async () => {
    const client = new OpenAIClient("test-key", { model: "gpt-4" });

    // Mock the MCP client
    const mockMcpClient = {
      connect: vi.fn(),
      listTools: vi.fn().mockResolvedValue({
        tools: [
          { name: "test-tool", description: "Test tool", inputSchema: {} },
        ],
      }),
      callTool: vi.fn().mockResolvedValue({
        content: [{ type: "text", text: "Tool result" }],
      }),
    };

    client.mcpClient = mockMcpClient as unknown as Client;

    // Mock the OpenAI client with tool call
    let callCount = 0;

    client.ai = {
      chat: {
        completions: {
          create: vi.fn().mockImplementation(async function* () {
            callCount++;

            if (callCount === 1) {
              // First call: model responds with tool call
              yield {
                choices: [
                  {
                    delta: { role: "assistant", content: "" },
                    finish_reason: null,
                  },
                ],
              };
              yield {
                choices: [
                  {
                    delta: {
                      tool_calls: [
                        {
                          index: 0,
                          id: "call_123",
                          function: { name: "test-tool", arguments: '{"a":' },
                        },
                      ],
                    },
                    finish_reason: null,
                  },
                ],
              };
              yield {
                choices: [
                  {
                    delta: {
                      tool_calls: [
                        {
                          index: 0,
                          function: { arguments: '"b"}' },
                        },
                      ],
                    },
                    finish_reason: "tool_calls",
                  },
                ],
              };
            } else {
              // Second call: model responds with text after tool execution
              yield {
                choices: [
                  {
                    delta: { content: "Done" },
                    finish_reason: "stop",
                  },
                ],
              };
            }
          }),
        },
      },
    } as unknown as typeof client.ai;

    // Send message and collect history updates
    const historyUpdates = [];

    for await (const history of client.sendMessage("Run tool")) {
      historyUpdates.push([...history]);
    }

    // Verify tool was called
    expect(mockMcpClient.callTool).toHaveBeenCalledTimes(1);
    expect(mockMcpClient.callTool).toHaveBeenCalledWith({
      name: "test-tool",
      arguments: { a: "b" },
    });

    // Verify final history includes tool message
    const finalHistory = historyUpdates[historyUpdates.length - 1];

    expect(finalHistory?.some((msg) => msg.role === "tool")).toBe(true);
  });

  it("handles tool execution errors gracefully", async () => {
    const client = new OpenAIClient("test-key", { model: "gpt-4" });

    // Mock the MCP client
    const mockMcpClient = {
      connect: vi.fn(),
      listTools: vi.fn().mockResolvedValue({
        tools: [{ name: "error-tool", description: "Tool", inputSchema: {} }],
      }),
      callTool: vi.fn().mockRejectedValue(new Error("Tool failed")),
    };

    client.mcpClient = mockMcpClient as unknown as Client;

    // Mock the OpenAI client with tool call
    let callCount = 0;

    client.ai = {
      chat: {
        completions: {
          create: vi.fn().mockImplementation(async function* () {
            callCount++;

            if (callCount === 1) {
              yield {
                choices: [
                  {
                    delta: {
                      tool_calls: [
                        {
                          index: 0,
                          id: "call_err",
                          function: { name: "error-tool", arguments: "{}" },
                        },
                      ],
                    },
                    finish_reason: "tool_calls",
                  },
                ],
              };
            } else {
              yield {
                choices: [
                  {
                    delta: { content: "Error handled" },
                    finish_reason: "stop",
                  },
                ],
              };
            }
          }),
        },
      },
    } as unknown as typeof client.ai;

    // Send message and collect history updates
    const historyUpdates = [];

    for await (const history of client.sendMessage("Run error tool")) {
      historyUpdates.push([...history]);
    }

    // Verify error was added to history as tool message
    const finalHistory = historyUpdates[historyUpdates.length - 1];
    const toolMessage = finalHistory?.find((msg) => msg.role === "tool");

    expect(toolMessage).toBeDefined();
    const content = JSON.parse(toolMessage?.content as string);

    expect(content.error).toBe("Tool failed");
    expect(content.isError).toBe(true);
  });

  it("filters tools based on enabledTools config", async () => {
    const client = new OpenAIClient("test-key", {
      model: "gpt-4",
      enabledTools: { "enabled-tool": true, "disabled-tool": false },
    });

    // Mock the MCP client with multiple tools
    const mockMcpClient = {
      connect: vi.fn(),
      listTools: vi.fn().mockResolvedValue({
        tools: [
          { name: "enabled-tool", description: "Enabled", inputSchema: {} },
          { name: "disabled-tool", description: "Disabled", inputSchema: {} },
          { name: "default-tool", description: "Default", inputSchema: {} },
        ],
      }),
      callTool: vi.fn(),
    };

    client.mcpClient = mockMcpClient as unknown as Client;

    // Track what tools are passed to create
    let passedTools: unknown[] = [];

    client.ai = {
      chat: {
        completions: {
          create: vi.fn().mockImplementation(async function* (options) {
            passedTools = options.tools ?? [];
            yield {
              choices: [
                {
                  delta: { content: "Done" },
                  finish_reason: "stop",
                },
              ],
            };
          }),
        },
      },
    } as unknown as typeof client.ai;

    // Send message
    for await (const _history of client.sendMessage("Test")) {
      // consume generator
    }

    // Verify only enabled and default tools were passed
    const toolNames = passedTools.map(
      (t) => (t as { function: { name: string } }).function.name,
    );

    expect(toolNames).toContain("enabled-tool");
    expect(toolNames).toContain("default-tool");
    expect(toolNames).not.toContain("disabled-tool");
  });

  it("stops loop when abort signal is triggered", async () => {
    const client = new OpenAIClient("test-key", { model: "gpt-4" });

    // Mock the MCP client
    const mockMcpClient = {
      connect: vi.fn(),
      listTools: vi.fn().mockResolvedValue({
        tools: [{ name: "test-tool", description: "Test", inputSchema: {} }],
      }),
      callTool: vi.fn().mockResolvedValue({ content: "result" }),
    };

    client.mcpClient = mockMcpClient as unknown as Client;

    // Create abort controller
    const abortController = new AbortController();

    // Mock the OpenAI client
    let callCount = 0;

    client.ai = {
      chat: {
        completions: {
          create: vi.fn().mockImplementation(async function* () {
            callCount++;

            if (callCount === 1) {
              yield {
                choices: [
                  {
                    delta: {
                      tool_calls: [
                        {
                          index: 0,
                          id: "call_1",
                          function: { name: "test-tool", arguments: "{}" },
                        },
                      ],
                    },
                    finish_reason: "tool_calls",
                  },
                ],
              };
              // Abort after first tool call
              abortController.abort();
            }
          }),
        },
      },
    } as unknown as typeof client.ai;

    // Send message with abort signal
    const historyUpdates = [];

    for await (const history of client.sendMessage(
      "Test",
      abortController.signal,
    )) {
      historyUpdates.push([...history]);
    }

    // Should only call once (aborted before second iteration)
    expect(callCount).toBe(1);
    expect(mockMcpClient.callTool).toHaveBeenCalledTimes(1);
  });

  it("applies temperature and reasoning overrides", async () => {
    const client = new OpenAIClient("test-key", {
      model: "gpt-4",
      temperature: 0.5,
    });

    // Mock the MCP client
    const mockMcpClient = {
      connect: vi.fn(),
      listTools: vi.fn().mockResolvedValue({ tools: [] }),
      callTool: vi.fn(),
    };

    client.mcpClient = mockMcpClient as unknown as Client;

    // Track options passed to create
    let createOptions: Record<string, unknown> = {};

    client.ai = {
      chat: {
        completions: {
          create: vi.fn().mockImplementation(async function* (options) {
            createOptions = options;
            yield {
              choices: [
                {
                  delta: { content: "Done" },
                  finish_reason: "stop",
                },
              ],
            };
          }),
        },
      },
    } as unknown as typeof client.ai;

    // Send message with temperature override
    for await (const _history of client.sendMessage("Test", undefined, {
      temperature: 0.9,
    })) {
      // consume generator
    }

    // Verify temperature override was applied
    expect(createOptions.temperature).toBe(0.9);
  });
});

describe("OpenAIClient with non-function tool calls", () => {
  it("skips non-function tool calls during execution", async () => {
    const client = new OpenAIClient("test-key", { model: "gpt-4" });

    // Mock the MCP client
    const mockMcpClient = {
      connect: vi.fn(),
      listTools: vi.fn().mockResolvedValue({
        tools: [{ name: "test-tool", description: "Test", inputSchema: {} }],
      }),
      callTool: vi.fn().mockResolvedValue({ content: "result" }),
    };

    client.mcpClient = mockMcpClient as unknown as Client;

    // Mock the OpenAI client with mixed tool call types
    let callCount = 0;

    client.ai = {
      chat: {
        completions: {
          create: vi.fn().mockImplementation(async function* () {
            callCount++;

            if (callCount === 1) {
              yield {
                choices: [
                  {
                    delta: {
                      tool_calls: [
                        {
                          index: 0,
                          id: "call_1",
                          type: "function",
                          function: { name: "test-tool", arguments: "{}" },
                        },
                      ],
                    },
                    finish_reason: "tool_calls",
                  },
                ],
              };
            } else {
              yield {
                choices: [
                  { delta: { content: "Done" }, finish_reason: "stop" },
                ],
              };
            }
          }),
        },
      },
    } as unknown as typeof client.ai;

    // Send message
    for await (const _history of client.sendMessage("Test")) {
      // consume generator
    }

    // Should only call the function-type tool
    expect(mockMcpClient.callTool).toHaveBeenCalledTimes(1);
  });
});
