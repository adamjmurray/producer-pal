// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Type definitions for chat messages and formatting.
 *
 * Defines interfaces for:
 * - UI-friendly message structures for rendering
 * - Message formatter and chat client interfaces
 */

// UI Part Types
// These represent the different types of content that can appear in a message

export interface UITextPart {
  type: "text";
  content: string;
}

export interface UIThoughtPart {
  type: "thought";
  content: string;
  isOpen?: boolean; // true when this is the last thought and assistant is still responding
}

export interface UIToolPart {
  type: "tool";
  name: string;
  args: Record<string, unknown>;
  result: string | null;
  isError?: boolean;
}

export interface UIErrorPart {
  type: "error";
  content: string;
  isError: true;
}

export type UIPart = UITextPart | UIThoughtPart | UIToolPart | UIErrorPart;

// UI Message Structure
// This is the format used throughout the UI for rendering messages

export interface UIMessage {
  role: "user" | "model";
  parts: UIPart[];
  rawHistoryIndex: number; // Maps back to the original index in the raw chat history (used for retry)
  timestamp: number; // Unix timestamp in milliseconds
}

// Formatter Interface
// Transforms provider-specific message formats into our unified UI format

export interface MessageFormatter<TRawMessage> {
  format: (history: TRawMessage[]) => UIMessage[];
}

// Chat Client Interface
// Manages chat sessions with AI providers

export interface ChatClient<TRawMessage> {
  chatHistory: TRawMessage[];
  initialize: () => Promise<void>;
  sendMessage: (
    message: string,
  ) => AsyncGenerator<TRawMessage[], void, unknown>;
}
