// Section links from before the 2.5 install-guide restructure, by old page.
// A redirect stub's meta refresh drops the #hash, so without these a bookmark
// like chat-ui-other-providers#custom-providers lands at the top of a page.
const MOVED_ANCHORS: Record<string, Record<string, string>> = {
  "installation/chat-ui": {
    "#cloud-providers": "/installation/api-keys",
    "#anthropic": "/installation/api-keys#anthropic",
    "#gemini": "/installation/api-keys#gemini",
    "#openrouter": "/installation/ai-routers#openrouter",
    "#mistral": "/installation/api-keys#mistral",
    "#openai": "/installation/api-keys#openai",
    "#local-offline": "/installation/local-ai",
    "#ollama-recommended": "/installation/local-ai#ollama",
    "#lm-studio-bionic": "/installation/local-ai#bionic-lm-studio",
  },
  "installation/chat-ui-other-providers": {
    "#anthropic": "/installation/api-keys#anthropic",
    "#openrouter": "/installation/ai-routers#openrouter",
    "#mistral": "/installation/api-keys#mistral",
    "#openai-api": "/installation/api-keys#openai",
    "#custom-providers": "/installation/api-keys#custom-providers",
    "#example-groq": "/installation/api-keys#custom-providers",
    "#lm-studio-api": "/installation/local-ai#bionic-lm-studio",
    "#troubleshooting": "/installation/ai-routers#troubleshooting",
  },
  "installation/ollama": {
    "#local-model-tips": "/installation/local-ai#tips",
    "#troubleshooting": "/installation/local-ai#troubleshooting",
  },
  "installation/gemini": {
    "#troubleshooting": "/installation/api-keys#troubleshooting",
  },
  "installation/openai": {
    "#troubleshooting": "/installation/api-keys#troubleshooting",
  },
  "installation/web-tunnels": {
    "#local-networks": "/installation/remote-access#local-networks",
    "#cloudflare-quick-tunnels-recommended":
      "/installation/remote-access#cloudflare-quick-tunnels-recommended",
    "#pinggy": "/installation/remote-access#pinggy",
    "#ngrok": "/installation/remote-access#ngrok",
  },
};

/**
 * Returns an inline script that sends an old section link to its new home, or
 * null when the page has no moved sections. It must run before the page's meta
 * refresh, so it goes first in the head.
 * @param path - Page path without extension, like "installation/chat-ui"
 * @returns The script's source, or null
 */
export function movedAnchorsScript(path: string): string | null {
  const anchors = MOVED_ANCHORS[path];

  if (anchors == null) {
    return null;
  }

  return `(function(){var t=${JSON.stringify(anchors)}[location.hash];if(t)location.replace(t)})()`;
}
