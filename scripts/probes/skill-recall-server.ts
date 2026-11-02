// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

/**
 * The real MCP server, with no Ableton behind it.
 *
 * Every transport the probe supports connects here, so an AI-SDK model and an
 * agent CLI see byte-identical `tools/list` output and a difference in results
 * is the model rather than the harness. It runs `createMcpServer` itself — not
 * a hand-written copy of the schemas — so the tool and param descriptions under
 * test are the ones we ship.
 *
 * `callLiveApi` is a stub. Probe questions ask for an answer, not an action, so
 * nothing should reach it; it returns a refusal rather than throwing so that a
 * model which calls anyway gets a clean turn and the probe still scores the
 * text it wrote.
 */

import { createMcpServer } from "#src/mcp-server/create-mcp-server.ts";
import {
  startStatelessMcpServer,
  type StatelessMcpServer,
} from "#src/mcp-server/helpers/http/stateless-mcp.ts";
import { type Notation } from "#src/shared/notation.ts";

/**
 * Start an MCP server publishing the real toolset with no Live API behind it.
 *
 * Listens on an ephemeral port so it cannot collide with a real Producer Pal
 * device on 3350, and runs stateless (a fresh server per POST) the way the
 * device's own endpoint does.
 *
 * @param options - Mode to publish schemas for
 * @param options.notation - Notation setting (defaults to bar|beat)
 * @param options.smallModelMode - Whether to publish the small-model schemas
 * @returns The running server's URL and a close function
 */
export async function startSkillProbeServer(options: {
  notation?: Notation;
  smallModelMode?: boolean;
}): Promise<StatelessMcpServer> {
  return await startStatelessMcpServer(() =>
    createMcpServer(
      () =>
        Promise.resolve({
          error: "Probe server: no Ableton Live. Answer in text instead.",
        }),
      options,
    ),
  );
}
