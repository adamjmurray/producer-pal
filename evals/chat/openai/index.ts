import type { ChatOptions } from "../shared/types.ts";
import { runOpenAIChat } from "./chat.ts";
import { runOpenAIResponses } from "./responses.ts";

/**
 * Run an interactive chat session with OpenAI
 *
 * @param initialText - Optional initial text to start the conversation
 * @param options - Chat configuration options
 */
export async function runOpenAI(
  initialText: string,
  options: ChatOptions,
): Promise<void> {
  const apiStyle = options.api ?? "responses";

  await (apiStyle === "chat"
    ? runOpenAIChat(initialText, options)
    : runOpenAIResponses(initialText, options));
}
