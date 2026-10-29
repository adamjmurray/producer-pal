// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gzipSync } from "node:zlib";
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { type PresetScope } from "#src/tools/device/create/helpers/remote-script-contract.ts";
import {
  type PresetFile,
  findPresetFiles,
} from "../../../../live-library/query/preset-files.ts";
import {
  duplicatePresetFiles,
  lookUpPresetFile,
} from "../browser-preset-files.ts";
import { RemoteScriptTimeout } from "../../remote-script-errors.ts";

vi.mock(import("../../../../live-library/query/preset-files.ts"), () => ({
  findPresetFiles: vi.fn(),
}));

const PRESET = {
  name: "Add Oxide.adv",
  path: "/Users/me/Factory Packs/Tape by Softube/Presets/Add Oxide.adv",
};

// Live lists a pack's Max audio effect under Audio Effects.
const TAPE: PresetScope = {
  type: "audio-effect",
  path: "Tape",
  device: "Tape",
};

/**
 * @param scope - The device the preset should be for
 * @returns What the lookup answers for "Add Oxide"
 */
async function lookUp(scope: PresetScope): ReturnType<typeof lookUpPresetFile> {
  return await lookUpPresetFile(
    "Add Oxide",
    "add oxide",
    scope,
    Date.now() + 60_000,
  );
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

describe("lookUpPresetFile — a pack's Max device", () => {
  it("looks its presets up by the device's name and kind", async () => {
    vi.mocked(findPresetFiles).mockResolvedValue([PRESET]);

    expect(await lookUp(TAPE)).toStrictEqual({
      available: true,
      item: { type: "file", path: PRESET.path, name: PRESET.name },
    });
    expect(findPresetFiles).toHaveBeenCalledExactlyOnceWith({
      name: "add oxide",
      device: { name: "Tape", kind: "audiofx" },
    });
  });

  it("is null when the library has none for it", async () => {
    vi.mocked(findPresetFiles).mockResolvedValue([]);

    expect(await lookUp(TAPE)).toBeNull();
  });

  it("is null when the library can't be read", async () => {
    vi.mocked(findPresetFiles).mockResolvedValue(null);

    expect(await lookUp(TAPE)).toBeNull();
  });
});

describe("lookUpPresetFile — a plug-in's presets", () => {
  it("stays with the browser, since a plug-in's presets can't be told apart", async () => {
    vi.mocked(findPresetFiles).mockResolvedValue([PRESET]);

    expect(
      await lookUp({ type: "plugin", path: "VST3/Pro-Q 4", device: "Pro-Q 4" }),
    ).toBeNull();
    expect(findPresetFiles).not.toHaveBeenCalled();
  });
});

describe("lookUpPresetFile — a Drum Rack's presets", () => {
  const DRUM_RACK: PresetScope = {
    type: "instrument",
    path: "Drum Rack",
    device: "Drum Rack",
  };
  let dir = "";

  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), "ppal-drum-rack-"));
  });

  afterAll(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  /**
   * Write a gzipped .adg of an Instrument Rack whose first chain holds a device.
   * @param name - The file name
   * @param first - The class of the first chain's device
   * @returns The library file
   */
  function instrumentRack(name: string, first: string): PresetFile {
    const path = join(dir, name);
    const xml =
      '<Ableton><GroupDevicePreset><Device><InstrumentGroupDevice Id="0"></InstrumentGroupDevice></Device>' +
      `<BranchPresets><InstrumentBranchPreset><DevicePresets><AbletonDevicePreset><Device><${first} Id="0"></${first}></Device></AbletonDevicePreset></DevicePresets></InstrumentBranchPreset></BranchPresets></GroupDevicePreset></Ableton>`;

    writeFileSync(path, gzipSync(xml));

    return { name, path };
  }

  it("keeps an Instrument Rack that holds a Drum Rack and drops one that doesn't", async () => {
    const wrapped = instrumentRack("Kit.adg", "DrumGroupDevice");
    const plain = instrumentRack("Kit Plain.adg", "Operator");

    vi.mocked(findPresetFiles).mockResolvedValue([plain, wrapped]);

    expect(
      await lookUpPresetFile("Kit", "kit", DRUM_RACK, Date.now() + 60_000),
    ).toStrictEqual({
      available: true,
      item: { type: "file", path: wrapped.path, name: wrapped.name },
    });
    expect(findPresetFiles).toHaveBeenCalledExactlyOnceWith({
      name: "kit",
      device: { name: "Drum Rack", kind: "instrument" },
    });
  });

  it("is null when only plain Instrument Racks have the name", async () => {
    vi.mocked(findPresetFiles).mockResolvedValue([
      instrumentRack("Kit.adg", "Operator"),
    ]);

    expect(
      await lookUpPresetFile("Kit", "kit", DRUM_RACK, Date.now() + 60_000),
    ).toBeNull();
  });

  it("checks files for a name the browser lists once, too", async () => {
    const wrapped = instrumentRack("Kit.adg", "DrumGroupDevice");
    const plain = instrumentRack("Kit Plain.adg", "Operator");

    vi.mocked(findPresetFiles).mockResolvedValue([plain, wrapped]);

    expect(
      await duplicatePresetFiles("Kit", "kit", DRUM_RACK, Date.now() + 60_000),
    ).toBeNull();
  });

  it("stops when the deadline passes while the files are read", async () => {
    const wrapped = instrumentRack("Kit.adg", "DrumGroupDevice");
    const realNow = Date.now.bind(Date);
    let found = false;

    vi.mocked(findPresetFiles).mockImplementation(() => {
      found = true;

      return Promise.resolve([wrapped]);
    });
    vi.spyOn(Date, "now").mockImplementation(
      () => realNow() + (found ? 60_000 : 0),
    );

    await expect(
      lookUpPresetFile("Kit", "kit", DRUM_RACK, realNow() + 30_000),
    ).rejects.toBeInstanceOf(RemoteScriptTimeout);
  });
});
