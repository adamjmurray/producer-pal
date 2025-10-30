import { GoogleGenAI, mcpToTool } from "@google/genai/web";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

export class GeminiChat {
  constructor(apiKey, config = {}) {
    this.ai = new GoogleGenAI({ apiKey });
    this.mcpUrl = config.mcpUrl || "http://localhost:3350/mcp";
    this.config = config;
    this.chat = null;
    this.mcpClient = null;
    this.chatHistory = config.chatHistory || [];
  }

  static async testConnection(mcpUrl = "http://localhost:3350/mcp") {
    const transport = new StreamableHTTPClientTransport(mcpUrl);
    const client = new Client({
      name: "producer-pal-chat-ui-test",
      version: "1.0.0",
    });
    await client.connect(transport);
    await client.close();
  }

  async initialize() {
    // Connect to MCP server
    const transport = new StreamableHTTPClientTransport(this.mcpUrl);
    this.mcpClient = new Client({
      name: "producer-pal-chat-ui",
      version: "1.0.0",
    });
    await this.mcpClient.connect(transport);

    // Create chat with MCP tools
    const chatConfig = {
      tools: [mcpToTool(this.mcpClient)],
      automaticFunctionCalling: {
        // Gemini will automatically execute MCP tools
      },
      ...this.config,
    };

    this.chat = this.ai.chats.create({
      model: this.config.model || "gemini-2.5-flash-lite",
      config: chatConfig,
      history: this.chatHistory,
    });
  }

  async *sendMessage(message) {
    if (!this.chat) {
      throw new Error("Chat not initialized. Call initialize() first.");
    }

    let currentTurn = {
      role: "user",
      parts: [{ text: message }],
    };

    this.chatHistory.push(currentTurn);

    yield this.chatHistory;

    const stream = await this.chat.sendMessageStream({ message });

    for await (const chunk of stream) {
      // console.log("chunk:", JSON.stringify(chunk, null, 2));
      const response = chunk.candidates?.[0] ?? {};
      const { role, parts = [] } = response.content;

      for (const part of parts) {
        if (currentTurn?.role !== role) {
          currentTurn = { role, parts: [] };
          this.chatHistory.push(currentTurn);
        }

        // Merge text chunks: if current part is text and last part is also text with same thought flag,
        // append to existing text instead of creating a new part
        const lastPart = currentTurn.parts.at(-1);
        if (
          // if consecutive parts are text, we potentially can concatenate
          part.text &&
          lastPart?.text &&
          // if we switch between thoughts and normal text, don't concatenate:
          !!part.thought === !!lastPart.thought &&
          // if anything has a thoughtSignature, don't concatenate (https://ai.google.dev/gemini-api/docs/thinking#signatures):
          !lastPart.thoughtSignature &&
          !part.thoughtSignature
        ) {
          lastPart.text += part.text;
        } else {
          currentTurn.parts.push(part);
        }

        yield this.chatHistory;
      }
    }
  }
}
