// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

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
 * A probe that answers 3349 with this kind and every other port with "none".
 * @param kind - How 3349 answers
 * @returns The probe
 */
function probeWith(
  kind: ProbeResult<string>["kind"],
): (port: number) => Promise<ProbeResult<string>> {
  return vi.fn((port: number) =>
    Promise.resolve<ProbeResult<string>>({
      kind: port === 3349 ? kind : "none",
      info: `ping ${port}`,
    }),
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
    const probe = probeWith("ours");

    expect(await resolveRemoteScriptPort(probe)).toStrictEqual({
      port: 4000,
      info: null,
    });
    expect(probe).not.toHaveBeenCalled();
  });

  it("prefers 3349 when the script answers there, whatever the file says, and hands back the ping", async () => {
    fileState.port = 3351;

    expect(await resolveRemoteScriptPort(probeWith("ours"))).toStrictEqual({
      port: 3349,
      info: "ping 3349",
    });
  });

  it.each(["none", "other"] as const)(
    "uses the file's port when 3349 is %s",
    async (kind) => {
      fileState.port = 3351;

      const found = await resolveRemoteScriptPort(probeWith(kind));

      expect(found).toStrictEqual({ port: 3351, info: null });
    },
  );

  it.each(["none", "other"] as const)(
    "is 3349 when it is %s and there is no file, with the ping that showed it",
    async (kind) => {
      const found = await resolveRemoteScriptPort(probeWith(kind));

      expect(found).toStrictEqual({ port: 3349, info: "ping 3349" });
    },
  );

  it("uses 3349 when it is slow, even with a file naming another port", async () => {
    fileState.port = 3351;

    const found = await resolveRemoteScriptPort(probeWith("slow"));

    expect(found.port).toBe(3349);
  });

  it("doesn't keep a slow 3349, so it looks again next time", async () => {
    fileState.port = 3351;

    await resolveRemoteScriptPort(probeWith("slow"));
    const found = await resolveRemoteScriptPort(probeWith("none"));

    expect(found.port).toBe(3351);
  });

  it("keeps the port with no time limit: later calls don't probe", async () => {
    const probe = probeWith("ours");

    await resolveRemoteScriptPort(probe);
    fileState.port = 3352;
    const later = await resolveRemoteScriptPort(probe);

    expect(later).toStrictEqual({ port: 3349, info: null });
    expect(probe).toHaveBeenCalledTimes(1);
  });

  it("shares one probe between calls made together", async () => {
    const probe = probeWith("slow");

    const found = await Promise.all([
      resolveRemoteScriptPort(probe),
      resolveRemoteScriptPort(probe),
      resolveRemoteScriptPort(probe),
    ]);

    expect(found.map(({ port }) => port)).toStrictEqual([3349, 3349, 3349]);
    expect(probe).toHaveBeenCalledTimes(1);
  });

  it("keeps the file's port too, even if 3349 would answer later", async () => {
    fileState.port = 3351;
    await resolveRemoteScriptPort(probeWith("none"));

    const found = await resolveRemoteScriptPort(probeWith("ours"));

    expect(found.port).toBe(3351);
  });

  it("looks again once told to forget", async () => {
    fileState.port = 3351;
    await resolveRemoteScriptPort(probeWith("none"));

    fileState.port = 3352;
    forgetRemoteScriptPort();

    const found = await resolveRemoteScriptPort(probeWith("none"));

    expect(found.port).toBe(3352);
  });
});
