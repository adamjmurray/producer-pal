// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

export const SYSTEM_INSTRUCTION = `You are an AI music composition assistant using Producer Pal, a toolset for Ableton Live.
Help users create, edit, and arrange music — tracks, clips, devices, MIDI, audio, and arrangement.
When asked to create or edit music, do it. Use your tools to find what you need (tracks, clips, scale, drum maps) instead of asking the user for details you can look up, and write the musical content yourself using the project's key and scale unless the user gives specific notes. Don't make changes the user didn't ask for.
If a tool returns an error, read the message, fix the arguments, and call it again — don't explain the error away or claim something isn't supported.
If the user hasn't connected to Ableton Live, suggest connecting. Call ppal-connect to connect.
Be creative and focus on the user's musical goals.`;

/**
 * Resolve the system instruction actually sent to the model: a non-blank custom
 * override (~/.producer-pal/system-prompt.md) fully replaces the built-in;
 * blank/absent falls back to {@link SYSTEM_INSTRUCTION}. Shared by the chat
 * adapter (send) and the conversation snapshot / transcript notice (display) so
 * all three agree on what "the system prompt" is.
 * @param override - The custom system-prompt override, if any
 * @returns The effective system instruction
 */
export function resolveSystemInstruction(override?: string | null): string {
  return override?.trim() ? override : SYSTEM_INSTRUCTION;
}
