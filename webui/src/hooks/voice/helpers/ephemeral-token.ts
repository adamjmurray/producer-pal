// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { OPENAI_REALTIME_MODEL } from "#webui/lib/constants/models";

/**
 * Fetch an ephemeral `ek_...` token from the backend proxy.
 * @param voiceTokenUrl - URL of the /voice-token endpoint
 * @param openAiKey - User's OpenAI API key (sent in X-OpenAI-Key header)
 * @param model - Realtime model id to mint for (default OPENAI_REALTIME_MODEL)
 * @returns The ephemeral client secret value
 */
export async function fetchEphemeralToken(
  voiceTokenUrl: string,
  openAiKey: string,
  model: string = OPENAI_REALTIME_MODEL,
): Promise<string> {
  const response = await fetch(voiceTokenUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-OpenAI-Key": openAiKey,
    },
    body: JSON.stringify({ model }),
  });

  if (!response.ok) {
    const detail = await safeJson(response);

    throw new Error(
      `Voice token request failed: ${response.status} ${response.statusText}${
        detail ? ` — ${JSON.stringify(detail)}` : ""
      }`,
    );
  }

  const json = (await response.json()) as { value?: string };

  if (!json.value) {
    throw new Error("Voice token response missing 'value' field");
  }

  return json.value;
}

/**
 * Best-effort JSON read; returns null on failure.
 * @param response - Fetch response
 * @returns Parsed JSON or null
 */
async function safeJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}
