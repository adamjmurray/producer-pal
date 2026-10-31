// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

// A hosted plug-in's wrapper takes `params` by the plug-in's own names and
// `h<number>` ids, in the units the plug-in displays. One request goes to the
// wrapper for the whole list, and each entry comes back like any other param's.

import { beforeEach, describe, expect, it, vi } from "vitest";
import { installCapturingTask } from "#src/live-api-adapter/protocols/tests/v8-protocol-test-helpers.ts";
import { clearMockRegistry } from "#src/test/mocks/mock-registry.ts";
import {
  type WrapperMessage,
  infoReply,
  installWrapper,
  registerWrapperDevice,
} from "#src/tools/device/tests/helpers/plugin-host-wrapper-fixtures.ts";
import { writeHostedParams } from "../../helpers/call/hosted-params.ts";
import { livePath, updateDevice } from "../update-device-test-helpers.ts";

const PATH = String(livePath.track(0).device(0));
const HIT = { id: "device-123", path: "t0/d0" };
const UNANSWERED =
  'no param landed — "Mix": may have changed: the hosted plug-in didn\'t answer; read the device to check; already changed: params';

const landed = (index: number, name: string, display: string) => ({
  ok: true,
  index,
  name,
  value: 0.5,
  display,
});

/**
 * Answer `info` as a wrapper hosting a plug-in, and `write` with these results.
 * @param results - One per entry sent
 * @returns The requests the bus heard
 */
function wrapperWrites(results: WrapperMessage[]): WrapperMessage[] {
  return installWrapper({
    info: () => infoReply("Serum 2"),
    write: () => ({ success: true, params: results }),
  });
}

/**
 * @param args - The update-device args
 * @returns What the call answered; a call that writes hosted params is async
 */
async function update(
  args: Parameters<typeof updateDevice>[0],
): Promise<unknown> {
  return await Promise.resolve().then(() => updateDevice(args));
}

/**
 * Set Mix on the given devices with a wrapper that never answers the write.
 *
 * @param id - The update-device id (comma-separated for several)
 * @returns What the call answered once the write timed out
 */
async function updateUnanswered(id: string): Promise<unknown> {
  const callbacks: Array<() => void> = [];
  const restore = installCapturingTask(callbacks);

  try {
    const pending = update({ id, params: [{ name: "Mix", value: "75" }] });

    await vi.waitFor(() => expect(callbacks.length).toBeGreaterThan(0));
    callbacks.at(-1)?.();

    return await pending;
  } finally {
    restore();
  }
}

/**
 * Set Mix on device-123 straight through writeHostedParams.
 * @param stall - Why earlier writes stalled, if they did
 * @param deadline - The request deadline
 * @returns What settled for the entry
 */
async function writeMix(
  stall: { reason?: string },
  deadline: number | undefined,
): Promise<unknown> {
  const entry = { name: "Mix", value: "75" };
  const settled = await writeHostedParams(
    LiveAPI.from("id device-123"),
    [entry],
    stall,
    { deadline, landed: vi.fn() },
  );

  return settled?.get(entry);
}

