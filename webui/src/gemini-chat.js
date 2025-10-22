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
    });
  }

  async sendMessage(message) {
    if (!this.chat) {
      throw new Error("Chat not initialized. Call initialize() first.");
    }

    const response = await this.chat.sendMessage({ message });

    // Extract tool calls from automatic function calling history
    const toolCalls = [];
    const { automaticFunctionCallingHistory } = response;

    if (automaticFunctionCallingHistory) {
      let pastInput = false;
      for (const item of automaticFunctionCallingHistory) {
        // Skip history before current message
        if (
          !pastInput &&
          item.role === "user" &&
          item.parts?.[0]?.text === message
        ) {
          pastInput = true;
          continue;
        }
        if (!pastInput) continue;

        for (const part of item.parts || []) {
          if (part.functionCall) {
            toolCalls.push({
              name: part.functionCall.name,
              args: part.functionCall.args,
              result: null,
            });
          } else if (part.functionResponse) {
            const lastCall = toolCalls[toolCalls.length - 1];
            if (lastCall) {
              lastCall.result =
                part.functionResponse?.response?.content?.[0]?.text;
            }
          }
        }
      }
    }

    // Extract text response
    const textParts = response.candidates?.[0]?.content?.parts || [];
    const textResponse = textParts
      .filter((p) => p.text && !p.thought)
      .map((p) => p.text)
      .join("\n");

    const thoughts = textParts
      .filter((p) => p.text && p.thought)
      .map((p) => p.text)
      .join("\n");

    return {
      text: textResponse,
      thoughts,
      toolCalls,
      raw: response,
    };
  }

  async *sendMessageStream(message) {
    if (!this.chat) {
      throw new Error("Chat not initialized. Call initialize() first.");
    }

    const stream = await this.chat.sendMessageStream({ message });

    for await (const chunk of stream) {
      const parts = chunk.candidates?.[0]?.content?.parts || [];

      for (const part of parts) {
        if (part.text) {
          yield {
            type: part.thought ? "thought" : "text",
            content: part.text,
          };
        } else if (part.functionCall) {
          yield {
            type: "toolCall",
            name: part.functionCall.name,
            args: part.functionCall.args,
          };
        } else if (part.functionResponse) {
          yield {
            type: "toolResult",
            result: part.functionResponse?.response?.content?.[0]?.text,
          };
        }
      }
    }
  }
}
