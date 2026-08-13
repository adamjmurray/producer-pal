// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Multi-turn tests for the agent-CLI session, run against every transport.
 *
 * The whole premise of these transports is that the CLI owns the conversation
 * and we replay its session id to continue — so the id has to survive turn 1
 * and reach turn 2's argv. Nothing else in the eval suite would notice if it
 * didn't: a session that silently restarts each turn still produces plausible
 * output and still scores.
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { type McpConnection } from "#evals/chat/mcp.ts";
import { setQuietMode } from "#evals/scenarios/helpers/output-config.ts";
import { CLAUDE_CODE_TRANSPORT } from "../../claude-code/claude-code-protocol.ts";
import { CODEX_CLI_TRANSPORT } from "../../codex/codex-cli-protocol.ts";
import { createAgentCliSession } from "../agent-cli-session.ts";
import { type AgentCliTransport } from "../agent-cli-transport.ts";
import {
  claudeTurnStdout,
  codexTurnStdout,
  FIXTURE_BIN,
  type FixtureInvocation,
  makeFixtureDir,
  readInvocations,
} from "./agent-cli-test-helpers.ts";

// The session opens its own MCP client for state assertions; these tests only
// care about the subprocess, so stand it in rather than needing a live server.
const { connectMcpMock, closeMock } = vi.hoisted(() => {
  const close = vi.fn(async () => {});

  return {
    closeMock: close,
    connectMcpMock: vi.fn(async () => ({ client: { close }, transport: {} })),
  };
});

vi.mock(import("#evals/chat/mcp.ts"), () => ({
  connectMcp: connectMcpMock as unknown as (
    url?: string,
  ) => Promise<McpConnection>,
  createMcpTools: vi.fn(),
}));

const SESSION_ID = "session-abc";
const MCP_URL = "http://localhost:9999/mcp";
const INSTRUCTIONS = "You are Producer Pal.";

interface TransportCase {
  transport: AgentCliTransport;
  /** Canned stdout for one turn, in this CLI's event schema. */
  stdout: (sessionId: string, text: string) => string;
  /** The argv token that marks a resumed turn. */
  resumeToken: string;
}

const CASES: TransportCase[] = [
  {
    transport: CODEX_CLI_TRANSPORT,
    stdout: codexTurnStdout,
    resumeToken: "resume",
  },
  {
    transport: CLAUDE_CODE_TRANSPORT,
    stdout: claudeTurnStdout,
    resumeToken: "--resume",
  },
];

describe.each(CASES)(
  "createAgentCliSession — $transport.provider",
  ({ transport, stdout, resumeToken }) => {
    let fixture: Awaited<ReturnType<typeof makeFixtureDir>>;

    beforeEach(async () => {
      setQuietMode(true);
      fixture = await makeFixtureDir();
      vi.stubEnv(transport.binEnvVar, FIXTURE_BIN);
      vi.stubEnv("PPAL_FIXTURE_RECORD", fixture.recordFile);
      vi.stubEnv("PPAL_FIXTURE_STDOUT", stdout(SESSION_ID, "Connected."));
    });

    afterEach(async () => {
      setQuietMode(false);
      vi.unstubAllEnvs();
      await fixture.cleanup();
    });

    /**
     * Open a session pointed at the fixture binary.
     *
     * @returns The session under test
     */
    async function openSession(): ReturnType<typeof createAgentCliSession> {
      return await createAgentCliSession(transport, {
        instructions: INSTRUCTIONS,
        mcpUrl: MCP_URL,
        model: transport.judgeModel,
      });
    }

    it("parses a turn into the shared result shape", async () => {
      const session = await openSession();

      try {
        const result = await session.sendMessage("Connect to Ableton Live", 1);

        expect(result.text).toBe("Connected.");
        expect(result.toolCalls).toStrictEqual([
          { name: "ppal-connect", args: {}, result: "connected" },
        ]);
        expect(result.stepUsages).toStrictEqual([
          { inputTokens: 10, outputTokens: 4 },
        ]);
      } finally {
        await session.close();
      }
    });

    it("carries the CLI's session id from the first turn into the second", async () => {
      const session = await openSession();
      let invocations: FixtureInvocation[];

      try {
        await session.sendMessage("Connect to Ableton Live", 1);
        await session.sendMessage("Make a kick pattern", 2);
        invocations = readInvocations(fixture.recordFile);
      } finally {
        await session.close();
      }

      const [first, second] = invocations;

      expect(invocations).toHaveLength(2);
      expect(first?.stdin).toBe("Connect to Ableton Live");
      expect(first?.argv).not.toContain(SESSION_ID);

      expect(second?.stdin).toBe("Make a kick pattern");
      expect(second?.argv).toContain(resumeToken);
      expect(second?.argv).toContain(SESSION_ID);
    });

    it("runs in a private session dir holding the instructions, and cleans it up", async () => {
      const session = await openSession();
      let cwd: string;

      try {
        await session.sendMessage("Connect to Ableton Live", 1);
        cwd = readInvocations(fixture.recordFile)[0]?.cwd ?? "";

        expect(readFileSync(join(cwd, "instructions.md"), "utf8")).toBe(
          INSTRUCTIONS,
        );
        // The session's MCP URL reaches the CLI, not just our own MCP client.
        expect(
          readInvocations(fixture.recordFile)[0]?.argv.join(" "),
        ).toContain(MCP_URL);
      } finally {
        await session.close();
      }

      expect(existsSync(cwd)).toBe(false);
      expect(closeMock).toHaveBeenCalled();
    });
  },
);
