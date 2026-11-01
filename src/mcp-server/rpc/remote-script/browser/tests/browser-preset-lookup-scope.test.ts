// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { gzipSync } from "node:zlib";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { type PresetScope } from "#src/tools/device/create/helpers/remote-script-contract.ts";
import { findPresetFiles } from "../../../../live-library/query/preset-files.ts";
import { lookUpBrowserPreset } from "../browser-preset-lookup.ts";
import { RemoteScriptTimeout } from "../../remote-script-errors.ts";
import { type FakeRemoteScript } from "../../tests/remote-script-test-helpers.ts";
import { usePresetLookupStandIn } from "./preset-lookup-test-helpers.ts";

vi.mock(import("../../../../live-library/query/preset-files.ts"), () => ({
  findPresetFiles: vi.fn(),
}));
vi.mock(import("../../../../live-library/query/pack-folder-names.ts"), () => ({
  browserNamedPackPath: (path: string) => Promise.resolve(path),
}));

const DRIFT: PresetScope = {
  type: "instrument",
  path: "Drift",
  device: "Drift",
};
const DRUM_RACK: PresetScope = {
  type: "instrument",
  path: "Drum Rack",
  device: "Drum Rack",
};
const VIBRAPHONE = "Instruments/Instrument Rack/Mallets/Vibraphone.adg";
const KIT = "Instruments/Instrument Rack/Sampled/Beard Kit.adg";

const standIn = usePresetLookupStandIn();
let dir = "";

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), "ppal-preset-scope-"));
});

afterAll(() => {
  rmSync(dir, { recursive: true, force: true });
});

/**
 * @param error - The refusal's text
 * @returns The resolution carrying it
 */
function refusal(error: string): { available: true; error: string } {
  return { available: true, error };
}

/**
 * @param path - A preset file's absolute path
 * @returns The resolution that loads it
 */
function loads(path: string): unknown {
  return {
    available: true,
    item: { type: "file", path, name: "Beard Kit.adg" },
  };
}

/**
 * Stand up a browser whose every folder lists these items.
 * @param items - What a folder lists
 * @returns The stand-in, to read the requests it got
 */
async function browserListing(items: object[]): Promise<FakeRemoteScript> {
  return await standIn.start(() => ({ body: { items } }));
}

/**
 * Write a rack file under the temp folder.
 * @param file - Its path below the folder
 * @param firstDevice - The class of the first device in its first chain
 * @returns The file's absolute path
 */
function rack(file: string, firstDevice: string): string {
  const path = join(dir, file);
  const body =
    '<GroupDevicePreset><Device><InstrumentGroupDevice Id="0"></InstrumentGroupDevice></Device>' +
    `<BranchPresets><InstrumentBranchPreset Id="0"><DevicePresets><AbletonDevicePreset Id="0"><Device><${firstDevice} Id="0"></${firstDevice}></Device></AbletonDevicePreset></DevicePresets></InstrumentBranchPreset></BranchPresets></GroupDevicePreset>`;

  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(
    path,
    gzipSync(
      `<?xml version="1.0"?>\n<Ableton MajorVersion="5">${body}</Ableton>`,
    ),
  );

  return path;
}

/**
 * @param path - A rack file's absolute path
 * @returns The library's entry for it
 */
function inLibrary(path: string): { name: string; path: string } {
  return { name: path.split("/").at(-1) as string, path };
}

/**
 * @param path - The browser path
 * @param scope - The device the call named
 * @returns The lookup's answer
 */
async function lookUp(
  path: string,
  scope: PresetScope,
): Promise<Awaited<ReturnType<typeof lookUpBrowserPreset>>> {
  return await lookUpBrowserPreset(path, scope, Date.now() + 60_000);
}

