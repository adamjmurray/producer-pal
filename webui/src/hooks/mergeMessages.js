/**
 * Convert user-role functionResponse messages to the result field of the corresponding functionCall.
 * Merge consecutive model messages together.
 * Mark the current thought as "isOpen" for activity indicators in the UI.
 */
export function mergeMessages(history) {
  const messages = history.reduce((messages, { role, parts = [] }) => {
    const lastMessage = messages.at(-1);
    let currentMessage;

    if (lastMessage?.role === role || isFunctionResponse(parts)) {
      currentMessage = lastMessage;
    } else {
      currentMessage = { role, parts: [] };
      messages.push(currentMessage);
    }
    const currentParts = currentMessage.parts;

    for (const part of parts) {
      const lastPart = currentParts.at(-1);
      const { functionCall, functionResponse } = part;

      if (functionCall) {
        currentParts.push({
          type: "tool",
          name: functionCall.name,
          args: functionCall.args,
          result: null,
        });
      } else if (functionResponse) {
        if (
          lastPart?.type === "tool" &&
          lastPart.name === functionResponse.name
        ) {
          lastPart.result = getToolCallResult(functionResponse);
        } else {
          console.error(
            "Missing corresponding function call for function response",
            JSON.stringify({ functionResponse, currentParts }, null, 2),
          );
        }
      } else if (part.text) {
        if (
          (lastPart?.type === "text" && !part.thought) ||
          (lastPart?.type === "thought" && part.thought)
        ) {
          lastPart.content += part.text;
        } else {
          currentParts.push({
            type: part.thought ? "thought" : "text",
            content: part.text,
          });
        }
      }
    }

    return messages;
  }, []);

  const lastPart = messages.at(-1)?.parts?.at(-1);
  if (lastPart?.type === "thought") {
    lastPart.isOpen = true; // show the thought as currently active
  }

  return messages;
}

function isFunctionResponse(parts) {
  return !!parts?.[0]?.functionResponse;
}

function getToolCallResult(functionResponse) {
  // Warnings can be returned in the additional content entries,
  // but that generally isn't intended to be user-facing, so we ignore it
  return functionResponse.response?.content?.[0]?.text;
}
