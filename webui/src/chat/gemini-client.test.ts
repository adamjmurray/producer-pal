import { describe, expect, it, vi } from "vitest";
import { GeminiClient } from "./gemini-client.js";

// Mock the Google GenAI SDK
vi.mock("@google/genai/web", () => ({
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
vi.mock("@modelcontextprotocol/sdk/client/index.js", () => ({
  Client: class MockClient {
    connect = vi.fn();
    close = vi.fn();
    listTools = vi.fn();
    callTool = vi.fn();
  },
}));

vi.mock("@modelcontextprotocol/sdk/client/streamableHttp.js", () => ({
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
});
