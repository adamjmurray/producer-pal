import { describe, expect, it, vi } from "vitest";
import { OpenAIClient } from "#webui/chat/openai/client";
import {
  createMockMcpClient,
  createMockStreamingResponse,
  createTextStreamChunks,
  setupMockClients,
  collectHistoryUpdates,
  createToolCallChunk,
  createMockAiClient,
  createToolThenDoneGenerator,
  DONE_CHUNK,
  type StreamChunk,
} from "#webui/test-utils/openai-client-test-helpers";

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
    const mcpClient = createMockMcpClient();
    const streamChunks = createTextStreamChunks("Hello");

    setupMockClients(
      client,
      mcpClient,
      createMockStreamingResponse(streamChunks),
    );

    const historyUpdates = await collectHistoryUpdates(
      client.sendMessage("test message"),
    );

    expect(historyUpdates[0]).toHaveLength(1);
    expect(historyUpdates[0]?.[0]).toMatchObject({
      role: "user",
      content: "test message",
    });
  });

  it("processes streaming response and updates history", async () => {
    const client = new OpenAIClient("test-key", { model: "gpt-4" });
    const mcpClient = createMockMcpClient();
    const streamChunks = createTextStreamChunks("Hello", " world");

    setupMockClients(
      client,
      mcpClient,
      createMockStreamingResponse(streamChunks),
    );

    const historyUpdates = await collectHistoryUpdates(
      client.sendMessage("Hi"),
    );

    const finalHistory = historyUpdates.at(-1);

    expect(finalHistory).toHaveLength(2);
    expect(finalHistory?.[1]).toMatchObject({
      role: "assistant",
      content: "Hello world",
    });
  });

  it("executes tool calls and adds tool response to history", async () => {
    const client = new OpenAIClient("test-key", { model: "gpt-4" });
    const mcpClient = createMockMcpClient({
      tools: [{ name: "test-tool", description: "Test tool", inputSchema: {} }],
    });

    client.mcpClient = mcpClient;

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
                        { index: 0, function: { arguments: '"b"}' } },
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

    const historyUpdates = await collectHistoryUpdates(
      client.sendMessage("Run tool"),
    );

    expect(mcpClient.callTool).toHaveBeenCalledTimes(1);
    expect(mcpClient.callTool).toHaveBeenCalledWith({
      name: "test-tool",
      arguments: { a: "b" },
    });

    const finalHistory = historyUpdates.at(-1);

    expect(
      finalHistory?.some((msg) => (msg as { role: string }).role === "tool"),
    ).toBe(true);
  });

  it("handles tool execution errors gracefully", async () => {
    const client = new OpenAIClient("test-key", { model: "gpt-4" });
    const mcpClient = createMockMcpClient({
      tools: [{ name: "error-tool", description: "Tool", inputSchema: {} }],
      callToolError: new Error("Tool failed"),
    });

    client.mcpClient = mcpClient;

    let callCount = 0;
    const toolCallChunks: StreamChunk[] = [
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
    ];
    const responseChunks: StreamChunk[] = [
      { delta: { content: "Error handled" }, finish_reason: "stop" },
    ];

    client.ai = {
      chat: {
        completions: {
          create: vi.fn().mockImplementation(async function* () {
            callCount++;

            if (callCount === 1) {
              for (const chunk of toolCallChunks) {
                yield { choices: [chunk] };
              }
            } else {
              for (const chunk of responseChunks) {
                yield { choices: [chunk] };
              }
            }
          }),
        },
      },
    } as unknown as typeof client.ai;

    const historyUpdates = await collectHistoryUpdates(
      client.sendMessage("Run error tool"),
    );

    const finalHistory = historyUpdates.at(-1);
    const toolMessage = finalHistory?.find(
      (msg) => (msg as { role: string }).role === "tool",
    );

    expect(toolMessage).toBeDefined();
    const content = JSON.parse((toolMessage as { content: string }).content);

    expect(content.error).toBe("Tool failed");
    expect(content.isError).toBe(true);
  });

  it("filters tools based on enabledTools config", async () => {
    const client = new OpenAIClient("test-key", {
      model: "gpt-4",
      enabledTools: { "enabled-tool": true, "disabled-tool": false },
    });
    const mcpClient = createMockMcpClient({
      tools: [
        { name: "enabled-tool", description: "Enabled", inputSchema: {} },
        { name: "disabled-tool", description: "Disabled", inputSchema: {} },
        { name: "default-tool", description: "Default", inputSchema: {} },
      ],
    });
    let passedTools: unknown[] = [];

    client.mcpClient = mcpClient;
    client.ai = createMockAiClient(async function* (options) {
      passedTools = (options as { tools?: unknown[] }).tools ?? [];
      yield { choices: [DONE_CHUNK] };
    }) as typeof client.ai;

    for await (const _history of client.sendMessage("Test")) {
      // consume generator
    }

    const toolNames = passedTools.map(
      (t) => (t as { function: { name: string } }).function.name,
    );

    expect(toolNames).toContain("enabled-tool");
    expect(toolNames).toContain("default-tool");
    expect(toolNames).not.toContain("disabled-tool");
  });

  it("stops loop when abort signal is triggered", async () => {
    const client = new OpenAIClient("test-key", { model: "gpt-4" });
    const mcpClient = createMockMcpClient({
      tools: [{ name: "test-tool", description: "Test", inputSchema: {} }],
    });
    const toolChunk = createToolCallChunk("test-tool", "{}");
    const abortController = new AbortController();
    let callCount = 0;

    client.mcpClient = mcpClient;
    client.ai = createMockAiClient(async function* () {
      callCount++;
      yield { choices: [toolChunk] };
      abortController.abort();
    }) as typeof client.ai;

    const historyUpdates: unknown[][] = [];

    for await (const history of client.sendMessage(
      "Test",
      abortController.signal,
    )) {
      historyUpdates.push([...history]);
    }

    expect(callCount).toBe(1);
    expect(mcpClient.callTool).toHaveBeenCalledTimes(1);
  });

  it("applies temperature and reasoning overrides", async () => {
    const client = new OpenAIClient("test-key", {
      model: "gpt-4",
      temperature: 0.5,
    });
    const mcpClient = createMockMcpClient();
    let createOptions: Record<string, unknown> = {};

    client.mcpClient = mcpClient;
    client.ai = createMockAiClient(async function* (options) {
      createOptions = options as Record<string, unknown>;
      yield { choices: [DONE_CHUNK] };
    }) as typeof client.ai;

    for await (const _history of client.sendMessage("Test", undefined, {
      temperature: 0.9,
    })) {
      // consume generator
    }

    expect(createOptions.temperature).toBe(0.9);
  });
});

