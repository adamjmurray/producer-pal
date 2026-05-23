// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { type Express, type Request, type Response } from "express";
import { errorMessage } from "#src/shared/error-utils.ts";
import { isLocalOrigin } from "../helpers/request-origin.ts";
import * as console from "../node-for-max-logger.ts";

const OPENAI_CLIENT_SECRETS_URL =
  "https://api.openai.com/v1/realtime/client_secrets";
const DEFAULT_REALTIME_MODEL = "gpt-realtime-2";
const OPENAI_KEY_HEADER = "x-openai-key";

interface OpenAIClientSecretResponse {
  value: string;
  expires_at: number;
}

/**
 * Register POST /voice-token. The browser sends its own OpenAI API key in the
 * X-OpenAI-Key header; this route forwards it to OpenAI's client_secrets
 * endpoint server-to-server and returns just the short-lived `ek_...` token.
 * The long-lived key is never logged or stored.
 *
 * Gated by the same chatUIEnabled toggle as /chat and /voice, since voice mode
 * shares the chat UI's settings and OpenAI key.
 *
 * @param app - Express application
 * @param isChatUIEnabled - Returns whether the chat UI is currently enabled
 */
export function registerVoiceTokenRoute(
  app: Express,
  isChatUIEnabled: () => boolean,
): void {
  app.post(
    "/voice-token",
    async (req: Request, res: Response): Promise<void> => {
      if (!isChatUIEnabled()) {
        res.status(403).json({ error: "Chat UI is disabled" });

        return;
      }

      const origin = req.get("Origin");

      if (origin && !isLocalOrigin(origin)) {
        res
          .status(403)
          .json({ error: "cross-origin /voice-token is not allowed" });

        return;
      }

      const apiKey = req.get(OPENAI_KEY_HEADER);

      if (!apiKey) {
        res.status(400).json({
          error: `Missing ${OPENAI_KEY_HEADER} header`,
        });

        return;
      }

      const body = (req.body ?? {}) as { model?: unknown };
      const model =
        typeof body.model === "string" && body.model.length > 0
          ? body.model
          : DEFAULT_REALTIME_MODEL;

      try {
        const upstream = await fetch(OPENAI_CLIENT_SECRETS_URL, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            session: {
              type: "realtime",
              model,
            },
          }),
        });

        if (!upstream.ok) {
          const detail = await safeReadError(upstream);

          console.warn(
            `voice-token upstream error: ${upstream.status} ${upstream.statusText}`,
          );
          res.status(upstream.status).json({
            error: `OpenAI client_secrets request failed: ${upstream.status} ${upstream.statusText}`,
            detail,
          });

          return;
        }

        const json = (await upstream.json()) as OpenAIClientSecretResponse;

        res.json({
          value: json.value,
          expires_at: json.expires_at,
        });
      } catch (err) {
        console.error(`voice-token error: ${errorMessage(err)}`);
        res.status(502).json({ error: errorMessage(err) });
      }
    },
  );
}

/**
 * Read OpenAI's error body without throwing, prefer JSON. Reads as text first
 * because a Response body can only be consumed once — calling `.json()`
 * directly would consume the body and leave `.text()` empty on the fallback
 * path.
 *
 * @param upstream - Fetch response
 * @returns Parsed JSON body, raw text, or null
 */
async function safeReadError(upstream: globalThis.Response): Promise<unknown> {
  let text: string;

  try {
    text = await upstream.text();
  } catch {
    return null;
  }

  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}