describe("lookUpBrowserPreset — a browser path is checked before it is listed", () => {
  const SHARED = [
    { name: "Vibraphone.adg", path: "Instrument Rack/Mallets/Vibraphone.adg" },
    { name: "Vibraphone.adg", path: "Instrument Rack/Mallets/Vibraphone.adg" },
  ];

  it("refuses a shared path outside the device for that, without listing it", async () => {
    const remote = await browserListing(SHARED);

    expect(await lookUp(VIBRAPHONE, DRIFT)).toStrictEqual({
      available: true,
      error: `preset "${VIBRAPHONE}" is not a preset for Drift`,
    });
    expect(remote.requests).toStrictEqual([]);
  });

  it("refuses a path that isn't there but is outside the device", async () => {
    const remote = await browserListing([]);

    expect(await lookUp("Instruments/Analog/Pad/Nope", DRIFT)).toStrictEqual({
      available: true,
      error: 'preset "Instruments/Analog/Pad/Nope" is not a preset for Drift',
    });
    expect(remote.requests).toStrictEqual([]);
  });

  it("refuses a path in another section", async () => {
    const remote = await browserListing([]);

    expect(await lookUp("Audio Effects/Drift/Pad/Foo", DRIFT)).toStrictEqual(
      refusal('preset "Audio Effects/Drift/Pad/Foo" is not a preset for Drift'),
    );
    expect(remote.requests).toStrictEqual([]);
  });

  it("still refuses a shared path inside the device as shared", async () => {
    await browserListing([
      { name: "Pad.adv", path: "Drift/Pad.adv" },
      { name: "Pad.adv", path: "Drift/Pad.adv" },
    ]);

    expect(await lookUp("Instruments/Drift/Pad.adv", DRIFT)).toStrictEqual({
      available: true,
      error:
        'preset "Instruments/Drift/Pad.adv" matches 2 items at that browser path; pass a file\'s absolute path from ppal-library as preset',
    });
  });

  it("reads the typed path as the listing does: trimmed, any case, composed", async () => {
    const remote = await browserListing([
      { name: "Pad.adv", path: "Drift/Pad.adv" },
    ]);
    const answer = await lookUp("instruments/ DRIFT /Pad.adv", DRIFT);

    expect(answer).toStrictEqual({
      available: true,
      item: { type: "instrument", path: "Drift/Pad.adv", name: "Pad.adv" },
    });
    expect(remote.requests).toHaveLength(1);

    const accented = { ...DRIFT, path: "Café" };

    await lookUp("Instruments/Café/Pad.adv", accented);
    expect(remote.requests).toHaveLength(2);
  });

  it("takes any path for a device already in the Set", async () => {
    await browserListing([{ name: "Pad.adv", path: "Analog/Pad.adv" }]);

    expect(
      await lookUp("Instruments/Analog/Pad.adv", {
        ...DRIFT,
        orAnywhere: true,
      }),
    ).toStrictEqual({
      available: true,
      item: { type: "instrument", path: "Analog/Pad.adv", name: "Pad.adv" },
    });
    expect(findPresetFiles).not.toHaveBeenCalled();
  });
});

