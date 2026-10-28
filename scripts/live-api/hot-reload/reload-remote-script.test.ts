// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  type RemoteScriptReply,
  remoteScriptRequest,
} from "#src/mcp-server/rpc/remote-script/remote-script-client.ts";
import { RemoteScriptTimeout } from "#src/mcp-server/rpc/remote-script/remote-script-errors.ts";
import { describeReload, reloadRemoteScript } from "./reload-remote-script.ts";
import { hashRemoteScript } from "./source-hash.ts";

vi.mock(
  import("#src/mcp-server/rpc/remote-script/remote-script-client.ts"),
  async (importOriginal) => ({
    ...(await importOriginal()),
    remoteScriptRequest: vi.fn(),
  }),
);

const request = vi.mocked(remoteScriptRequest);

let dir: string;
let installedHash: string;

/**
 * Make the next /reload answer.
 * @param status - HTTP status
 * @param body - JSON body
 */
function answer(status: number, body: Record<string, unknown>): void {
  request.mockResolvedValue({ available: true, status, body });
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "reload-remote-script-"));
  writeFileSync(join(dir, "routes.py"), "ROUTES = {}\n");
  installedHash = hashRemoteScript(dir);
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
  vi.resetAllMocks();
});

describe("reloadRemoteScript", () => {
  it("posts to /reload", async () => {
    answer(200, { hash: installedHash, reloaded: [] });

    await reloadRemoteScript(dir);

    expect(request).toHaveBeenCalledWith(
      expect.objectContaining({ method: "POST", route: "/reload" }),
    );
  });

  it("reports the modules reloaded when the hash matches what was installed", async () => {
    answer(200, { hash: installedHash, reloaded: ["version", "routes"] });

    expect(await reloadRemoteScript(dir)).toStrictEqual({
      kind: "reloaded",
      modules: ["version", "routes"],
    });
  });

  it("reports a hash mismatch", async () => {
    answer(200, { hash: "f".repeat(64), reloaded: ["routes"] });

    expect(await reloadRemoteScript(dir)).toStrictEqual({
      kind: "hash-mismatch",
      installed: installedHash,
      running: "f".repeat(64),
    });
  });

  it("treats a missing hash as a mismatch", async () => {
    answer(200, { reloaded: ["routes"] });

    const outcome = await reloadRemoteScript(dir);

    expect(outcome.kind).toBe("hash-mismatch");
  });

  it("reports nothing listening", async () => {
    request.mockResolvedValue({ available: false } as RemoteScriptReply);

    expect(await reloadRemoteScript(dir)).toStrictEqual({
      kind: "not-running",
    });
  });

  it("reports a script that is out of date as having no /reload route", async () => {
    request.mockResolvedValue({
      available: false,
      outdated: "out of date",
    } as RemoteScriptReply);

    expect(await reloadRemoteScript(dir)).toStrictEqual({ kind: "no-route" });
  });

  it("reports a script with no /reload route", async () => {
    answer(404, { error: "unknown route: /reload" });

    expect(await reloadRemoteScript(dir)).toStrictEqual({ kind: "no-route" });
  });

  it("reports a failed reload with its traceback", async () => {
    answer(500, { error: "reload failed in routes", traceback: "Trace" });

    expect(await reloadRemoteScript(dir)).toStrictEqual({
      kind: "failed",
      error: "reload failed in routes",
      traceback: "Trace",
    });
  });

  it("reports a failure that carries no message", async () => {
    answer(500, {});

    expect(await reloadRemoteScript(dir)).toStrictEqual({
      kind: "failed",
      error: "reload failed",
      traceback: null,
    });
  });

  it("reports another status", async () => {
    answer(403, { error: "refused" });

    expect(await reloadRemoteScript(dir)).toStrictEqual({
      kind: "unexpected",
      status: 403,
    });
  });

  it("reports a timeout", async () => {
    request.mockRejectedValue(new RemoteScriptTimeout("too slow", true));

    expect(await reloadRemoteScript(dir)).toStrictEqual({
      kind: "timeout",
      message: "too slow",
    });
  });

  it("lets other errors through", async () => {
    request.mockRejectedValue(new Error("socket hang up"));

    await expect(reloadRemoteScript(dir)).rejects.toThrow("socket hang up");
  });
});

describe("describeReload", () => {
  it("calls a matching reload ok", () => {
    const result = describeReload({ kind: "reloaded", modules: ["routes"] });

    expect(result.ok).toBe(true);
    expect(result.message).toContain("routes");
  });

  it.each([
    [{ kind: "not-running" }, "Live isn't running"],
    [{ kind: "no-route" }, "--probe and restart Live once"],
    [{ kind: "timeout", message: "slow" }, "slow"],
    [
      { kind: "failed", error: "reload failed in routes", traceback: "Trace" },
      "still running the previous code",
    ],
    [
      { kind: "failed", error: "reload failed in routes", traceback: null },
      "reload failed in routes",
    ],
    [
      {
        kind: "hash-mismatch",
        installed: "a".repeat(64),
        running: "b".repeat(64),
      },
      "Hash mismatch",
    ],
    [{ kind: "unexpected", status: 403 }, "status 403"],
  ] as const)("explains %j", (outcome, text) => {
    const result = describeReload(outcome);

    expect(result.ok).toBe(false);
    expect(result.message).toContain(text);
  });

  it("includes the traceback of a failed reload", () => {
    const { message } = describeReload({
      kind: "failed",
      error: "reload failed in routes",
      traceback: "Traceback: boom",
    });

    expect(message).toContain("Traceback: boom");
  });
});
