// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { MANAGE_ROUTES } from "#src/tools/core/helpers/manage-contract.ts";
import { REMOTE_SCRIPT_ROUTE_TIMEOUT_MS } from "#src/tools/device/create/helpers/remote-script-contract.ts";
import { registerNodeRoute } from "../../node-request-protocol.ts";
import { requireExpiry } from "./remote-script-change.ts";
import { forwardRemoteScriptRequest } from "./remote-script-forward.ts";

/**
 * Register the routes V8 uses to undo and redo in Live's history. Each forwards
 * to the remote script's `/undo/undo` or `/undo/redo`, which refuse with a 409
 * when there is nothing to step.
 */
export function registerRemoteScriptUndoRoutes(): void {
  for (const action of ["undo", "redo"] as const) {
    registerNodeRoute(
      MANAGE_ROUTES[action],
      (args) =>
        forwardRemoteScriptRequest(
          `/undo/${action}`,
          stepsBody(args),
          requireExpiry(args),
        ),
      REMOTE_SCRIPT_ROUTE_TIMEOUT_MS,
    );
  }
}

/**
 * The remote script's body for a step call.
 * @param args - The route args, maybe with `steps`
 * @returns `{ steps }` when the call named a count, else an empty body
 */
function stepsBody(args: unknown): Record<string, unknown> {
  const steps = (args as Record<string, unknown> | null)?.steps;

  return steps == null ? {} : { steps };
}
