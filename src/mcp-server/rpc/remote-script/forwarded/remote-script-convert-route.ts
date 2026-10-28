// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import {
  CONVERT_ROUTE,
  type ConvertReply,
} from "#src/tools/clip/convert/remote-script-convert-contract.ts";
import { REMOTE_SCRIPT_ROUTE_TIMEOUT_MS } from "#src/tools/device/create/helpers/remote-script-contract.ts";
import { registerNodeRoute } from "../../node-request-protocol.ts";
import { requireString } from "../../route-string-args.ts";
import { unavailableReply } from "../remote-script-client.ts";
import {
  failedChange,
  requestChange,
  requireExpiry,
} from "./remote-script-change.ts";

/**
 * Register the route V8 uses to start converting an audio clip. It forwards to
 * the remote script's `/clip/convert`.
 */
export function registerRemoteScriptConvertRoute(): void {
  registerNodeRoute(CONVERT_ROUTE, convertClip, REMOTE_SCRIPT_ROUTE_TIMEOUT_MS);
}

/**
 * Ask Live to convert one clip.
 * @param args - `{ track, slot | arrangementIndex, type, expiresInMs }`
 * @returns Whether Live started it, an error worded for the model
 *   (`unfinished` when Live may have started it anyway), or `available: false`
 */
async function convertClip(args: unknown): Promise<ConvertReply> {
  const source = args as Record<string, unknown>;
  const reply = await requestChange({
    route: "/clip/convert",
    body: {
      track: requireString(args, "track"),
      type: requireString(args, "type"),
      ...(source.slot != null && { slot: source.slot }),
      ...(source.arrangementIndex != null && {
        arrangement_index: source.arrangementIndex,
      }),
    },
    expiresInMs: requireExpiry(args),
  });

  if (!reply.available) {
    return unavailableReply(reply);
  }

  return reply.status === 200 ? { available: true } : failedChange(reply);
}
