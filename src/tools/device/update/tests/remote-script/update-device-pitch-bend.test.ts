// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

// A Simpler's `pitchBendRange` and `notePitchBendRange` are `params` entries
// written through the remote script. Each entry comes back like any other
// pseudo-param: its value when it landed, `ok: false` and why when it didn't.

import { beforeEach, describe, expect, it, vi } from "vitest";
import { requestNode } from "#src/live-api-adapter/node-request-v8-protocol.ts";
import { clearMockRegistry } from "#src/test/mocks/mock-registry.ts";
import { REMOTE_SCRIPT_SETUP } from "#src/tools/device/create/helpers/browser-devices.ts";
import { REMOTE_SCRIPT_ROUTES } from "#src/tools/device/create/helpers/remote-script-contract.ts";
import { writePitchBendParams } from "#src/tools/device/update/helpers/call/simpler-pitch-bend.ts";
import { SIMPLER_SETTINGS_ROUTES } from "#src/tools/shared/remote-script/simpler-settings-contract.ts";
import { namedAgain } from "#src/tools/shared/validation/lists/named-targets.ts";
import {
  bend,
  remoteScriptWrites,
  simplerWritesSent,
} from "../../../tests/helpers/simpler-settings-route-fixtures.ts";
import {
  registerCreatedSimpler,
  registerPadRack,
} from "../params/pad-sample/pad-sample-fixtures.ts";
import {
  children,
  livePath,
  registerMockObject,
  registerSimplerDevice,
  updateDevice,
} from "../update-device-test-helpers.ts";

vi.mock(import("#src/live-api-adapter/node-request-v8-protocol.ts"), () => ({
  requestNode: vi.fn(),
  handleNodeResponse: vi.fn(),
}));

const FIRST = String(livePath.track(0).device(0));
const SECOND = String(livePath.track(0).device(1));
const PITCH = { name: "pitchBendRange", value: "12" };
const NOTE = { name: "notePitchBendRange", value: "24" };
const HIT = { id: "simpler-1", path: "t0/d0" };
const NEEDS_IT = `needs the Producer Pal remote script, which isn't answering; ${REMOTE_SCRIPT_SETUP}`;
const NO_ANSWER = "the Producer Pal remote script did not answer in time";

/** Register a second Simpler beside the first. */
function registerSecondSimpler(): void {
  registerMockObject("simpler-2", {
    path: livePath.track(0).device(1),
    type: "SimplerDevice",
    properties: { class_display_name: "Simpler", parameters: [] },
  });
}

/**
 * Update a device. A call that writes pitch bend params answers as a promise
 * whatever the type says, so this takes either and never throws synchronously.
 * @param args - The update-device args
 * @returns What the call answered
 */
async function update(
  args: Parameters<typeof updateDevice>[0],
): Promise<unknown> {
  return await Promise.resolve().then(() => updateDevice(args));
}

/**
 * Answer every remote-script call the same way.
 * @param reply - What `requestNode` resolves with
 */
function remoteScriptAnswers(reply: {
  success: boolean;
  result?: unknown;
}): void {
  vi.mocked(requestNode).mockResolvedValue(
    reply as Awaited<ReturnType<typeof requestNode>>,
  );
}