describe("updateDevice hosted plug-in params", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearMockRegistry();
    registerWrapperDevice({ path: PATH });
  });

  it("sends the whole list in one request, by name or h id, with the value as text and number", async () => {
    const heard = wrapperWrites([
      landed(24, "Mix", "75.00"),
      landed(5, "Time Base", "1/16"),
    ]);

    await update({
      id: "device-123",
      params: [
        { name: "Mix", value: "75" },
        { id: "h5", value: "1/16" },
      ],
    });

    expect(heard.filter((request) => request.op === "write")).toStrictEqual([
      {
        deviceId: "device-123",
        op: "write",
        params: [
          { name: "Mix", text: "75", number: 75 },
          { index: 5, text: "1/16" },
        ],
      },
    ]);
  });

  it("reports only identity for a bare number that displays as asked", async () => {
    wrapperWrites([landed(24, " Mix ", "75.00")]);

    expect(
      await update({
        id: "device-123",
        params: [{ name: "Mix", value: "75" }],
      }),
    ).toStrictEqual({ ...HIT, params: [{ id: "h24", name: "Mix" }] });
  });

  it("reports what a bare number landed at, and says so", async () => {
    wrapperWrites([landed(1, "Frequency", "100.00")]);

    expect(
      await update({
        id: "device-123",
        params: [{ name: "Frequency", value: "123.456" }],
      }),
    ).toStrictEqual({
      ...HIT,
      params: [
        {
          id: "h1",
          name: "Frequency",
          value: "100.00",
          detail: "value read back as shown, not as sent",
        },
      ],
    });
  });

  it("always reports a value written as text", async () => {
    wrapperWrites([
      landed(4, "Waveform", "Triangle"),
      landed(26, "Output Gain", "-6.00 dB"),
    ]);

    expect(
      await update({
        id: "device-123",
        params: [
          { name: "Waveform", value: "Triangle" },
          { name: "Output Gain", value: "-6 dB" },
        ],
      }),
    ).toStrictEqual({
      ...HIT,
      params: [
        { id: "h4", name: "Waveform", value: "Triangle" },
        { id: "h26", name: "Output Gain", value: "-6.00 dB" },
      ],
    });
  });

  it("skips an id that isn't an h id, without sending it", async () => {
    const heard = wrapperWrites([landed(24, "Mix", "75.00")]);

    expect(
      await update({
        id: "device-123",
        params: [
          { id: "310", value: "1" },
          { name: "Mix", value: "75" },
        ],
      }),
    ).toStrictEqual({
      ...HIT,
      params: [
        {
          id: "310",
          ok: false,
          detail: "not a hosted plug-in's param id (they look like h56)",
        },
        { id: "h24", name: "Mix" },
      ],
    });
    expect(heard.at(-1)?.params as unknown[]).toHaveLength(1);
  });

  it("skips a param the plug-in doesn't have, by name or id", async () => {
    wrapperWrites([
      { ok: false, kind: "missing", error: "no param with that name" },
      { ok: false, kind: "missing", error: "no param 9999" },
      landed(24, "Mix", "75.00"),
    ]);

    expect(
      await update({
        id: "device-123",
        params: [
          { name: "nope", value: "1" },
          { id: "h9999", value: "1" },
          { name: "Mix", value: "75" },
        ],
      }),
    ).toStrictEqual({
      ...HIT,
      params: [
        {
          name: "nope",
          ok: false,
          detail: "not found on t0/d0 (id device-123)",
        },
        {
          id: "h9999",
          ok: false,
          detail: "not found on t0/d0 (id device-123)",
        },
        { id: "h24", name: "Mix" },
      ],
    });
  });

  it("refuses a name that more than one param has, naming the ids", async () => {
    wrapperWrites([
      {
        ok: false,
        kind: "ambiguous",
        error: "more than one param has that name",
        matches: [
          { index: 12, name: "Width" },
          { index: 40, name: "Width" },
        ],
      },
      landed(24, "Mix", "75.00"),
    ]);

    const result = (await update({
      id: "device-123",
      params: [
        { name: "Width", value: "1" },
        { name: "Mix", value: "75" },
      ],
    })) as { params: unknown[] };

    expect(result.params[0]).toStrictEqual({
      name: "Width",
      ok: false,
      detail:
        "names 2 params on t0/d0 (id device-123) (h12, h40), so nothing was written. Send {id, value} to pick one.",
    });
  });

  it("still refuses an ambiguous name when the wrapper lists no matches", async () => {
    wrapperWrites([
      { ok: false, kind: "ambiguous", error: "more than one param" },
    ]);

    await expect(
      update({ id: "device-123", params: [{ name: "Width", value: "1" }] }),
    ).rejects.toThrow(/"Width": names 0 params .*so nothing was written/);
  });

  it("says what a param does show when nothing displays as asked", async () => {
    wrapperWrites([
      {
        ok: false,
        kind: "nomatch",
        error: 'nothing displays as "Bogus"; it shows values like A, B',
      },
    ]);

    await expect(
      update({ id: "device-123", params: [{ name: "Type", value: "Bogus" }] }),
    ).rejects.toThrow(
      'no param landed — "Type": not set: nothing displays as "Bogus"; it shows values like A, B',
    );
  });

  it("writes only the last of entries that reach one param", async () => {
    wrapperWrites([
      { superseded: 1, index: 8, name: "Tap Left" },
      landed(8, "Tap Left", "60.00"),
    ]);

    expect(
      await update({
        id: "device-123",
        params: [
          { name: "Tap Left", value: "40" },
          { id: "h8", value: "60" },
        ],
      }),
    ).toStrictEqual({
      ...HIT,
      params: [
        { name: "Tap Left", detail: "named again as id h8 later in this call" },
        { id: "h8", name: "Tap Left" },
      ],
    });
  });

  it("fails the earlier entry too when the one that replaces it landed nothing", async () => {
    wrapperWrites([
      { superseded: 1, index: 8, name: "Tap Left" },
      { ok: false, kind: "nomatch", error: "nothing displays as x" },
    ]);

    await expect(
      update({
        id: "device-123",
        params: [
          { name: "Tap Left", value: "40" },
          { name: "tap left", value: "x" },
        ],
      }),
    ).rejects.toThrow(
      '"Tap Left": not written: "tap left" was meant to replace it, but failed; "tap left": not set: nothing displays as x',
    );
  });

  it("tells the wrapper's whole answer is missing when it is short", async () => {
    wrapperWrites([]);

    await expect(
      update({ id: "device-123", params: [{ name: "Mix", value: "75" }] }),
    ).rejects.toThrow(
      'no param landed — "Mix": not set: the hosted plug-in didn\'t answer',
    );
  });

  it("reports an error the wrapper gave", async () => {
    installWrapper({
      info: () => infoReply("Serum 2"),
      write: () => ({ success: false, error: "something broke" }),
    });

    await expect(
      update({ id: "device-123", params: [{ name: "Mix", value: "75" }] }),
    ).rejects.toThrow('no param landed — "Mix": not set: something broke');
  });

  it("tells the answer is missing when the wrapper sends no results", async () => {
    installWrapper({
      info: () => infoReply("Serum 2"),
      write: () => ({ success: true }),
    });

    await expect(
      update({ id: "device-123", params: [{ name: "Mix", value: "75" }] }),
    ).rejects.toThrow(
      'no param landed — "Mix": not set: the hosted plug-in didn\'t answer',
    );
  });

  it("says the write failed when the wrapper gives no error, naming an h id entry by id", async () => {
    installWrapper({
      info: () => infoReply("Serum 2"),
      write: () => ({ success: false }),
    });

    await expect(
      update({ id: "device-123", params: [{ id: "h5", value: "1/16" }] }),
    ).rejects.toThrow('no param landed — "h5": not set: write failed');
  });

  it("reports an empty value for a param that shows no text", async () => {
    wrapperWrites([{ ok: true, index: 3, name: "Wave", value: 0 }]);

    expect(
      await update({
        id: "device-123",
        params: [{ name: "Wave", value: "Saw" }],
      }),
    ).toStrictEqual({
      ...HIT,
      params: [{ id: "h3", name: "Wave", value: "" }],
    });
  });

  it("tells a wrapper that doesn't know the write to be made again", async () => {
    installWrapper({
      info: () => infoReply("Serum 2"),
      write: () => ({ success: false, error: "unknown op: write" }),
    });

    await expect(
      update({ id: "device-123", params: [{ name: "Mix", value: "75" }] }),
    ).rejects.toThrow(
      'no param landed — "Mix": not set: this wrapper is out of date; create the hosted plug-in again',
    );
  });

  it("says a write may have landed when the wrapper never answers, and tries no more", async () => {
    installWrapper({ info: () => infoReply("Serum 2") });

    expect(await updateUnanswered("device-123")).toStrictEqual({
      ...HIT,
      detail: UNANSWERED,
    });
  });

  it("tries no later device once one has not answered", async () => {
    registerWrapperDevice({
      id: "device-456",
      path: String(livePath.track(0).device(1)),
    });
    const heard = installWrapper({ info: () => infoReply("Serum 2") });

    expect(await updateUnanswered("device-123,device-456")).toStrictEqual([
      {
        id: "device-123",
        path: "t0/d0",
        detail: UNANSWERED,
      },
      {
        id: "device-456",
        ok: false,
        detail:
          "no param landed — \"Mix\": not set: the hosted plug-in didn't answer an earlier device's write; re-run for this target",
      },
    ]);
    expect(heard.filter((request) => request.op === "write")).toHaveLength(1);
  });

  it("leaves a Max device that isn't a wrapper to the usual write", async () => {
    installWrapper({});

    await expect(
      update({ id: "device-123", params: [{ name: "Mix", value: "75" }] }),
    ).rejects.toThrow(
      'no param landed — "Mix": not found on t0/d0 (id device-123)',
    );
  });

  it("leaves a wrapper to the usual write when hosting is built off", async () => {
    vi.stubEnv("ENABLE_HOSTED_PLUGINS", "");
    const heard = wrapperWrites([landed(24, "Mix", "75.00")]);

    try {
      await expect(
        update({ id: "device-123", params: [{ name: "Mix", value: "75" }] }),
      ).rejects.toThrow(
        'no param landed — "Mix": not found on t0/d0 (id device-123)',
      );
      expect(heard).toStrictEqual([]);
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("sends nothing once the request is out of time", async () => {
    const heard = wrapperWrites([landed(24, "Mix", "75.00")]);
    const settled = await writeMix({}, Date.now() - 1);

    expect(settled).toStrictEqual([
      {
        name: "Mix",
        ok: false,
        detail: "not set: the request ran out of time; re-run for this target",
      },
    ]);
    expect(heard.filter((request) => request.op === "write")).toStrictEqual([]);
  });

  it("sends nothing once an earlier write stalled", async () => {
    wrapperWrites([landed(24, "Mix", "75.00")]);

    const settled = await writeMix(
      { reason: "not set: stalled earlier" },
      undefined,
    );

    expect(settled).toStrictEqual([
      { name: "Mix", ok: false, detail: "not set: stalled earlier" },
    ]);
  });

  it("sends nothing when every entry was skipped", async () => {
    const heard = wrapperWrites([]);

    await expect(
      update({ id: "device-123", params: [{ id: "310", value: "1" }] }),
    ).rejects.toThrow("not a hosted plug-in's param id");
    expect(heard.filter((request) => request.op === "write")).toStrictEqual([]);
  });

  it("gives the wrapper what is left of the request's time", async () => {
    wrapperWrites([landed(24, "Mix", "75.00")]);

    const settled = await writeMix({}, Date.now() + 10_000);

    expect(settled).toStrictEqual([
      { id: "h24", name: "Mix", reported: { id: "h24", name: "Mix" } },
    ]);
  });

  it("does nothing for a target with no params", () => {
    expect(
      writeHostedParams(
        LiveAPI.from("id device-123"),
        [],
        {},
        {
          deadline: undefined,
          landed: vi.fn(),
        },
      ),
    ).toBeUndefined();
  });
});
