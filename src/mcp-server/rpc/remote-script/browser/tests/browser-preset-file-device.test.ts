// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gzipSync } from "node:zlib";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { type PresetScope } from "#src/tools/device/create/helpers/remote-script-contract.ts";
import { lookUpBrowserPreset } from "../browser-preset-lookup.ts";
import { presetFileIsFor } from "../preset-file-device.ts";

const HEADER =
  '<?xml version="1.0" encoding="UTF-8"?>\n<Ableton MajorVersion="5">';

let dir = "";

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), "ppal-preset-file-"));
});

afterAll(() => {
  rmSync(dir, { recursive: true, force: true });
});

/**
 * Write a gzipped preset file.
 * @param name - The file name
 * @param body - What goes inside `<Ableton>`
 * @returns The file's path
 */
function preset(name: string, body: string): string {
  const path = join(dir, name);

  writeFileSync(path, gzipSync(`${HEADER}\n\t${body}\n</Ableton>`));

  return path;
}

/**
 * Write a rack preset: its rack, then one chain per list of device classes.
 * @param name - The file name
 * @param rack - The rack's class
 * @param chains - The device classes in each chain, in order
 * @returns The file's path
 */
function rackPreset(
  name: string,
  rack: string,
  chains: string[][] = [],
): string {
  const branches = chains
    .map((devices) =>
      devices.length === 0
        ? '<InstrumentBranchPreset Id="0"><DevicePresets /></InstrumentBranchPreset>'
        : `<InstrumentBranchPreset Id="0"><DevicePresets>${devices
            .map(
              (device) =>
                `<AbletonDevicePreset Id="0"><Device><${device} Id="0"></${device}></Device></AbletonDevicePreset>`,
            )
            .join("")}</DevicePresets></InstrumentBranchPreset>`,
    )
    .join("");

  return preset(
    name,
    `<GroupDevicePreset><OverwriteProtectionNumber Value="1" /><Device><${rack} Id="0"><Branches /></${rack}></Device><BranchPresets>${branches}</BranchPresets></GroupDevicePreset>`,
  );
}

describe("presetFileIsFor", () => {
  it("is for the device an .adv's root element names", async () => {
    const drift = preset(
      "Drift Bass.adv",
      '<Drift><LomId Value="0" /></Drift>',
    );

    expect(await presetFileIsFor(drift, "Drift")).toBe(true);
    expect(await presetFileIsFor(drift, " drift ")).toBe(true);
    expect(await presetFileIsFor(drift, "Operator")).toBe(false);
    expect(await presetFileIsFor(drift, "Drum Rack")).toBe(false);
  });

  it("names devices by their Live class, not their display name", async () => {
    const wavetable = preset(
      "Pad.adv",
      "<InstrumentVector></InstrumentVector>",
    );
    const compressor = preset("Comp.adv", "<Compressor2></Compressor2>");

    expect(await presetFileIsFor(wavetable, "Wavetable")).toBe(true);
    expect(await presetFileIsFor(compressor, "Compressor")).toBe(true);
    expect(await presetFileIsFor(compressor, "Glue Compressor")).toBe(false);
  });

  it("is not for a device when the root is a Max device", async () => {
    const shaper = preset(
      "Shaper.adv",
      "<MxDeviceAudioEffect></MxDeviceAudioEffect>",
    );

    expect(await presetFileIsFor(shaper, "Reverb")).toBe(false);
  });

  it("is for the rack an .adg holds", async () => {
    const kit = rackPreset("Kit.adg", "DrumGroupDevice", [["Simpler"]]);

    expect(await presetFileIsFor(kit, "Drum Rack")).toBe(true);
    expect(await presetFileIsFor(kit, "Instrument Rack")).toBe(false);
    expect(await presetFileIsFor(kit, "Reverb")).toBe(false);
  });

  it("is for the device an .adg is built around: its first chain's first device", async () => {
    const kit = rackPreset("Impulse Kit.adg", "InstrumentGroupDevice", [
      ["InstrumentImpulse"],
      ["Reverb"],
    ]);

    expect(await presetFileIsFor(kit, "Impulse")).toBe(true);
    expect(await presetFileIsFor(kit, "Instrument Rack")).toBe(true);
    expect(await presetFileIsFor(kit, "Operator")).toBe(false);
  });

  it("is not for a device the rack merely holds", async () => {
    const holdsReverb = rackPreset("Pad.adg", "InstrumentGroupDevice", [
      ["Operator", "Reverb"],
      ["Reverb"],
    ]);

    expect(await presetFileIsFor(holdsReverb, "Reverb")).toBe(false);
    expect(await presetFileIsFor(holdsReverb, "Operator")).toBe(true);
    expect(await presetFileIsFor(holdsReverb, "Audio Effect Rack")).toBe(false);
  });

  it("is not for a device only a later chain, or a nested rack, holds", async () => {
    const later = rackPreset("Later.adg", "InstrumentGroupDevice", [
      [],
      ["Operator"],
    ]);
    const nested = rackPreset("Nested.adg", "InstrumentGroupDevice", [
      ["InstrumentGroupDevice", "Operator"],
    ]);

    expect(await presetFileIsFor(later, "Operator")).toBe(false);
    expect(await presetFileIsFor(nested, "Operator")).toBe(false);
  });

  it("is for a named rack only when the file's own rack is that class", async () => {
    const drums = rackPreset("Drums.adg", "InstrumentGroupDevice", [
      ["DrumGroupDevice"],
    ]);

    expect(await presetFileIsFor(drums, "Instrument Rack")).toBe(true);
    expect(await presetFileIsFor(drums, "Drum Rack")).toBe(false);
  });

  it("can't tell for a device with no known class, so it allows the load", async () => {
    const drift = preset("Drift Bass.adv", "<Drift></Drift>");

    expect(await presetFileIsFor(drift, "Pro-Q 4")).toBe(true);
    expect(await presetFileIsFor(drift, "Shaper")).toBe(true);
  });

  it("can't tell for a file it can't read, so it allows the load", async () => {
    const notGzip = join(dir, "plain.adv");

    writeFileSync(notGzip, "<Ableton><Drift /></Ableton>");

    expect(await presetFileIsFor(join(dir, "missing.adv"), "Operator")).toBe(
      true,
    );
    expect(await presetFileIsFor(notGzip, "Operator")).toBe(true);
    expect(await presetFileIsFor(preset("empty.adv", ""), "Operator")).toBe(
      true,
    );
  });

  it("can't tell for a rack with no device inside, so it allows the load", async () => {
    const odd = preset("Odd.adg", "<GroupDevicePreset></GroupDevicePreset>");

    expect(await presetFileIsFor(odd, "Operator")).toBe(true);
  });
});