describe("updateDevice pitch bend params", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearMockRegistry();
    registerSimplerDevice();
  });

  it("writes both through the remote script and reports what they read back", async () => {
    remoteScriptWrites(bend(12, 24));

    expect(
      await update({ id: "simpler-1", params: [PITCH, NOTE] }),
    ).toStrictEqual({
      ...HIT,
      params: [
        { name: "pitchBendRange", value: 12 },
        { name: "notePitchBendRange", value: 24 },
      ],
    });
    expect(simplerWritesSent()).toStrictEqual([
      { devicePath: FIRST, pitchBendRange: 12, notePitchBendRange: 24 },
    ]);
  });

  it("sends only the setting named, whatever the case or spacing", async () => {
    remoteScriptWrites(bend(5, 0));

    await update({
      id: "simpler-1",
      params: [{ name: "  NOTEpitchBENDrange ", value: " 0 " }],
    });

    expect(simplerWritesSent()).toStrictEqual([
      { devicePath: FIRST, notePitchBendRange: 0 },
    ]);
  });

  it("writes only the last entry for a setting named twice", async () => {
    remoteScriptWrites(bend(12, 48));

    expect(
      await update({
        id: "simpler-1",
        params: [{ name: "pitchBendRange", value: "3" }, PITCH],
      }),
    ).toStrictEqual({
      ...HIT,
      params: [
        { name: "pitchBendRange", detail: namedAgain('"pitchBendRange"') },
        { name: "pitchBendRange", value: 12 },
      ],
    });
    expect(simplerWritesSent()).toHaveLength(1);
  });

  it("goes along with the rest of the update, one write per Simpler", async () => {
    registerSecondSimpler();
    remoteScriptWrites(bend(12, 48));

    expect(
      await update({
        id: "simpler-1,simpler-2",
        name: "Lead",
        params: [PITCH],
      }),
    ).toStrictEqual([
      { ...HIT, params: [{ name: "pitchBendRange", value: 12 }] },
      {
        id: "simpler-2",
        path: "t0/d1",
        params: [{ name: "pitchBendRange", value: 12 }],
      },
    ]);
    expect(simplerWritesSent().map((write) => write.devicePath)).toStrictEqual([
      FIRST,
      SECOND,
    ]);
  });

  it("refuses a value that isn't a whole number in range, and doesn't send it", async () => {
    remoteScriptWrites(bend(12, 48));

    expect(
      await update({
        id: "simpler-1",
        params: [PITCH, { name: "notePitchBendRange", value: "49" }],
      }),
    ).toStrictEqual({
      ...HIT,
      params: [
        { name: "pitchBendRange", value: 12 },
        {
          name: "notePitchBendRange",
          ok: false,
          detail: 'notePitchBendRange must be an integer 0-48 (got "49")',
        },
      ],
    });
    expect(simplerWritesSent()).toStrictEqual([
      { devicePath: FIRST, pitchBendRange: 12 },
    ]);
    await expect(
      update({
        id: "simpler-1",
        params: [{ name: "pitchBendRange", value: "1.5" }],
      }),
    ).rejects.toThrow('pitchBendRange must be an integer 0-24 (got "1.5")');
  });

  it("says where a setting landed when it reads back different", async () => {
    remoteScriptWrites(bend(11, 24));

    expect(
      await update({ id: "simpler-1", params: [PITCH, NOTE] }),
    ).toStrictEqual({
      ...HIT,
      params: [
        { name: "pitchBendRange", ok: false, detail: "landed at 11, not 12" },
        { name: "notePitchBendRange", value: 24 },
      ],
    });
  });

  it("writes them after loading a preset in the same call", async () => {
    vi.mocked(requestNode).mockImplementation(async (route) => ({
      success: true,
      result:
        route === REMOTE_SCRIPT_ROUTES.resolvePreset
          ? {
              available: true,
              item: {
                type: "instrument",
                path: "Simpler/A.adv",
                name: "A.adv",
              },
            }
          : route === SIMPLER_SETTINGS_ROUTES.write
            ? { available: true, result: bend(12, 48) }
            : { available: true, replaced: false },
    }));

    expect(
      await update({ id: "simpler-1", preset: "A", params: [PITCH] }),
    ).toStrictEqual({
      ...HIT,
      params: [{ name: "pitchBendRange", value: 12 }],
    });
    expect(
      vi.mocked(requestNode).mock.calls.map(([route]) => route),
    ).toStrictEqual([
      REMOTE_SCRIPT_ROUTES.resolvePreset,
      REMOTE_SCRIPT_ROUTES.hotswap,
      SIMPLER_SETTINGS_ROUTES.write,
    ]);
  });
});

