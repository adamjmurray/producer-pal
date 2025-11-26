import type OpenAI from "openai";

interface StreamCallbacks {
  onTextDelta?: (delta: string, snapshot: string) => void;
}

/* istanbul ignore next -- @preserve integration function */
/**
 * Calls the OpenAI Responses API
 * @param {OpenAI} openai - OpenAI client
 * @param {string} model - Model ID
 * @param {OpenAI.Responses.ResponseCreateParams["input"]} input - Request input
 * @param {OpenAI.Responses.Tool[]} tools - Available tools
 * @param {string} callLabel - Label for logging
 * @returns {Promise<OpenAI.Responses.Response>} API response
 */
export async function callResponsesApi(
  openai: OpenAI,
  model: string,
  input: OpenAI.Responses.ResponseCreateParams["input"],
  tools: OpenAI.Responses.Tool[],
  callLabel = "initial",
): Promise<OpenAI.Responses.Response> {
  console.log(
    `[Supervisor API ${callLabel}] Input:`,
    JSON.stringify(input, null, 2),
  );
  const response = await openai.responses.create({
    model,
    input,
    tools: tools.length > 0 ? tools : undefined,
    parallel_tool_calls: false,
  });
  console.log(
    `[Supervisor API ${callLabel}] Output:`,
    JSON.stringify(response.output, null, 2),
  );
  return response;
}

/* istanbul ignore next -- @preserve integration function */
/**
 * Calls the OpenAI Responses API with streaming enabled
 * @param {OpenAI} openai - OpenAI client
 * @param {string} model - Model ID
 * @param {OpenAI.Responses.ResponseCreateParams["input"]} input - Request input
 * @param {OpenAI.Responses.Tool[]} tools - Available tools
 * @param {StreamCallbacks} callbacks - Streaming callbacks
 * @param {string} callLabel - Label for logging
 * @returns {Promise<OpenAI.Responses.Response>} API response
 */
export async function callResponsesApiStreaming(
  openai: OpenAI,
  model: string,
  input: OpenAI.Responses.ResponseCreateParams["input"],
  tools: OpenAI.Responses.Tool[],
  callbacks?: StreamCallbacks,
  callLabel = "streaming",
): Promise<OpenAI.Responses.Response> {
  console.log(
    `[Supervisor API ${callLabel}] Input (streaming):`,
    JSON.stringify(input, null, 2),
  );
  const stream = await openai.responses.create({
    model,
    input,
    tools: tools.length > 0 ? tools : undefined,
    parallel_tool_calls: false,
    stream: true,
  });

  let finalResponse: OpenAI.Responses.Response | undefined;
  let accumulatedText = "";

  for await (const event of stream) {
    if (event.type === "response.output_text.delta") {
      accumulatedText += event.delta;
      callbacks?.onTextDelta?.(event.delta, accumulatedText);
    }
    if (event.type === "response.completed") {
      finalResponse = event.response;
    }
  }

  if (!finalResponse) {
    throw new Error("Stream ended without response.completed event");
  }
  console.log(
    `[Supervisor API ${callLabel}] Output:`,
    JSON.stringify(finalResponse.output, null, 2),
  );
  return finalResponse;
}
