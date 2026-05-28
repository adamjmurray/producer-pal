// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/** What the browser needs to open a Live connection. */
export interface GeminiVoiceCredential {
  /** The apiKey to pass to GoogleGenAI — a raw key (passthrough) or, once the
   * route mints them, an ephemeral token. */
  value: string;
  /** Ephemeral tokens are only valid on the v1alpha API; a raw key is not. The
   * hook sets httpOptions.apiVersion accordingly. */
  ephemeral: boolean;
}

/**
 * Fetch a Gemini Live credential from the backend proxy. Mirrors the OpenAI
 * /voice-token flow: the browser sends its own Gemini key in a header and the
 * server returns what to connect with. The server currently passes the key back
 * (a localhost convenience — the key already lives in this browser for text
 * chat); when it grows ephemeral-token minting it returns `{ ephemeral: true }`
 * and this code path doesn't change beyond honoring that flag.
 *
 * @param tokenUrl - URL of the /gemini-voice-token endpoint
 * @param geminiKey - User's Gemini API key (sent in X-Gemini-Key)
 * @param model - Realtime model id (lets the server scope an ephemeral token)
 * @returns The credential to open the Live connection with
 */
export async function fetchGeminiToken(
  tokenUrl: string,
  geminiKey: string,
  model: string,
): Promise<GeminiVoiceCredential> {
  const response = await fetch(tokenUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Gemini-Key": geminiKey,
    },
    body: JSON.stringify({ model }),
  });

  if (!response.ok) {
    const detail = await safeJson(response);

    throw new Error(
      `Gemini voice token request failed: ${response.status} ${response.statusText}${
        detail ? ` — ${JSON.stringify(detail)}` : ""
      }`,
    );
  }

  const json = (await response.json()) as {
    value?: string;
    ephemeral?: boolean;
  };

  if (!json.value) {
    throw new Error("Gemini voice token response missing 'value' field");
  }

  return { value: json.value, ephemeral: json.ephemeral === true };
}

/**
 * Best-effort JSON read; returns null on failure.
 *
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
