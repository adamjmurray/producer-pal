// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import {
  remoteScriptRequest,
  RemoteScriptTimeout,
} from "#src/mcp-server/rpc/remote-script/remote-script-client.ts";
import { hashRemoteScript } from "./source-hash.ts";

const RELOAD_TIMEOUT_MS = 10_000;
const SHORT_HASH = 12;

/** How a reload of the running remote script turned out. */
export type ReloadOutcome =
  | { kind: "reloaded"; modules: string[] }
  | { kind: "not-running" }
  | { kind: "no-route" }
  | { kind: "timeout"; message: string }
  | { kind: "failed"; error: string; traceback: string | null }
  | { kind: "hash-mismatch"; installed: string; running: string }
  | { kind: "unexpected"; status: number };

/**
 * Ask the running remote script to reload the code just installed, and check
 * that what it loaded is what's on disk.
 *
 * @param installPath - The installed Producer_Pal folder
 * @returns What happened
 */
export async function reloadRemoteScript(
  installPath: string,
): Promise<ReloadOutcome> {
  let reply;

  try {
    reply = await remoteScriptRequest({
      method: "POST",
      route: "/reload",
      timeoutMs: RELOAD_TIMEOUT_MS,
    });
  } catch (error) {
    if (error instanceof RemoteScriptTimeout) {
      return { kind: "timeout", message: error.message };
    }

    throw error;
  }

  if (!reply.available) {
    return { kind: "not-running" };
  }

  if (reply.status === 404) {
    return { kind: "no-route" };
  }

  const { body } = reply;

  if (reply.status === 500) {
    return {
      kind: "failed",
      error: typeof body.error === "string" ? body.error : "reload failed",
      traceback: typeof body.traceback === "string" ? body.traceback : null,
    };
  }

  if (reply.status !== 200) {
    return { kind: "unexpected", status: reply.status };
  }

  const installed = hashRemoteScript(installPath);
  const running = typeof body.hash === "string" ? body.hash : "";

  if (installed !== running) {
    return { kind: "hash-mismatch", installed, running };
  }

  return {
    kind: "reloaded",
    modules: Array.isArray(body.reloaded) ? body.reloaded.map(String) : [],
  };
}

/**
 * Say what a reload outcome means, in a line a developer can act on.
 *
 * @param outcome - What reloadRemoteScript returned
 * @returns Whether the new code is running, and what to tell the developer
 */
export function describeReload(outcome: ReloadOutcome): {
  ok: boolean;
  message: string;
} {
  switch (outcome.kind) {
    case "reloaded":
      return {
        ok: true,
        message: `Reloaded in Live (${outcome.modules.join(", ")}). The running code matches what was installed.`,
      };
    case "not-running":
      return {
        ok: false,
        message:
          "Not reloaded: Live isn't running, or the Producer Pal remote script isn't loaded in it. Start Live and enable the control surface.",
      };
    case "no-route":
      return {
        ok: false,
        message:
          "Not reloaded: the running script has no /reload route. Install with --probe and restart Live once.",
      };
    case "timeout":
      return {
        ok: false,
        message: `Not reloaded: ${outcome.message}. Live may be busy; try again.`,
      };
    case "failed":
      return {
        ok: false,
        message: [
          `Reload failed; Live is still running the previous code. ${outcome.error}`,
          outcome.traceback,
        ]
          .filter((line) => line != null)
          .join("\n"),
      };
    case "hash-mismatch":
      return {
        ok: false,
        message: `Hash mismatch: Live loaded ${outcome.running.slice(0, SHORT_HASH)}, but ${outcome.installed.slice(0, SHORT_HASH)} was installed. Restart Live.`,
      };
    default:
      return {
        ok: false,
        message: `Not reloaded: /reload answered with status ${String(outcome.status)}.`,
      };
  }
}
