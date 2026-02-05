// Producer Pal
// Copyright (C) 2026 Adam Murray
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Shared type definitions for Gemini API responses
 */

export interface GeminiResponsePart {
  text?: string;
  thought?: boolean;
  functionCall?: {
    name: string;
    args: Record<string, unknown>;
  };
  functionResponse?: {
    response?: {
      content?: Array<{ text?: string }>;
    };
  };
}

export interface GeminiResponseCandidate {
  content?: {
    parts?: GeminiResponsePart[];
  };
}

export interface GeminiResponse {
  candidates?: GeminiResponseCandidate[];
  automaticFunctionCallingHistory?: Array<{
    role: string;
    parts: GeminiResponsePart[];
  }>;
  sdkHttpResponse?: unknown;
}
