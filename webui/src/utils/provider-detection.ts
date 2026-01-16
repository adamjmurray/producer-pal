/**
 * Check if we're using the official OpenAI API.
 * @param baseUrl - Base URL to check
 * @returns True if using OpenAI's official API (or default/undefined)
 */
export function isOpenAIProvider(baseUrl?: string): boolean {
  if (!baseUrl) return true;

  return baseUrl === "https://api.openai.com/v1";
}

/**
 * Check if we're using OpenRouter.
 * OpenRouter supports reasoning with a different format: { reasoning: { effort: "high" } }
 * @param baseUrl - Base URL to check
 * @returns True if OpenRouter API
 */
export function isOpenRouterProvider(baseUrl?: string): boolean {
  return baseUrl?.includes("openrouter.ai") ?? false;
}
