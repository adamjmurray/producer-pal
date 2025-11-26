import type { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { tool, type RealtimeItem } from "@openai/agents/realtime";
import OpenAI from "openai";
import { SYSTEM_INSTRUCTION } from "#webui/lib/config";
import {
  callResponsesApi,
  callResponsesApiStreaming,
} from "./supervisor-api-helpers";

interface SupervisorActivityPart {
  type: "thought" | "tool" | "text";
  content?: string;
  name?: string;
  args?: Record<string, unknown>;
  result?: string | null;
  isError?: boolean;
}

interface SupervisorResponse {
  finalText: string;
  activity: SupervisorActivityPart[];
}

const SUPERVISOR_INSTRUCTIONS = `You are Producer Pal's supervisor agent, providing guidance to a voice assistant that helps users compose music in Ableton Live.

# Your Role
- The voice agent handles basic conversation and music questions directly
- You handle all actions requiring Ableton Live tools
- Your responses will be read aloud, so keep them concise and conversational

# Instructions
- Use the available tools to interact with Ableton Live
- Keep responses brief - this is a voice conversation
- Use natural, conversational language (no bullet points or markdown)
- If you need more information to call a tool, ask the user for it
- If a tool fails, explain the error simply

# Available Capabilities
You can:
- Connect to Ableton Live
- Read and modify the Live Set, tracks, scenes, and clips
- Create and edit MIDI clips with notes
- Control playback (play, stop, record)
- Delete and duplicate objects

# Response Format
Respond with natural speech. Your response will be read verbatim to the user.
Keep it brief and helpful.

${SYSTEM_INSTRUCTION}
`;

interface SupervisorContext {
  apiKey: string;
  model: string;
  mcpClient: Client;
  history: RealtimeItem[];
  onSupervisorActivity?: (activities: SupervisorActivityPart[]) => void;
  onSupervisorTextDelta?: (delta: string, snapshot: string) => void;
}

/* istanbul ignore next -- @preserve integration function requiring live MCP connection */
/**
 * Converts MCP tools to OpenAI function format for the Responses API
 * @param {Client} mcpClient - The connected MCP client
 * @returns {Promise<OpenAI.Responses.Tool[]>} OpenAI-formatted tools
 */
async function getMcpToolsAsOpenAIFormat(
  mcpClient: Client,
): Promise<OpenAI.Responses.Tool[]> {
  const toolsResult = await mcpClient.listTools();
  return toolsResult.tools.map((mcpTool) => ({
    type: "function" as const,
    name: mcpTool.name,
    description: mcpTool.description ?? "",
    parameters: mcpTool.inputSchema as Record<string, unknown>,
    strict: false,
  }));
}

/* istanbul ignore next -- @preserve integration function */
/**
 * Executes MCP tools and returns final text response
 * @param {OpenAI} openai - OpenAI client
 * @param {Client} mcpClient - MCP client for tool execution
 * @param {string} model - Model ID
 * @param {OpenAI.Responses.ResponseCreateParams["input"]} input - Request input
 * @param {OpenAI.Responses.Tool[]} tools - Available tools
 * @param {OpenAI.Responses.Response} initialResponse - Initial API response
 * @param {Function} onActivity - Activity callback
 * @param {Function} onTextDelta - Text delta callback
 * @param {number} maxIterations - Maximum tool call iterations
 * @returns {Promise<SupervisorResponse>} Final text and activities
 */
async function handleToolCallLoop(
  openai: OpenAI,
  mcpClient: Client,
  model: string,
  input: OpenAI.Responses.ResponseCreateParams["input"],
  tools: OpenAI.Responses.Tool[],
  initialResponse: OpenAI.Responses.Response,
  onActivity?: (activity: SupervisorActivityPart) => void,
  onTextDelta?: (delta: string, snapshot: string) => void,
  maxIterations = 10,
): Promise<SupervisorResponse> {
  let currentResponse = initialResponse;
  let iteration = 0;
  const activities: SupervisorActivityPart[] = [];

  while (iteration < maxIterations) {
    iteration++;

    const outputItems = currentResponse.output;

    // Find function calls in output
    const functionCalls = outputItems.filter(
      (item): item is OpenAI.Responses.ResponseFunctionToolCall =>
        item.type === "function_call",
    );

    if (functionCalls.length === 0) {
      // No more function calls - extract final text
      const textOutputs = outputItems.filter(
        (item): item is OpenAI.Responses.ResponseOutputMessage =>
          item.type === "message",
      );

      const finalText = textOutputs
        .flatMap((msg) => msg.content)
        .filter(
          (c): c is OpenAI.Responses.ResponseOutputText =>
            c.type === "output_text",
        )
        .map((c) => c.text)
        .join("\n");

      // Add supervisor's text response to activities as a "thought" so it's visually distinct
      // from the voice agent's spoken response
      if (finalText) {
        const thoughtActivity: SupervisorActivityPart = {
          type: "thought",
          content: finalText,
        };
        activities.push(thoughtActivity);
        onActivity?.(thoughtActivity);
      }

      return {
        finalText: finalText || "I completed that action.",
        activity: activities,
      };
    }

    // Execute each tool call via MCP
    for (const toolCall of functionCalls) {
      const args = JSON.parse(toolCall.arguments || "{}");

      // Create activity object that will be updated with result
      const activity: SupervisorActivityPart = {
        type: "tool",
        name: toolCall.name,
        args,
        result: null,
      };

      // Emit tool call immediately (shows "calling tool..." state)
      onActivity?.(activity);

      let result: unknown;
      try {
        const mcpResult = await mcpClient.callTool({
          name: toolCall.name,
          arguments: args,
        });
        result = mcpResult.content;

        // Update activity with result
        activity.result = JSON.stringify(result);
      } catch (error) {
        result = {
          error: error instanceof Error ? error.message : String(error),
          isError: true,
        };

        // Update activity with error result
        activity.result = JSON.stringify(result);
        activity.isError = true;
      }

      // Add completed activity to list and emit with result
      activities.push(activity);
      onActivity?.(activity);

      // Add tool call and result to input for next iteration
      (input as OpenAI.Responses.ResponseInputItem[]).push(
        {
          type: "function_call",
          call_id: toolCall.call_id,
          name: toolCall.name,
          arguments: toolCall.arguments,
        },
        {
          type: "function_call_output",
          call_id: toolCall.call_id,
          output: JSON.stringify(result),
        },
      );
    }

    // Continue with updated input - use streaming if callback provided
    const iterLabel = `iteration-${iteration}`;
    if (onTextDelta) {
      currentResponse = await callResponsesApiStreaming(
        openai,
        model,
        input,
        tools,
        { onTextDelta },
        iterLabel,
      );
    } else {
      currentResponse = await callResponsesApi(
        openai,
        model,
        input,
        tools,
        iterLabel,
      );
    }
  }

  return {
    finalText: "I wasn't able to complete that action.",
    activity: activities,
  };
}

/* istanbul ignore next -- @preserve integration tool with execute callback */
/**
 * Creates the supervisor tool that the voice agent uses to get intelligent responses
 * @returns {ReturnType<typeof tool>} The configured supervisor tool
 */
export function createSupervisorTool(): ReturnType<typeof tool> {
  return tool({
    name: "getNextResponseFromSupervisor",
    description:
      "Get a response from the intelligent supervisor agent who can execute tools in Ableton Live. Use this for any action requiring Ableton Live.",
    parameters: {
      type: "object",
      properties: {
        relevantContextFromLastUserMessage: {
          type: "string",
          description:
            "Key information from the user's request. Be concise but include all relevant details.",
        },
      },
      required: ["relevantContextFromLastUserMessage"],
      additionalProperties: false,
    },
    /* istanbul ignore next -- @preserve execute callback requiring live services */
    execute: async (params, details) => {
      const { relevantContextFromLastUserMessage } = params as {
        relevantContextFromLastUserMessage: string;
      };

      // Get context passed from the voice chat hook
      const context = details?.context as SupervisorContext | undefined;
      if (!context) {
        return {
          error:
            "Supervisor not configured. Please check settings and try again.",
        };
      }

      const { apiKey, model, mcpClient, history } = context;

      // Create OpenAI client for this request
      const openai = new OpenAI({
        apiKey,
        dangerouslyAllowBrowser: true,
      });

      // Get MCP tools in OpenAI format
      const tools = await getMcpToolsAsOpenAIFormat(mcpClient);

      // Include all history items so supervisor sees tool call results (e.g., ppal-connect skillset)
      // Previously filtered to just "message" items which excluded function_call and function_call_output
      const filteredHistory = history;

      // Build the request input
      const input: OpenAI.Responses.ResponseInputItem[] = [
        {
          type: "message",
          role: "system",
          content: SUPERVISOR_INSTRUCTIONS,
        },
        {
          type: "message",
          role: "user",
          content: `==== Conversation History ====
${JSON.stringify(filteredHistory, null, 2)}

==== User Request ====
${relevantContextFromLastUserMessage}
`,
        },
      ];

      // Log history context for debugging
      console.log(
        "[Supervisor] Realtime history:",
        JSON.stringify(history, null, 2),
      );

      // Call the Responses API (detailed request/response logged inside)
      const response = await callResponsesApi(
        openai,
        model,
        input,
        tools,
        "initial",
      );

      // Create incremental activity callback that accumulates and forwards to hook
      const allActivities: SupervisorActivityPart[] = [];
      const onActivity = (activity: SupervisorActivityPart) => {
        // Find existing activity by name (update) or add new
        const existingIndex = allActivities.findIndex(
          (a) => a.name === activity.name && a.type === "tool",
        );
        if (existingIndex >= 0) {
          // Update existing activity with result
          allActivities[existingIndex] = activity;
        } else {
          // Add new activity
          allActivities.push(activity);
        }
        // Notify hook with current state (creates incremental updates)
        context.onSupervisorActivity?.([...allActivities]);
      };

      // Handle tool calls if any
      const { finalText, activity } = await handleToolCallLoop(
        openai,
        mcpClient,
        model,
        input,
        tools,
        response,
        onActivity,
        context.onSupervisorTextDelta,
      );

      // Notify hook of final supervisor activities
      console.log(
        "[Supervisor] Activities captured:",
        JSON.stringify(activity, null, 2),
      );
      console.log("[Supervisor] Final text:", finalText);

      // Final notification with all activities (in case callback wasn't available earlier)
      if (context.onSupervisorActivity) {
        context.onSupervisorActivity(activity);
      }

      return { nextResponse: finalText };
    },
  });
}
