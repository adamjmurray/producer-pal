// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import {
  ENVELOPE_ROUTES,
  REMOTE_SCRIPT_ROUTE_TIMEOUT_MS,
} from "#src/tools/clip/envelopes/remote-script-envelope-contract.ts";
import { differentBuildReason } from "#src/tools/shared/remote-script/outdated-remote-script.ts";
import { type RouteReply } from "#src/tools/shared/remote-script/remote-script-route-contract.ts";
import { registerNodeRoute } from "../../node-request-protocol.ts";
import { requireString } from "../../route-string-args.ts";
import { outdatedFields } from "../port/remote-script-version.ts";
import { remoteScriptPing } from "../remote-script-client.ts";
import { requireExpiry } from "./remote-script-change.ts";
import { forwardRemoteScriptRequest } from "./remote-script-forward.ts";

/** The V8-side name of each param the remote script spells differently. */
const BODY_KEYS: Record<string, string> = {
  slot: "slot",
  arrangementIndex: "arrangement_index",
  device: "device",
  parameter: "parameter",
  from: "from",
  to: "to",
  limit: "limit",
  points: "points",
};

/**
 * What a script from before return-track clips answers for an `rt` track. Its
 * version can be the one this build needs, so the version check passes it.
 */
const OLD_SCRIPT_REFUSAL =
  "track must be t0, t1... (return and master tracks have no clips)";

/** The routes that change the Set; the rest only read. */
const CHANGING_ROUTES: ReadonlySet<string> = new Set(["write", "clear"]);

/**
 * Register the routes V8 uses to read and write clip automation envelopes
 * through the remote script. Each forwards to the matching `/envelope/*` route.
 */
export function registerRemoteScriptEnvelopeRoutes(): void {
  for (const [name, route] of Object.entries(ENVELOPE_ROUTES)) {
    registerNodeRoute(
      route,
      (args) => forwardEnvelopeRequest(name, args),
      REMOTE_SCRIPT_ROUTE_TIMEOUT_MS,
    );
  }
}

// --- Helpers below main exports ---

/**
 * Forward one envelope request to the remote script.
 * @param name - The envelope route: list, read, write or clear
 * @param args - The route args, in V8's spelling
 * @returns The remote script's JSON, an error worded for the model, or
 *   `available: false` when nothing answered
 * @throws Error when a change sends no `expiresInMs`, or the remote script took
 *   the request but never answered
 */
async function forwardEnvelopeRequest(
  name: string,
  args: unknown,
): Promise<RouteReply<Record<string, unknown>>> {
  const body = envelopeBody(args);
  const reply = await forwardRemoteScriptRequest(
    `/envelope/${name}`,
    body,
    CHANGING_ROUTES.has(name) ? requireExpiry(args) : undefined,
  );

  return "error" in reply &&
    reply.error === OLD_SCRIPT_REFUSAL &&
    String(body.track).startsWith("rt")
    ? await olderScriptReply()
    : reply;
}

/**
 * @returns The reply for a script that can't reach return-track clips: another
 *   build than this one's, to update
 */
async function olderScriptReply(): Promise<RouteReply<never>> {
  const { scriptVersion } = await remoteScriptPing();

  return {
    available: false,
    ...outdatedFields((manage) =>
      differentBuildReason(scriptVersion, "device", manage),
    ),
  };
}

/**
 * Build the remote script's request body, in its own spelling. Params left out
 * stay out: the remote script reads a missing `parameter` as "every envelope".
 * @param args - The route args
 * @returns The body to POST
 */
function envelopeBody(args: unknown): Record<string, unknown> {
  const source = (args as Record<string, unknown> | null) ?? {};
  const body: Record<string, unknown> = { track: requireString(args, "track") };

  for (const [key, remoteKey] of Object.entries(BODY_KEYS)) {
    if (source[key] != null) {
      body[remoteKey] = source[key];
    }
  }

  return body;
}
