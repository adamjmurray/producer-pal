// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// Installs the test suite's mock Live API as the Max V8 globals the tools read,
// so the docs generator can run real tool code with no Ableton Live running.
//
// This has to happen before any tool module is imported, which is why the
// generator reaches everything downstream through dynamic import.

import { Folder } from "#src/test/mocks/mock-folder.ts";
import { LiveAPI } from "#src/test/mocks/mock-live-api.ts";
import { nodeRouteResponse } from "./node-routes.ts";

/** Warnings the tools emitted, in call order. Cleared per example. */
const warnings: string[] = [];

let respondToNode: ((requestId: string, json: string) => void) | undefined;

/**
 * Install the mock Live API plus the Max V8 globals the tool code touches.
 * @returns Nothing; resolves once the LiveAPI extensions have been applied
 */
export async function installMockLiveApi(): Promise<void> {
  const g = globalThis as Record<string, unknown>;

  g.LiveAPI = LiveAPI;
  g.Folder = Folder;
  g.Task = ExampleTask;
  g.outlet = handleOutlet;

  // Read at module load by live-api-adapter.ts.
  g.outlets = 0;
  g.setoutletassist = (): void => {};

  // Adds trackIndex, getColor(), LiveAPI.from() and friends to the class above.
  await import("#src/live-api-adapter/live-api-extensions.ts");

  ({ handleNodeResponse: respondToNode } =
    await import("#src/live-api-adapter/node-request-v8-protocol.ts"));
}

/**
 * Take the warnings recorded since the last call, clearing them.
 * @returns Warning strings in the order the tools emitted them
 */
export function takeWarnings(): string[] {
  return warnings.splice(0, warnings.length);
}

/**
 * Stand in for the Max V8 outlet. Outlet 1 carries warnings; outlet 0 carries
 * node_request, which is answered inline from the canned route table.
 * @param outletNumber - Which outlet the tool code wrote to
 * @param args - The message, already flattened into atoms
 */
function handleOutlet(outletNumber: number, ...args: unknown[]): void {
  if (outletNumber === 1) {
    warnings.push(args.map(String).join(" "));

    return;
  }

  if (args[0] !== "node_request" || respondToNode == null) return;

  const requestId = String(args[1]);
  const { route } = JSON.parse(String(args[2])) as { route: string };

  // requestNode() registers the pending request before it calls outlet, so
  // answering here resolves it without the timeout ever running.
  respondToNode(requestId, nodeRouteResponse(route));
}

// The test suite's Task fires its callback the moment it's scheduled, which
// would trip every node_request timeout before the response arrives. Here a
// scheduled task simply never fires, and cancellation is a no-op.
class ExampleTask {
  schedule(_ms: number): void {}
}
