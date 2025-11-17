/**
 * Type definitions for provider settings and configuration.
 *
 * Supports multiple LLM providers:
 * - Gemini (Google)
 * - OpenAI
 * - Mistral (OpenAI-compatible)
 * - OpenRouter (OpenAI-compatible)
 * - LM Studio (local OpenAI-compatible)
 * - Ollama (local OpenAI-compatible)
 * - Custom (any OpenAI-compatible provider)
 */

// Provider types
export type Provider =
  | "gemini"
  | "openai"
  | "mistral"
  | "openrouter"
  | "lmstudio"
  | "ollama"
  | "custom";

// Gemini-specific settings
export interface GeminiSettings {
  apiKey: string;
  model: string;
  thinking: string; // "Auto" | "Off" | specific thinking budget (e.g., "5000")
  temperature: number;
  showThoughts: boolean;
}

// Provider settings interface
export interface ProviderSettings {
  // Active provider
  provider: Provider;

  // Per-provider API keys
  geminiApiKey: string;
  openaiApiKey: string;
  mistralApiKey: string;
  openrouterApiKey: string;
  lmstudioApiKey: string;
  ollamaApiKey: string;
  customApiKey: string;

  // Local provider ports
  lmstudioPort: number;
  ollamaPort: number;

  // Custom provider base URL
  customBaseUrl: string;

  // Common settings
  model: string;
  temperature: number;
  thinking: string;
  showThoughts: boolean;
}

// Hook return type for useSettings
export interface UseSettingsReturn {
  provider: Provider;
  setProvider: (provider: Provider) => void;
  apiKey: string;
  setApiKey: (key: string) => void;
  baseUrl?: string; // Only for custom provider
  setBaseUrl?: (url: string) => void;
  port?: number; // Only for lmstudio and ollama providers
  setPort?: (port: number) => void;
  model: string;
  setModel: (model: string) => void;
  thinking: string;
  setThinking: (thinking: string) => void;
  temperature: number;
  setTemperature: (temp: number) => void;
  showThoughts: boolean;
  setShowThoughts: (show: boolean) => void;
  saveSettings: () => void;
  cancelSettings: () => void;
  hasApiKey: boolean;
  settingsConfigured: boolean;
  // Tool toggles
  enabledTools: Record<string, boolean>;
  setEnabledTools: (tools: Record<string, boolean>) => void;
  enableAllTools: () => void;
  disableAllTools: () => void;
  resetBehaviorToDefaults: () => void;
  isToolEnabled: (toolId: string) => boolean;
}
