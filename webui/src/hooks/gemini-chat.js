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
    this.history = config.initialHistory || [];
    this.currentTurn = null; // Buffer for accumulating streaming parts
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
      history: this.history,
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

    this.history.push({
      role: "user",
      parts: [{ text: message }],
    });

    // console.log(
    //   "currentTurn:",
    //   this.history.length, // turn index
    //   JSON.stringify(this.currentTurn, null, 2),
    // );

    const stream = await this.chat.sendMessageStream({ message });

    for await (const chunk of stream) {
      // console.log("chunk:", JSON.stringify(chunk, null, 2));
      const response = chunk.candidates?.[0] ?? {};
      const { role, parts = [] } = response.content;
      const finishReason = response.finishReason;

      for (const part of parts) {
        // if we switch roles, change turns
        // (this generally only happens for function calls and responses, but that's already handled below anyway)
        if (this.currentTurn && this.currentTurn.role !== role) {
          this.history.push(this.currentTurn);
          this.currentTurn = null;
        }

        // If we have parts but no currentTurn (after a finishReason),
        // start a new turn to handle e.g. automatic function calling
        if (!this.currentTurn) {
          this.currentTurn = { role, parts: [] };
        }

        // Merge text chunks: if current part is text and last part is also text with same thought flag,
        // append to existing text instead of creating a new part
        const lastPart =
          this.currentTurn.parts[this.currentTurn.parts.length - 1];
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
          this.currentTurn.parts.push(part);
        }

        // console.log(
        //   "currentTurn:",
        //   this.history.length, // turn index
        //   JSON.stringify(this.currentTurn, null, 2),
        // );

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

      // When a turn completes with finishReason, finalize it.
      // Function responses don't have a finishReason, but always happen in a single stream chunk,
      // (at least in Producer Pal's current implementation), so we can finalize them immediately.
      if (
        this.currentTurn &&
        (finishReason || this.currentTurn.parts?.[0]?.functionResponse)
      ) {
        this.history.push(this.currentTurn);
        this.currentTurn = null;
        // console.log("added to history", JSON.stringify(this.history, null, 2));
      }
    }
  }

  /**
   * Returns the full conversation history in Gemini's native Content[] format.
   * @returns {Array} Array of Content objects with role and parts
   */
  getHistory() {
    return this.history;
  }

  /**
   * Returns conversation history up to (and including) the specified turn index.
   * Useful for implementing retry/fork from a specific point.
   * @param {number} turnIndex - Zero-based index of the last turn to include
   * @returns {Array} Partial history as Content[] array
   */
  getHistoryUpTo(turnIndex) {
    if (turnIndex < 0 || turnIndex >= this.history.length) {
      throw new Error(
        `Invalid turnIndex ${turnIndex}. History has ${this.history.length} turns.`,
      );
    }
    return this.history.slice(0, turnIndex + 1);
  }
}
