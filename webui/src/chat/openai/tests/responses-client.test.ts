import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  ResponsesClient,
  type ResponsesClientConfig,
  type ResponsesMessageOverrides,
} from "#webui/chat/openai/responses-client";

// Mock MCP SDK
const mockListTools = vi.fn().mockResolvedValue({
  tools: [
    {
      name: "test_tool",
      description: "A test tool",
      inputSchema: { type: "object" },
    },
  ],
});
const mockCallTool = vi
  .fn()
  .mockResolvedValue({ content: { result: "tool_result" } });

// @ts-expect-error vi.mock partial implementation
vi.mock(import("@modelcontextprotocol/sdk/client/index.js"), () => ({
  Client: class MockClient {
    connect = vi.fn();
    close = vi.fn();
    listTools = mockListTools;
    callTool = mockCallTool;
  },
}));

vi.mock(import("@modelcontextprotocol/sdk/client/streamableHttp.js"), () => ({
  StreamableHTTPClientTransport: vi.fn(),
}));

// Helper to create an async iterable from events
function createMockStream(
  events: Array<{ type: string; [key: string]: unknown }>,
) {
  return {
    async *[Symbol.asyncIterator]() {
      for (const event of events) {
        yield event;
      }
    },
  };
}

// Helper to setup mock and send a message, returning the mockCreate for assertions
async function setupMockAndSendMessage(
  client: ResponsesClient,
  message = "Test",
  options?: ResponsesMessageOverrides,
) {
  const mockCreate = vi
    .fn()
    .mockResolvedValue(
      createMockStream([
        { type: "response.completed", response: { output: [] } },
      ]),
    );

  client.ai.responses.create = mockCreate;

  const generator = client.sendMessage(message, undefined, options);

  for await (const _ of generator) {
    // pass
  }

  return mockCreate;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("ResponsesClient constructor", () => {
  it("initializes with default conversation when not provided", () => {
    const client = new ResponsesClient("test-key", {
      model: "gpt-5.2",
    });

    expect(client.conversation).toStrictEqual([]);
    expect(client.chatHistory).toStrictEqual([]);
  });

  it("uses provided conversation", () => {
    const conversation = [
      { type: "message" as const, role: "user" as const, content: "Hello" },
    ];
    const client = new ResponsesClient("test-key", {
      model: "gpt-5.2",
      conversation,
    });

    expect(client.conversation).toStrictEqual(conversation);
  });

  it("stores config correctly", () => {
    const config: ResponsesClientConfig = {
      model: "gpt-5.2",
      temperature: 0.7,
      reasoningEffort: "high",
    };
    const client = new ResponsesClient("test-key", config);

    expect(client.config.model).toBe("gpt-5.2");
    expect(client.config.temperature).toBe(0.7);
    expect(client.config.reasoningEffort).toBe("high");
  });

  it("uses default mcpUrl when not provided", () => {
    const client = new ResponsesClient("test-key", { model: "gpt-5.2" });

    // mcpUrl should be set from getMcpUrl()
    expect(client.mcpUrl).toBeDefined();
  });

  it("uses provided mcpUrl", () => {
    const client = new ResponsesClient("test-key", {
      model: "gpt-5.2",
      mcpUrl: "http://custom:8080",
    });

    expect(client.mcpUrl).toBe("http://custom:8080");
  });
});

describe("ResponsesClient chatHistory alias", () => {
  it("returns conversation as chatHistory", () => {
    const conversation = [
      { type: "message" as const, role: "user" as const, content: "Hello" },
    ];
    const client = new ResponsesClient("test-key", {
      model: "gpt-5.2",
      conversation,
    });

    expect(client.chatHistory).toBe(client.conversation);
  });
});

describe("ResponsesClient initialize", () => {
  it("connects to MCP server", async () => {
    const client = new ResponsesClient("test-key", { model: "gpt-5.2" });

    await client.initialize();

    expect(client.mcpClient).toBeDefined();
  });
});

describe("ResponsesClient sendMessage", () => {
  it("throws if not initialized", async () => {
    const client = new ResponsesClient("test-key", { model: "gpt-5.2" });

    const generator = client.sendMessage("Hello");

    await expect(generator.next()).rejects.toThrow(
      "MCP client not initialized",
    );
  });

  it("adds user message to conversation", async () => {
    const client = new ResponsesClient("test-key", { model: "gpt-5.2" });

    await client.initialize();

    // Mock the OpenAI responses.create to throw immediately
    // (we just want to test that the user message is added)
    client.ai.responses.create = vi.fn().mockRejectedValue(new Error("test"));

    const generator = client.sendMessage("Hello");

    // First yield adds user message
    const { value: firstYield } = await generator.next();

    expect(firstYield).toHaveLength(1);
    expect(firstYield![0]).toMatchObject({
      type: "message",
      role: "user",
      content: "Hello",
    });
  });

  it("streams conversation with text response", async () => {
    const client = new ResponsesClient("test-key", {
      model: "gpt-5.2",
      temperature: 0.5,
    });

    await client.initialize();

    // Mock stream with simple text response
    client.ai.responses.create = vi.fn().mockResolvedValue(
      createMockStream([
        { type: "response.output_text.delta", delta: { text: "Hello" } },
        { type: "response.output_text.delta", delta: { text: " world" } },
        { type: "response.completed", response: { output: [] } },
      ]),
    );

    const generator = client.sendMessage("Test");
    const results = [];

    for await (const conv of generator) {
      results.push([...conv]);
    }

    // Should have multiple yields
    expect(results.length).toBeGreaterThan(1);
    // First yield is the user message
    expect(results[0]![0]).toMatchObject({
      type: "message",
      role: "user",
      content: "Test",
    });
  });

  it("applies per-message temperature override", async () => {
    const client = new ResponsesClient("test-key", {
      model: "gpt-5.2",
      temperature: 0.5,
    });

    await client.initialize();

    const mockCreate = await setupMockAndSendMessage(client, "Test", {
      temperature: 0.9,
    });

    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        temperature: 0.9,
      }),
    );
  });

  it("applies per-message reasoning effort override", async () => {
    const client = new ResponsesClient("test-key", {
      model: "gpt-5.2",
      reasoningEffort: "low",
    });

    await client.initialize();

    const mockCreate = await setupMockAndSendMessage(client, "Test", {
      reasoningEffort: "high",
    });

    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        reasoning: expect.objectContaining({ effort: "high" }),
      }),
    );
  });

  it("includes system instruction in request", async () => {
    const client = new ResponsesClient("test-key", {
      model: "gpt-5.2",
      systemInstruction: "You are a helpful assistant",
    });

    await client.initialize();

    const mockCreate = await setupMockAndSendMessage(client);

    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        instructions: "You are a helpful assistant",
      }),
    );
  });

  it("filters tools based on enabledTools config", async () => {
    const client = new ResponsesClient("test-key", {
      model: "gpt-5.2",
      enabledTools: { test_tool: false },
    });

    await client.initialize();

    const mockCreate = await setupMockAndSendMessage(client);

    // Tools should be empty since test_tool was disabled
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        tools: [],
      }),
    );
  });

  it("respects abort signal", async () => {
    const client = new ResponsesClient("test-key", { model: "gpt-5.2" });

    await client.initialize();

    const abortController = new AbortController();

    // Create a stream that yields events slowly
    let eventCount = 0;

    client.ai.responses.create = vi.fn().mockResolvedValue({
      async *[Symbol.asyncIterator]() {
        while (eventCount < 10) {
          eventCount++;
          yield { type: "response.output_text.delta", delta: { text: "a" } };
        }

        yield { type: "response.completed", response: { output: [] } };
      },
    });

    const generator = client.sendMessage("Test", abortController.signal);

    // Get first yield (user message)
    await generator.next();
    // Get second yield (first streaming update)
    await generator.next();

    // Abort after first event
    abortController.abort();

    // Continue consuming - should stop early
    let yieldsAfterAbort = 0;

    for await (const _ of generator) {
      yieldsAfterAbort++;
    }

    // Should have stopped early due to abort
    expect(yieldsAfterAbort).toBeLessThan(10);
  });

  it("throws when listTools returns null", async () => {
    const client = new ResponsesClient("test-key", { model: "gpt-5.2" });

    await client.initialize();

    // Make listTools return null
    mockListTools.mockResolvedValueOnce(null);

    const generator = client.sendMessage("Test");

    // First yield is user message
    await generator.next();

    // Second call should throw
    await expect(generator.next()).rejects.toThrow(
      "MCP client not initialized",
    );
  });

  it("executes tool call and continues loop", async () => {
    const client = new ResponsesClient("test-key", {
      model: "gpt-5.2",
      enabledTools: { test_tool: true },
    });

    await client.initialize();

    // First call returns a tool call, second returns text
    let callCount = 0;

    client.ai.responses.create = vi.fn().mockImplementation(() => {
      callCount++;

      if (callCount === 1) {
        return createMockStream([
          {
            type: "response.output_item.added",
            item: {
              id: "item_1",
              type: "function_call",
              name: "test_tool",
              call_id: "call_1",
            },
          },
          {
            type: "response.function_call_arguments.done",
            item_id: "item_1",
            arguments: '{"arg":"value"}',
          },
          {
            type: "response.completed",
            response: {
              output: [
                {
                  type: "function_call",
                  id: "fc_1",
                  call_id: "call_1",
                  name: "test_tool",
                  arguments: '{"arg":"value"}',
                },
              ],
            },
          },
        ]);
      }

      return createMockStream([
        { type: "response.output_text.delta", delta: { text: "Done!" } },
        {
          type: "response.completed",
          response: {
            output: [{ type: "message", role: "assistant", content: "Done!" }],
          },
        },
      ]);
    });

    const generator = client.sendMessage("Test");
    const results = [];

    for await (const conv of generator) {
      results.push([...conv]);
    }

    // Tool should have been called
    expect(mockCallTool).toHaveBeenCalledWith({
      name: "test_tool",
      arguments: { arg: "value" },
    });

    // API was called twice (once for tool, once for follow-up)
    expect(callCount).toBe(2);
  });
});
