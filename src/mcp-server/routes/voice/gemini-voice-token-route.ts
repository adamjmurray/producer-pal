// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { type Express, type Request, type Response } from "express";
import { rejectCrossOriginWrite } from "../../helpers/http/request-origin.ts";

const GEMINI_KEY_HEADER = "x-gemini-key";

/**
 * Register POST /gemini-voice-token, the Gemini counterpart to /voice-token.
 *
 * Producer Pal runs on localhost against the user's own Gemini key, which the
 * browser already holds (it uses it for text chat). For the Gemini Live path the
 * browser opens the WebSocket to Google directly (client-to-server, which Google
 * recommends as faster for audio), so the key would reach Google from the
 * browser regardless. This route therefore returns the key as-is
 * (`ephemeral: false`) — it exists to (a) apply local-origin gating like the
 * rest of the chat surface and (b) keep one seam the client already calls, so
 * swapping in ephemeral tokens later is a server-only change.
 *
 * Hardening upgrade (when wanted): mint a short-lived token via the v1alpha
 * `auth_tokens` endpoint and return `{ value: token.name, ephemeral: true }`;
 * the client already honors the `ephemeral` flag (connects on v1alpha). The
 * long-lived key is never logged here in either case.
 *
 * @param app - Express application
 */
export function registerGeminiVoiceTokenRoute(app: Express): void {
  app.post("/gemini-voice-token", (req: Request, res: Response): void => {
    if (
      rejectCrossOriginWrite(
        req,
        res,
        "cross-origin /gemini-voice-token is not allowed",
      )
    ) {
      return;
    }

    const apiKey = req.get(GEMINI_KEY_HEADER);

    if (!apiKey) {
      res.status(400).json({ error: `Missing ${GEMINI_KEY_HEADER} header` });

      return;
    }

    res.json({ value: apiKey, ephemeral: false });
  });
}
