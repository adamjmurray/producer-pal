// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { remoteScriptRequest } from "#src/mcp-server/rpc/remote-script/remote-script-client.ts";

const SNIPPETS_DIR = join(import.meta.dirname, "snippets");

/**
 * Run Python on Live's main thread through the dev-only /probe route.
 *
 * @param code - Python source; whatever it assigns to `result` comes back
 * @param timeoutMs - How long to wait for Live to run it
 * @returns The `result` the code assigned, made JSON-safe
 * @throws Error when the remote script is unreachable, lacks /probe, or the code raised
 */
export async function runProbe(
  code: string,
  timeoutMs = 60_000,
): Promise<unknown> {
  const reply = await remoteScriptRequest({
    method: "POST",
    route: "/probe",
    body: { code },
    timeoutMs,
  });

  if (!reply.available) {
    throw new Error("The remote script isn't running in Live");
  }

  if (reply.status === 404) {
    throw new Error(
      "No /probe route: run `npm run remote-script:install -- --probe` and restart Live",
    );
  }

  if (typeof reply.body.error === "string") {
    throw new Error(reply.body.error);
  }

  return reply.body.result;
}

/**
 * Read one of the bundled snippets.
 *
 * @param name - File name in snippets/, e.g. "python-surface.py"
 * @returns Its Python source
 */
export function readSnippet(name: string): string {
  return readFileSync(join(SNIPPETS_DIR, name), "utf8");
}
