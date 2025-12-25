/**
 * Check if we're using OpenRouter.
 * OpenRouter supports reasoning with a different format: { reasoning: { effort: "high" } }
 * @param {string} [baseUrl] - Base URL to check
 * @returns {boolean} - True if OpenRouter API
 */
export function isOpenRouterProvider(baseUrl?: string): boolean {
  return baseUrl?.includes("openrouter.ai") ?? false;
}
