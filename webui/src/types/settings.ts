/**
 * Type definitions for provider settings and configuration.
 *
 * Currently supports Gemini only, but structured to allow
 * for future multi-provider support (OpenAI, etc.)
 */

// Provider types - currently only Gemini is supported
export type Provider = "gemini";

// Gemini-specific settings
export interface GeminiSettings {
  apiKey: string;
  model: string;
  thinking: string; // "Auto" | "Off" | specific thinking budget (e.g., "5000")
  temperature: number;
  showThoughts: boolean;
}

// Provider settings interface
// Currently mirrors GeminiSettings, but prepared for future expansion
export interface ProviderSettings {
  // Current provider (only "gemini" for now)
  provider: Provider;

  // Gemini settings
  geminiApiKey: string;
  model: string;
  temperature: number;
  thinking: string;
  showThoughts: boolean;

  // Future: OpenAI settings
  // openaiApiKey?: string;
  // openaiBaseUrl?: string; // For OpenAI-compatible providers
}

// Hook return type for useSettings
export interface UseSettingsReturn {
  apiKey: string;
  setApiKey: (key: string) => void;
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
}
