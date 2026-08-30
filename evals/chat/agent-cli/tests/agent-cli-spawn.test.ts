// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Subprocess-level tests for the agent-CLI transports.
 *
 * These spawn a real child process — the fixture binary, not a vendor CLI — so
 * the parts a mocked `spawn` would skip (stream decoding across chunk
 * boundaries, exit codes, signal escalation) are actually exercised.
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import { CODEX_CLI_TRANSPORT } from "../../codex/codex-cli-protocol.ts";
import { spawnAgentCli } from "../agent-cli-spawn.ts";
import {
  codexTurnStdout,
  FIXTURE_BIN,
  makeFixtureDir,
  readInvocations,
  toJsonl,
} from "./agent-cli-test-helpers.ts";

/**
 * Point the transport's bin env var at the fixture, configured by the caller.
 *
 * @param env - PPAL_FIXTURE_* variables driving the fixture's behavior
 */
function useFixture(env: Record<string, string>): void {
  vi.stubEnv(CODEX_CLI_TRANSPORT.binEnvVar, FIXTURE_BIN);

  for (const [key, value] of Object.entries(env)) vi.stubEnv(key, value);
}

describe("spawnAgentCli", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("passes argv and the prompt through, and returns stdout", async () => {
    const { dir, recordFile, cleanup } = await makeFixtureDir();
    const stdout = codexTurnStdout("thread-1", "Connected.");

    useFixture({
      PPAL_FIXTURE_STDOUT: stdout,
      PPAL_FIXTURE_RECORD: recordFile,
    });

    try {
      const result = await spawnAgentCli(
        CODEX_CLI_TRANSPORT,
        ["exec", "--model", "gpt-5.6-terra"],
        "Connect to Ableton Live",
        { cwd: dir },
      );

      expect(result).toBe(stdout);
      expect(readInvocations(recordFile)).toStrictEqual([
        {
          argv: ["exec", "--model", "gpt-5.6-terra"],
          stdin: "Connect to Ableton Live",
          cwd: dir,
        },
      ]);
    } finally {
      await cleanup();
    }
  });

  it("decodes a multi-byte character split across two stdout chunks", async () => {
    const { dir, cleanup } = await makeFixtureDir();
    // "café" — the é is two bytes, so flushing between them hands the parent a
    // partial code point. Without a streaming decoder it arrives as U+FFFD and
    // the JSON line no longer parses.
    const stdout = codexTurnStdout("thread-1", "Café ✅");
    const splitAt =
      Buffer.byteLength(stdout.slice(0, stdout.indexOf("é")), "utf8") + 1;

    useFixture({
      PPAL_FIXTURE_STDOUT: stdout,
      PPAL_FIXTURE_SPLIT_AT: String(splitAt),
    });

    try {
      const raw = await spawnAgentCli(CODEX_CLI_TRANSPORT, [], "hi", {
        cwd: dir,
      });

      expect(raw).toBe(stdout);
      expect(CODEX_CLI_TRANSPORT.parseStream(raw).text).toBe("Café ✅");
    } finally {
      await cleanup();
    }
  });

  it("names the missing executable and its env var", async () => {
    const { dir, cleanup } = await makeFixtureDir();

    vi.stubEnv(
      CODEX_CLI_TRANSPORT.binEnvVar,
      "/nonexistent/producer-pal-codex",
    );

    try {
      await expect(
        spawnAgentCli(CODEX_CLI_TRANSPORT, [], "hi", { cwd: dir }),
      ).rejects.toThrow(
        /codex CLI executable "\/nonexistent\/producer-pal-codex" not found.*CODEX_BIN/s,
      );
    } finally {
      await cleanup();
    }
  });

  it("surfaces the CLI's own error from the end of a failed stream", async () => {
    const { dir, cleanup } = await makeFixtureDir();

    useFixture({
      PPAL_FIXTURE_STDOUT: toJsonl([
        { type: "item.completed", item: { type: "agent_message", text: "hm" } },
        { type: "turn.failed", error: { message: "MCP server unavailable" } },
      ]),
      PPAL_FIXTURE_EXIT_CODE: "1",
    });

    try {
      await expect(
        spawnAgentCli(CODEX_CLI_TRANSPORT, [], "hi", { cwd: dir }),
      ).rejects.toThrow(/codex CLI exited 1.*MCP server unavailable/s);
    } finally {
      await cleanup();
    }
  });

  it("falls back to the stdout tail and stderr when the stream reports nothing", async () => {
    const { dir, cleanup } = await makeFixtureDir();

    useFixture({
      PPAL_FIXTURE_STDOUT: "not json at all\n",
      PPAL_FIXTURE_STDERR: "error: not logged in\n",
      PPAL_FIXTURE_EXIT_CODE: "2",
    });

    try {
      await expect(
        spawnAgentCli(CODEX_CLI_TRANSPORT, [], "hi", { cwd: dir }),
      ).rejects.toThrow(
        /codex CLI exited 2.*stdout: not json at all.*stderr: error: not logged in/s,
      );
    } finally {
      await cleanup();
    }
  });

  it("stops a turn that runs past its step budget", async () => {
    const { dir, cleanup } = await makeFixtureDir();

    // Three completed MCP calls against a budget of two, then a hang: without
    // the budget only the wall-clock timeout would end this.
    useFixture({
      PPAL_FIXTURE_MODE: "hang",
      PPAL_FIXTURE_STDOUT: toJsonl(
        ["call-1", "call-2", "call-3"].map((id) => ({
          type: "item.completed",
          item: { id, type: "mcp_tool_call", tool: "ppal-read-song" },
        })),
      ),
    });

    try {
      await expect(
        spawnAgentCli(CODEX_CLI_TRANSPORT, [], "hi", {
          cwd: dir,
          stepBudget: 2,
        }),
      ).rejects.toThrow("codex CLI hit the step budget of 2 steps");
    } finally {
      await cleanup();
    }
  }, 15_000);

  it("lets a turn that spends its budget exactly finish", async () => {
    const { dir, cleanup } = await makeFixtureDir();
    // One MCP call plus one reply — two steps against a budget of two.
    const stdout = codexTurnStdout("thread-1", "Done.");

    useFixture({ PPAL_FIXTURE_STDOUT: stdout });

    try {
      await expect(
        spawnAgentCli(CODEX_CLI_TRANSPORT, [], "hi", {
          cwd: dir,
          stepBudget: 2,
        }),
      ).resolves.toBe(stdout);
    } finally {
      await cleanup();
    }
  });

  it("times out and escalates past a swallowed SIGTERM", async () => {
    const { dir, cleanup } = await makeFixtureDir();

    // The fixture installs a no-op SIGTERM handler and never exits on its own,
    // so only the SIGKILL escalation can end it. If that were dropped, this
    // promise would never settle. The grace period is shortened so the test
    // doesn't sleep out the real two seconds waiting for the escalation.
    useFixture({ PPAL_FIXTURE_MODE: "ignore-sigterm" });

    try {
      await expect(
        spawnAgentCli(CODEX_CLI_TRANSPORT, [], "hi", {
          cwd: dir,
          timeoutMs: 50,
          sigkillGraceMs: 50,
        }),
      ).rejects.toThrow("codex CLI timed out after 0.05s");
    } finally {
      await cleanup();
    }
  }, 15_000);
});
