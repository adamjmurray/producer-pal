// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  type ProbeResult,
  forgetRemoteScriptPort,
  remoteScriptPortFromEnv,
  resolveRemoteScriptPort,
} from "../remote-script-port.ts";

const fileState = vi.hoisted(() => ({ port: null as number | null }));

vi.mock(import("../remote-script-port-file.ts"), () => ({
  REMOTE_SCRIPT_DEFAULT_PORT: 3349,
  remoteScriptPortFromFile: () => fileState.port,
}));

let savedEnv: string | undefined;

beforeEach(() => {
  savedEnv = process.env.PPAL_REMOTE_SCRIPT_PORT;
  delete process.env.PPAL_REMOTE_SCRIPT_PORT;
  fileState.port = null;
  forgetRemoteScriptPort();
});

afterEach(() => {
  if (savedEnv == null) {
    delete process.env.PPAL_REMOTE_SCRIPT_PORT;
  } else {
    process.env.PPAL_REMOTE_SCRIPT_PORT = savedEnv;
  }

  forgetRemoteScriptPort();
});

/**
 * A probe that answers 3349 with this result and every other port with "none".
 * @param result - How 3349 answers
 * @returns The probe
 */
function probeWith(
  result: ProbeResult<string>,
): (port: number) => Promise<ProbeResult<string>> {
  return vi.fn((port: number) =>
    Promise.resolve<ProbeResult<string>>(
      port === 3349 ? result : { kind: "none" },
    ),
  );
}

describe("remoteScriptPortFromEnv", () => {
  it.each([
    ["3355", 3355],
    ["0", 0],
    [" 3355 ", 3355],
  ])("reads %j", (raw, expected) => {
    process.env.PPAL_REMOTE_SCRIPT_PORT = raw;

    expect(remoteScriptPortFromEnv()).toBe(expected);
  });

  it.each(["", "  ", "abc", "-1", "33.5"])("ignores %j", (raw) => {
    process.env.PPAL_REMOTE_SCRIPT_PORT = raw;

    expect(remoteScriptPortFromEnv()).toBeNull();
  });

  it("is null when unset", () => {
    expect(remoteScriptPortFromEnv()).toBeNull();
  });
});

describe("resolveRemoteScriptPort", () => {
  it("uses the env port without asking anyone", async () => {
    process.env.PPAL_REMOTE_SCRIPT_PORT = "4000";
    fileState.port = 3351;
    const probe = probeWith({ kind: "ours", info: "ping" });

    expect(await resolveRemoteScriptPort(probe)).toStrictEqual({
      port: 4000,
      info: null,
    });
    expect(probe).not.toHaveBeenCalled();
  });

  it("prefers 3349 when the script answers there, whatever the file says, and hands back the ping", async () => {
    fileState.port = 3351;

    expect(
      await resolveRemoteScriptPort(probeWith({ kind: "ours", info: "ping" })),
    ).toStrictEqual({ port: 3349, info: "ping" });
  });

  it.each(["none", "other"] as const)(
    "uses the file's port when 3349 is %s",
    async (kind) => {
      fileState.port = 3351;

      const found = await resolveRemoteScriptPort(probeWith({ kind }));

      expect(found).toStrictEqual({ port: 3351, info: null });
    },
  );

  it.each(["none", "other"] as const)(
    "is 3349 when it is %s and there is no file",
    async (kind) => {
      const found = await resolveRemoteScriptPort(probeWith({ kind }));

      expect(found.port).toBe(3349);
    },
  );

  it("uses 3349 when it is slow, even with a file naming another port", async () => {
    fileState.port = 3351;

    const found = await resolveRemoteScriptPort(probeWith({ kind: "slow" }));

    expect(found).toStrictEqual({ port: 3349, info: null });
  });

  it("doesn't remember a slow 3349, so it looks again next time", async () => {
    fileState.port = 3351;
    const slow = probeWith({ kind: "slow" });

    await resolveRemoteScriptPort(slow, 1000);

    expect(
      await resolveRemoteScriptPort(probeWith({ kind: "none" }), 1001),
    ).toStrictEqual({ port: 3351, info: null });
  });

  it("keeps the answer for a few seconds, then looks again", async () => {
    const probe = probeWith({ kind: "none" });

    fileState.port = 3351;
    const first = await resolveRemoteScriptPort(probe, 1000);

    fileState.port = 3352;
    const soon = await resolveRemoteScriptPort(probe, 2000);

    expect([first.port, soon.port]).toStrictEqual([3351, 3351]);
    expect(probe).toHaveBeenCalledTimes(1);

    const later = await resolveRemoteScriptPort(probe, 7000);

    expect(later.port).toBe(3352);
  });

  it("looks again right away once told to forget", async () => {
    fileState.port = 3351;
    await resolveRemoteScriptPort(probeWith({ kind: "none" }), 1000);

    fileState.port = 3352;
    forgetRemoteScriptPort();

    const found = await resolveRemoteScriptPort(
      probeWith({ kind: "none" }),
      1001,
    );

    expect(found.port).toBe(3352);
  });
});