describe("OpenAIClient with non-function tool calls", () => {
  it("skips non-function tool calls during execution", async () => {
    const client = new OpenAIClient("test-key", { model: "gpt-4" });
    const mcpClient = createMockMcpClient({
      tools: [{ name: "test-tool", description: "Test", inputSchema: {} }],
    });
    const toolChunk = createToolCallChunk("test-tool", "{}");

    client.mcpClient = mcpClient;
    client.ai = createMockAiClient(
      createToolThenDoneGenerator(toolChunk),
    ) as typeof client.ai;

    for await (const _history of client.sendMessage("Test")) {
      // consume generator
    }

    expect(mcpClient.callTool).toHaveBeenCalledTimes(1);
  });
});

describe("OpenAIClient error handling", () => {
  it("throws when listTools returns null in getFilteredTools", async () => {
    const client = new OpenAIClient("test-key", { model: "gpt-4" });
    // Create MCP client where listTools returns null
    const mcpClient = {
      connect: vi.fn(),
      listTools: vi.fn().mockResolvedValue(null),
      callTool: vi.fn(),
    } as unknown as ReturnType<typeof createMockMcpClient>;

    client.mcpClient = mcpClient;
    client.ai = createMockAiClient(async function* () {
      yield { choices: [DONE_CHUNK] };
    }) as typeof client.ai;

    await expect(async () => {
      for await (const _history of client.sendMessage("Test")) {
        // consume generator
      }
    }).rejects.toThrow("MCP client not initialized. Call initialize() first.");
  });

  it("throws when callTool returns null in executeSingleToolCall", async () => {
    const client = new OpenAIClient("test-key", { model: "gpt-4" });
    // Create MCP client where callTool returns null
    const mcpClient = {
      connect: vi.fn(),
      listTools: vi.fn().mockResolvedValue({
        tools: [{ name: "test-tool", description: "Test", inputSchema: {} }],
      }),
      callTool: vi.fn().mockResolvedValue(null),
    } as unknown as ReturnType<typeof createMockMcpClient>;

    client.mcpClient = mcpClient;
    client.ai = createMockAiClient(
      createToolThenDoneGenerator(createToolCallChunk("test-tool", "{}")),
    ) as typeof client.ai;

    // Should handle the error by adding error tool message
    const historyUpdates = await collectHistoryUpdates(
      client.sendMessage("Test"),
    );

    const finalHistory = historyUpdates.at(-1);
    const toolMessage = finalHistory?.find(
      (msg) => (msg as { role: string }).role === "tool",
    );

    expect(toolMessage).toBeDefined();
    const content = JSON.parse((toolMessage as { content: string }).content);

    expect(content.error).toBe(
      "MCP client not initialized. Call initialize() first.",
    );
    expect(content.isError).toBe(true);
  });
});