describe("updateDevice pitch bend params without a good answer", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearMockRegistry();
    registerSimplerDevice();
  });

  it("refuses a lone target without the remote script, saying what it needs", async () => {
    remoteScriptAnswers({ success: true, result: { available: false } });

    await expect(update({ id: "simpler-1", params: [PITCH] })).rejects.toThrow(
      `no param landed — "pitchBendRange": ${NEEDS_IT}`,
    );
  });

  it("keeps the rest of the update and says so in the entry", async () => {
    remoteScriptAnswers({ success: true, result: { available: false } });

    expect(
      await update({ id: "simpler-1", name: "Lead", params: [PITCH] }),
    ).toStrictEqual({
      ...HIT,
      params: [{ name: "pitchBendRange", ok: false, detail: NEEDS_IT }],
    });
  });

  it("says why when the remote script refuses", async () => {
    remoteScriptAnswers({
      success: true,
      result: { available: true, error: "'Reverb' is not a Simpler" },
    });

    await expect(update({ id: "simpler-1", params: [NOTE] })).rejects.toThrow(
      `"notePitchBendRange": not set: 'Reverb' is not a Simpler`,
    );
  });

  it("keeps the entry and says the write may have landed when it times out", async () => {
    remoteScriptAnswers({ success: false });

    expect(
      await update({ id: "simpler-1", params: [PITCH, NOTE] }),
    ).toStrictEqual({
      ...HIT,
      detail: expect.stringContaining("already changed: pitch bend range"),
    });
  });

  it("keeps the entry when the route throws", async () => {
    vi.mocked(requestNode).mockRejectedValue(new Error("channel closed"));

    expect(await update({ id: "simpler-1", params: [PITCH] })).toStrictEqual({
      ...HIT,
      detail: expect.stringContaining(
        `may have changed: ${NO_ANSWER} (channel closed); read the device to check`,
      ),
    });
  });

  it("doesn't ask again for the Simplers after one that got no answer", async () => {
    registerSecondSimpler();
    remoteScriptAnswers({ success: false });

    const result = (await update({
      id: "simpler-1,simpler-2",
      name: "Lead",
      params: [PITCH],
    })) as Array<{ params: unknown[] }>;

    expect(vi.mocked(requestNode)).toHaveBeenCalledTimes(1);
    expect(result[0]?.params).toStrictEqual([
      {
        name: "pitchBendRange",
        ok: false,
        detail: `may have changed: ${NO_ANSWER}; read the device to check`,
      },
    ]);
    expect(result[1]?.params).toStrictEqual([
      {
        name: "pitchBendRange",
        ok: false,
        detail:
          "not set: the remote script didn't answer an earlier Simpler's write; re-run for this target",
      },
    ]);
  });
});

describe("writePitchBendParams out of time", () => {
  it("writes nothing, and holds back the Simplers after it", async () => {
    const stall: { reason?: string } = {};
    const simpler = { type: "SimplerDevice", path: FIRST } as LiveAPI;
    const entry = { name: "pitchBendRange", value: "12" };
    const settled = await writePitchBendParams(simpler, [entry], stall, {
      deadline: Date.now() - 1,
      landed: vi.fn(),
    });

    expect(settled?.get(entry)).toStrictEqual([
      {
        name: "pitchBendRange",
        ok: false,
        detail: "not set: the request ran out of time; re-run for this target",
      },
    ]);
    expect(stall.reason).toBe(
      "not set: the request ran out of time; re-run for this target",
    );
    expect(requestNode).not.toHaveBeenCalled();
  });
});

describe("pitch bend params on a target that isn't a Simpler", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearMockRegistry();
  });

  it("isn't asked of the remote script on a device that has no such param", () => {
    registerMockObject("synth", {
      path: livePath.track(0).device(0),
      type: "WavetableDevice",
      properties: { class_display_name: "Wavetable", parameters: [] },
    });

    expect(() => updateDevice({ id: "synth", params: [PITCH] })).toThrow(
      /pitchBendRange/,
    );
    expect(requestNode).not.toHaveBeenCalled();
  });

  it("is refused on a pad, which isn't a device", () => {
    registerPadRack();

    expect(() => updateDevice({ path: "t0/d0/pC1", params: [PITCH] })).toThrow(
      /pitchBendRange/,
    );
    expect(requestNode).not.toHaveBeenCalled();
  });

  it("is refused through a rack's pad shortcut, naming where to set it", () => {
    const [chain] = registerPadRack();

    (chain as { properties: Record<string, unknown> }).properties.devices =
      children("new-simpler");
    registerCreatedSimpler();

    expect(() =>
      updateDevice({
        path: "t0/d0",
        params: [
          { name: "pC1/d0/pitchBendRange", value: "12" },
          { name: "pC1/d0/notePitchBendRange", value: "12" },
        ],
      }),
    ).toThrow(
      /"pC1\/d0\/pitchBendRange": can only be set with ppal-update-device on the Simpler's own path, and needs the Producer Pal remote script; "pC1\/d0\/notePitchBendRange": can only/,
    );
    expect(requestNode).not.toHaveBeenCalled();
  });
});