describe("lookUpBrowserPreset — a file for a named device", () => {
  const OPERATOR: PresetScope = {
    type: "instrument",
    path: "Operator",
    device: "Operator",
  };

  it("refuses a file that is for another device, worded like a browser path", async () => {
    const drift = preset("Drift Bass.adv", "<Drift></Drift>");

    expect(
      await lookUpBrowserPreset(drift, OPERATOR, Date.now() + 60_000),
    ).toStrictEqual({
      available: true,
      error: `preset "${drift}" is not a preset for Operator`,
    });
  });

  it("loads a file that is for the device", async () => {
    const operator = preset("Op.adv", "<Operator></Operator>");

    expect(
      await lookUpBrowserPreset(operator, OPERATOR, Date.now() + 60_000),
    ).toStrictEqual({
      available: true,
      item: { type: "file", path: operator, name: "Op.adv" },
    });
  });

  it("takes any file for a device already in the Set", async () => {
    const drift = preset("Drift Bass.adv", "<Drift></Drift>");

    expect(
      await lookUpBrowserPreset(
        drift,
        { ...OPERATOR, orAnywhere: true },
        Date.now() + 60_000,
      ),
    ).toStrictEqual({
      available: true,
      item: { type: "file", path: drift, name: "Drift Bass.adv" },
    });
  });

  it("takes any file when no device was named", async () => {
    const drift = preset("Drift Bass.adv", "<Drift></Drift>");

    expect(
      await lookUpBrowserPreset(drift, undefined, Date.now() + 60_000),
    ).toStrictEqual({
      available: true,
      item: { type: "file", path: drift, name: "Drift Bass.adv" },
    });
  });

  it("still says a file that isn't a preset isn't one", async () => {
    expect(
      await lookUpBrowserPreset("/Samples/kick.wav", OPERATOR, Date.now()),
    ).toStrictEqual({
      available: true,
      error: 'preset "/Samples/kick.wav" is not a preset file (.adv or .adg)',
    });
  });
});

describe("lookUpBrowserPreset — a Windows network path", () => {
  it("is a file path, not a preset name", async () => {
    expect(
      await lookUpBrowserPreset(
        "\\\\nas\\music\\Pad.adv",
        undefined,
        Date.now(),
      ),
    ).toStrictEqual({
      available: true,
      item: {
        type: "file",
        path: "\\\\nas\\music\\Pad.adv",
        name: "Pad.adv",
      },
    });
  });

  it("refuses one that isn't a preset file", async () => {
    expect(
      await lookUpBrowserPreset(
        "\\\\nas\\music\\kick.wav",
        undefined,
        Date.now(),
      ),
    ).toStrictEqual({
      available: true,
      error:
        'preset "\\\\nas\\music\\kick.wav" is not a preset file (.adv or .adg)',
    });
  });
});
