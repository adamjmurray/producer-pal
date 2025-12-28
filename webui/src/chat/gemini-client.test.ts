import type { Chat } from "@google/genai/web";
import type { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { describe, expect, it, vi } from "vitest";
import { GeminiClient } from "./gemini-client";

// Mock the Google GenAI SDK
// @ts-expect-error vi.mock partial implementation
vi.mock(import("@google/genai/web"), () => ({
  GoogleGenAI: class MockGoogleGenAI {
    chats = {
      create: vi.fn(),
    };
  },
  FunctionCallingConfigMode: {
    VALIDATED: "VALIDATED",
  },
}));

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

describe("GeminiClient", () => {
  it("constructs with default config", () => {
    const client = new GeminiClient("test-api-key");

    expect(client).toBeDefined();
    expect(client.mcpUrl).toBe("http://localhost:3350/mcp");
    expect(client.chatHistory).toEqual([]);
  });

  it("constructs with custom config", () => {
    const config = {
      mcpUrl: "http://custom:8080/mcp",
      model: "gemini-pro",
      temperature: 0.7,
      chatHistory: [{ role: "user" as const, parts: [{ text: "hello" }] }],
    };
    const client = new GeminiClient("test-api-key", config);

    expect(client.mcpUrl).toBe("http://custom:8080/mcp");
    expect(client.chatHistory).toEqual(config.chatHistory);
  });

  it("throws error when sending message before initialization", async () => {
    const client = new GeminiClient("test-api-key");

    await expect(async () => {
      const stream = client.sendMessage("test");

      await stream.next();
    }).rejects.toThrow("Chat not initialized. Call initialize() first.");
  });

  describe("multi-step tool execution", () => {
    it("continues loop after first tool execution", async () => {
      const client = new GeminiClient("test-api-key");

      // Mock the MCP client
      const mockMcpClient = {
        connect: vi.fn(),
        listTools: vi.fn().mockResolvedValue({
          tools: [
            {
              name: "test-tool",
              description: "Test tool",
              inputSchema: {},
            },
          ],
        }),
        callTool: vi.fn().mockResolvedValue({ result: "tool result" }),
      };

      // Mock the chat
      let callCount = 0;
      const mockChat = {
        sendMessageStream: vi.fn().mockImplementation(async function* () {
          callCount++;

          if (callCount === 1) {
            // First call: model responds with functionCall
            yield {
              candidates: [
                {
                  content: {
                    role: "model",
                    parts: [
                      {
                        functionCall: {
                          name: "test-tool",
                          args: { input: "test" },
                        },
                      },
                    ],
                  },
                },
              ],
            };
          } else {
            // Second call: model responds with text (after tool execution)
            yield {
              candidates: [
                {
                  content: {
                    role: "model",
                    parts: [{ text: "Final response" }],
                  },
                },
              ],
            };
          }
        }),
      };

      // Mock AI with chats.create that returns our mockChat
      client.ai = {
        chats: {
          create: vi.fn().mockReturnValue(mockChat),
        },
      } as unknown as typeof client.ai;

      // Set up mocks
      client.mcpClient = mockMcpClient as unknown as Client;
      client.chat = mockChat as unknown as Chat;
      client.chatConfig = {};

      // Send message and collect history updates
      const historyUpdates = [];

      for await (const history of client.sendMessage("test")) {
        historyUpdates.push(history);
      }

      // Verify the flow
      expect(mockChat.sendMessageStream).toHaveBeenCalledTimes(2);
      expect(mockMcpClient.callTool).toHaveBeenCalledTimes(1);
      expect(mockMcpClient.callTool).toHaveBeenCalledWith({
        name: "test-tool",
        arguments: { input: "test" },
      });

      // Verify final history structure
      const finalHistory = historyUpdates[historyUpdates.length - 1];

      expect(finalHistory).toBeDefined();
      expect(finalHistory).toHaveLength(4);
      expect(finalHistory![0]!.role).toBe("user"); // Initial message
      expect(finalHistory![1]!.role).toBe("model"); // functionCall
      expect(finalHistory![2]!.role).toBe("user"); // functionResponse
      expect(finalHistory![3]!.role).toBe("model"); // Final text response
    });

    it("handles multiple consecutive tool calls", async () => {
      const client = new GeminiClient("test-api-key");

      // Mock the MCP client
      const mockMcpClient = {
        connect: vi.fn(),
        listTools: vi.fn().mockResolvedValue({
          tools: [
            {
              name: "tool1",
              description: "Tool 1",
              inputSchema: {},
            },
            {
              name: "tool2",
              description: "Tool 2",
              inputSchema: {},
            },
          ],
        }),
        callTool: vi
          .fn()
          .mockResolvedValueOnce({ result: "result1" })
          .mockResolvedValueOnce({ result: "result2" }),
      };

      // Mock the chat
      let callCount = 0;
      const mockChat = {
        sendMessageStream: vi.fn().mockImplementation(async function* () {
          callCount++;

          if (callCount === 1) {
            // First: model calls tool1
            yield {
              candidates: [
                {
                  content: {
                    role: "model",
                    parts: [{ functionCall: { name: "tool1", args: {} } }],
                  },
                },
              ],
            };
          } else if (callCount === 2) {
            // Second: model calls tool2
            yield {
              candidates: [
                {
                  content: {
                    role: "model",
                    parts: [{ functionCall: { name: "tool2", args: {} } }],
                  },
                },
              ],
            };
          } else {
            // Third: model responds with text
            yield {
              candidates: [
                {
                  content: {
                    role: "model",
                    parts: [{ text: "Done" }],
                  },
                },
              ],
            };
          }
        }),
      };

      // Mock AI with chats.create that returns our mockChat
      client.ai = {
        chats: {
          create: vi.fn().mockReturnValue(mockChat),
        },
      } as unknown as typeof client.ai;

      // Set up mocks
      client.mcpClient = mockMcpClient as unknown as Client;
      client.chat = mockChat as unknown as Chat;
      client.chatConfig = {};

      // Send message
      const historyUpdates = [];

      for await (const history of client.sendMessage("test")) {
        historyUpdates.push(history);
      }

      // Verify three iterations
      expect(mockChat.sendMessageStream).toHaveBeenCalledTimes(3);
      expect(mockMcpClient.callTool).toHaveBeenCalledTimes(2);

      // Verify final history
      const finalHistory = historyUpdates[historyUpdates.length - 1];

      expect(finalHistory).toBeDefined();
      expect(finalHistory).toHaveLength(6);
      expect(finalHistory![0]!.role).toBe("user"); // Initial
      expect(finalHistory![1]!.role).toBe("model"); // tool1 call
      expect(finalHistory![2]!.role).toBe("user"); // tool1 response
      expect(finalHistory![3]!.role).toBe("model"); // tool2 call
      expect(finalHistory![4]!.role).toBe("user"); // tool2 response
      expect(finalHistory![5]!.role).toBe("model"); // Final text
    });

    it("stops loop when model stops calling tools", async () => {
      const client = new GeminiClient("test-api-key");

      // Mock the MCP client
      const mockMcpClient = {
        connect: vi.fn(),
        listTools: vi.fn().mockResolvedValue({ tools: [] }),
        callTool: vi.fn(),
      };

      // Mock the chat - responds with text only (no tool calls)
      const mockChat = {
        sendMessageStream: vi.fn().mockImplementation(async function* () {
          yield {
            candidates: [
              {
                content: {
                  role: "model",
                  parts: [{ text: "Direct response" }],
                },
              },
            ],
          };
        }),
      };

      // Set up mocks
      client.mcpClient = mockMcpClient as unknown as Client;
      client.chat = mockChat as unknown as Chat;
      client.chatConfig = {};

      // Send message
      const historyUpdates = [];

      for await (const history of client.sendMessage("test")) {
        historyUpdates.push(history);
      }

      // Should only call once (no loop continuation)
      expect(mockChat.sendMessageStream).toHaveBeenCalledTimes(1);
      expect(mockMcpClient.callTool).not.toHaveBeenCalled();

      // Verify final history
      const finalHistory = historyUpdates[historyUpdates.length - 1];

      expect(finalHistory).toBeDefined();
      expect(finalHistory).toHaveLength(2);
      expect(finalHistory![0]!.role).toBe("user");
      expect(finalHistory![1]!.role).toBe("model");
    });

    it("applies showThoughts override to chat config", async () => {
      const client = new GeminiClient("test-api-key", {
        thinkingConfig: { thinkingBudget: 4096, includeThoughts: true },
      });

      // Mock the MCP client
      const mockMcpClient = {
        connect: vi.fn(),
        listTools: vi.fn().mockResolvedValue({ tools: [] }),
        callTool: vi.fn(),
      };

      // Track what config is passed to chats.create
      const createCalls: unknown[] = [];
      const mockChat = {
        sendMessageStream: vi.fn().mockImplementation(async function* () {
          yield {
            candidates: [
              {
                content: {
                  role: "model",
                  parts: [{ text: "Response" }],
                },
              },
            ],
          };
        }),
      };

      client.ai = {
        chats: {
          create: vi.fn((config) => {
            createCalls.push(config);

            return mockChat;
          }),
        },
      } as unknown as typeof client.ai;

      // Set up mocks
      client.mcpClient = mockMcpClient as unknown as Client;
      client.chat = mockChat as unknown as Chat;
      client.chatConfig = {
        thinkingConfig: { thinkingBudget: 4096, includeThoughts: true },
      };

      // Send message with showThoughts override
      const historyUpdates = [];

      for await (const history of client.sendMessage("test", undefined, {
        showThoughts: false,
      })) {
        historyUpdates.push(history);
      }

      // Verify chats.create was called with updated thinkingConfig
      expect(createCalls.length).toBeGreaterThanOrEqual(1);
      const lastCreateCall = createCalls[createCalls.length - 1] as {
        config: { thinkingConfig: { includeThoughts: boolean } };
      };

      expect(lastCreateCall.config.thinkingConfig.includeThoughts).toBe(false);
    });

    it("stops loop when abort signal is triggered", async () => {
      const client = new GeminiClient("test-api-key");

      // Mock the MCP client
      const mockMcpClient = {
        connect: vi.fn(),
        listTools: vi.fn().mockResolvedValue({
          tools: [{ name: "test-tool", description: "Test", inputSchema: {} }],
        }),
        callTool: vi.fn().mockResolvedValue({ result: "result" }),
      };

      // Create abort controller
      const abortController = new AbortController();

      // Mock the chat
      let callCount = 0;
      const mockChat = {
        sendMessageStream: vi.fn().mockImplementation(async function* () {
          callCount++;

          if (callCount === 1) {
            // First call: return functionCall
            yield {
              candidates: [
                {
                  content: {
                    role: "model",
                    parts: [{ functionCall: { name: "test-tool", args: {} } }],
                  },
                },
              ],
            };
            // Abort after first tool call
            abortController.abort();
          }
        }),
      };

      // Set up mocks
      client.mcpClient = mockMcpClient as unknown as Client;
      client.chat = mockChat as unknown as Chat;
      client.chatConfig = {};

      // Send message with abort signal
      const historyUpdates = [];

      for await (const history of client.sendMessage(
        "test",
        abortController.signal,
      )) {
        historyUpdates.push(history);
      }

      // Should only call once (aborted before second iteration)
      expect(mockChat.sendMessageStream).toHaveBeenCalledTimes(1);
      expect(mockMcpClient.callTool).toHaveBeenCalledTimes(1);

      // Verify history stops after tool response
      const finalHistory = historyUpdates[historyUpdates.length - 1];

      expect(finalHistory).toBeDefined();
      expect(finalHistory).toHaveLength(3);
      expect(finalHistory![0]!.role).toBe("user");
      expect(finalHistory![1]!.role).toBe("model");
      expect(finalHistory![2]!.role).toBe("user"); // functionResponse
      // No fourth message because loop was aborted
    });
  });
});
