/**
 * MCP tool integration helpers for voice chat
 */

import type { LiveServerToolCall, Session } from "@google/genai";
import type { Client } from "@modelcontextprotocol/sdk/client/index.js";

const MCP_ERROR_MESSAGE = "Error closing MCP client:";

/**
 * Handles tool calls from the Live API by executing them via MCP client
 * @param toolCall - Tool call from Gemini Live API
 * @param mcpClient - MCP client instance
 * @param session - Gemini Live session
 * @returns {Promise<void>} Promise that resolves when tool call is handled
 */
export async function handleToolCall(
  toolCall: LiveServerToolCall,
  mcpClient: Client | null,
  session: Session | null,
): Promise<void> {
  if (!toolCall.functionCalls || !mcpClient) {
    console.log("No function calls or MCP client not initialized");
    return;
  }

  const toolResponses = [];

  for (const functionCall of toolCall.functionCalls) {
    if (!functionCall.name || !functionCall.id) {
      console.log("Invalid function call: missing name or id");
      continue;
    }

    try {
      console.log(
        `Executing tool: ${functionCall.name} with args:`,
        functionCall.args,
      );
      const result = await mcpClient.callTool({
        name: functionCall.name,
        arguments: functionCall.args ?? {},
      });

      console.log(`Tool result:`, result);

      toolResponses.push({
        functionResponses: [
          {
            name: functionCall.name,
            response: result.isError ? { error: result } : result,
            id: functionCall.id,
          },
        ],
      });
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      console.error(`Tool execution error: ${errMsg}`);

      toolResponses.push({
        functionResponses: [
          {
            name: functionCall.name,
            response: {
              error: errMsg,
            },
            id: functionCall.id,
          },
        ],
      });
    }
  }

  // Send tool responses back to the session
  for (const response of toolResponses) {
    try {
      session?.sendToolResponse(response);
      console.log(`Sent tool response:`, response);
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      console.error(`Error sending tool response: ${errMsg}`);
    }
  }
}

/**
 * Closes the MCP client connection
 * @param mcpClient - MCP client to close
 * @returns {Promise<void>} Promise that resolves when client is closed
 */
export async function closeMcpClient(mcpClient: Client | null): Promise<void> {
  if (mcpClient) {
    try {
      await mcpClient.close();
    } catch (err) {
      console.error(MCP_ERROR_MESSAGE, err);
    }
  }
}