describe("OpenAIClient max iterations warning", () => {
  it("warns and stops when max iterations reached", async () => {
    const client = new OpenAIClient("test-key", { model: "gpt-4" });
    const mcpClient = createMockMcpClient({
      tools: [{ name: "loop-tool", description: "Tool", inputSchema: {} }],
    });
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    client.mcpClient = mcpClient;

    let callCount = 0;

    client.ai = {
      chat: {
        completions: {
          // Always return tool calls to trigger max iterations
          create: vi.fn().mockImplementation(async function* () {
            callCount++;
            yield {
              choices: [
                {
                  delta: {
                    tool_calls: [
                      {
                        index: 0,
                        id: `call_${callCount}`,
                        function: { name: "loop-tool", arguments: "{}" },
                      },
                    ],
                  },
                  finish_reason: "tool_calls",
                },
              ],
            };
          }),
        },
      },
    } as unknown as typeof client.ai;

    const historyUpdates = await collectHistoryUpdates(
      client.sendMessage("Loop forever"),
    );

    // Should stop after 10 iterations
    expect(callCount).toBe(10);
    expect(warnSpy).toHaveBeenCalledWith(
      "OpenAI tool calling loop reached max iterations:",
      10,
    );

    warnSpy.mockRestore();

    // Should have history updates
    expect(historyUpdates.length).toBeGreaterThan(0);
  });

  it("stops loop when abort signal is triggered after tool execution", async () => {
    const client = new OpenAIClient("test-key", { model: "gpt-4" });
    const mcpClient = createMockMcpClient({
      tools: [{ name: "test-tool", description: "Test", inputSchema: {} }],
    });
    const abortController = new AbortController();
    let callCount = 0;

    client.mcpClient = mcpClient;
    client.ai = {
      chat: {
        completions: {
          create: vi.fn().mockImplementation(async function* () {
            callCount++;
            yield {
              choices: [
                {
                  delta: {
                    tool_calls: [
                      {
                        index: 0,
                        id: `call_${callCount}`,
                        function: { name: "test-tool", arguments: "{}" },
                      },
                    ],
                  },
                  finish_reason: "tool_calls",
                },
              ],
            };
          }),
        },
      },
    } as unknown as typeof client.ai;

    // Abort after the first tool call is executed (in callTool mock)
    vi.mocked(mcpClient.callTool).mockImplementation(async () => {
      abortController.abort();

      return { content: [{ type: "text", text: "result" }] };
    });

    const historyUpdates: unknown[][] = [];

    for await (const history of client.sendMessage(
      "Test",
      abortController.signal,
    )) {
      historyUpdates.push([...history]);
    }

    // Should stop after first tool call due to abort
    expect(callCount).toBe(1);
    expect(mcpClient.callTool).toHaveBeenCalledTimes(1);
  });
});
