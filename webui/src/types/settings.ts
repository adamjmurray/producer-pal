/**
 * Type definitions for provider settings and configuration.
 *
 * Supports multiple LLM providers:
 * - Gemini (Google)
 * - OpenAI
 * - Groq (OpenAI-compatible)
 * - Mistral (OpenAI-compatible)
 * - Custom (any OpenAI-compatible provider)
 */

// Provider types
export type Provider = "gemini" | "openai" | "groq" | "mistral" | "custom";

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
  groqApiKey: string;
  mistralApiKey: string;
  customApiKey: string;

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