describe("lookUpBrowserPreset — a drum kit saved as an Instrument Rack", () => {
  const SHARED = [
    { name: "Beard Kit.adg", path: "Instrument Rack/Sampled/Beard Kit.adg" },
    { name: "Beard Kit.adg", path: "Instrument Rack/Sampled/Beard Kit.adg" },
  ];

  it("loads the kit's file for a Drum Rack, without listing the browser", async () => {
    const remote = await browserListing([]);
    const kit = rack(
      "a/Racks/Drum Racks/Sampled/Beard Kit.adg",
      "DrumGroupDevice",
    );

    vi.mocked(findPresetFiles).mockResolvedValue([inLibrary(kit)]);

    expect(await lookUp(KIT, DRUM_RACK)).toStrictEqual(loads(kit));
    expect(findPresetFiles).toHaveBeenCalledWith({
      name: "beard kit",
      device: { name: "Drum Rack", kind: "instrument" },
    });
    expect(remote.requests).toStrictEqual([]);
  });

  it("takes the path in any case, without its suffix", async () => {
    const kit = rack(
      "b/Racks/Drum Racks/Sampled/Beard Kit.adg",
      "DrumGroupDevice",
    );

    vi.mocked(findPresetFiles).mockResolvedValue([inLibrary(kit)]);

    expect(
      await lookUp(
        "instruments/instrument rack/ sampled /beard kit",
        DRUM_RACK,
      ),
    ).toStrictEqual(loads(kit));
  });

  it("loads the one Drum Rack kit when the browser path is shared", async () => {
    const remote = await browserListing(SHARED);
    const kit = rack(
      "c/Racks/Drum Racks/Sampled/Beard Kit.adg",
      "DrumGroupDevice",
    );
    const plain = rack(
      "c/Racks/Instrument Racks/Sampled/Beard Kit.adg",
      "Operator",
    );

    vi.mocked(findPresetFiles).mockResolvedValue([
      inLibrary(plain),
      inLibrary(kit),
    ]);

    expect(await lookUp(KIT, DRUM_RACK)).toStrictEqual(loads(kit));
    expect(remote.requests).toStrictEqual([]);
  });

  it("refuses as shared when two kits are at the path", async () => {
    await browserListing(SHARED);
    const one = rack(
      "d/Racks/Drum Racks/Sampled/Beard Kit.adg",
      "DrumGroupDevice",
    );
    const two = rack("e/Packs/X/Sampled/Beard Kit.adg", "DrumGroupDevice");

    vi.mocked(findPresetFiles).mockResolvedValue([
      inLibrary(one),
      inLibrary(two),
    ]);

    expect(await lookUp(KIT, DRUM_RACK)).toStrictEqual({
      available: true,
      error: `preset "${KIT}" matches 2 items at that browser path; pass a file's absolute path from ppal-library as preset`,
    });
  });

  const NOT_A_KIT = `preset "${KIT}" is not a preset for Drum Rack`;

  it("refuses a rack that holds no Drum Rack", async () => {
    const plain = rack(
      "f/Racks/Instrument Racks/Sampled/Beard Kit.adg",
      "Operator",
    );

    vi.mocked(findPresetFiles).mockResolvedValue([inLibrary(plain)]);

    expect(await lookUp(KIT, DRUM_RACK)).toStrictEqual({
      available: true,
      error: NOT_A_KIT,
    });
  });

  it("refuses when no kit's path ends the way the browser path does", async () => {
    const other = rack(
      "g/Racks/Drum Racks/Acoustic/Beard Kit.adg",
      "DrumGroupDevice",
    );

    vi.mocked(findPresetFiles).mockResolvedValue([inLibrary(other)]);

    expect(await lookUp(KIT, DRUM_RACK)).toStrictEqual({
      available: true,
      error: NOT_A_KIT,
    });
  });

  it("refuses when the library has nothing or can't be read", async () => {
    vi.mocked(findPresetFiles).mockResolvedValue([]);
    expect(await lookUp(KIT, DRUM_RACK)).toStrictEqual(refusal(NOT_A_KIT));

    vi.mocked(findPresetFiles).mockResolvedValue(null);
    expect(await lookUp(KIT, DRUM_RACK)).toStrictEqual(refusal(NOT_A_KIT));
  });

  it("refuses, loading nothing, when the library query throws", async () => {
    vi.mocked(findPresetFiles).mockRejectedValue(new Error("database locked"));

    expect(await lookUp(KIT, DRUM_RACK)).toStrictEqual({
      available: true,
      error: NOT_A_KIT,
    });
  });

  it("reports running out of time, not a refusal", async () => {
    await expect(
      lookUpBrowserPreset(KIT, DRUM_RACK, Date.now() - 1),
    ).rejects.toBeInstanceOf(RemoteScriptTimeout);
    expect(findPresetFiles).not.toHaveBeenCalled();
  });

  it.each([
    ["another device", KIT, DRIFT, "Drift"],
    [
      "a path outside Instrument Rack",
      "Instruments/Drift/Sampled/Beard Kit.adg",
      DRUM_RACK,
      "Drum Rack",
    ],
    [
      "a path with no folder below Instrument Rack",
      "Instruments/Instrument Rack",
      DRUM_RACK,
      "Drum Rack",
    ],
    [
      "another section",
      "Audio Effects/Instrument Rack/Sampled/Beard Kit.adg",
      DRUM_RACK,
      "Drum Rack",
    ],
  ])("doesn't look a kit up for %s", async (_, path, scope, device) => {
    await browserListing([]);

    expect(await lookUp(path, scope)).toStrictEqual(
      refusal(`preset "${path}" is not a preset for ${device}`),
    );
    expect(findPresetFiles).not.toHaveBeenCalled();
  });
});
