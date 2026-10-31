// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import {
  buildPluginDb,
  type PluginSeed,
  useTempDir,
} from "./plugin-db-fixture.ts";
import { resolvePlugin } from "../../../query/plugins/resolve-plugin.ts";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

vi.mock(
  import("../../../../rpc/remote-script/browser/browser-plugins.ts"),
  () => ({ listBrowserPlugins: vi.fn() }),
);

vi.mock(import("../../../live-db-path.ts"), () => ({
  findLiveFilesDbPath: vi.fn(),
  findLivePluginsDbPath: vi.fn(),
  liveDatabaseDir: vi.fn(),
}));

const dbPathMod = await import("../../../live-db-path.ts");
const browserMod =
  await import("../../../../rpc/remote-script/browser/browser-plugins.ts");

const DIR = "/Library/Audio/Plug-Ins";

const SEEDS: PluginSeed[] = [
  ["Everywhere", "Vst3 Co", 1, "device:vst3:audiofx:a", `${DIR}/VST3/E.vst3`],
  [
    "Kaivo",
    "Madrona Labs",
    1,
    "device:vst:instr:1?n=Kaivo",
    `${DIR}/VST/Kaivo.vst`,
  ],
  [
    "Oldie",
    "Old Co",
    1,
    "device:vst:audiofx:2?n=Oldie",
    `${DIR}/VST/Oldie.vst`,
  ],
  ["Dupe", "A Co", 1, "device:vst:audiofx:3", `${DIR}/VST/DupeA.vst`],
  ["Dupe", "B Co", 1, "device:vst:audiofx:4", `${DIR}/VST/DupeB.vst`],
  ["Anon", null, 1, "device:vst:audiofx:7", `${DIR}/VST/AnonA.vst`],
  ["Anon", null, 1, "device:vst:audiofx:8", `${DIR}/VST/AnonB.vst`],
  ["Shell One", "Waves", 1, "device:vst:audiofx:5", `${DIR}/VST/WaveShell.vst`],
  ["Shell Two", "Waves", 1, "device:vst:audiofx:6", `${DIR}/VST/WaveShell.vst`],
  ["Unsure", "Nobody", 1, "device:vst:", `${DIR}/VST/Unsure.vst`],
];

/** An AU in the browser's list. */
function au(name: string, vendor: string | null = "Apple") {
  return { name, vendor, format: "AU" as const };
}

/**
 * Wrap AudioComponents entries in an Info.plist.
 *
 * @param components - [name, type] for each Audio Unit
 * @returns The plist text
 */
function plist(components: Array<[string, string]>): string {
  const entries = components
    .map(
      ([name, type]) => `<dict>
        <key>name</key><string>${name}</string>
        <key>type</key><string>${type}</string>
        <key>tags</key><array><string>Effects</string></array>
      </dict>`,
    )
    .join("");

  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>CFBundleName</key><string>x</string>
  <key>AudioComponents</key><array>${entries}</array>
</dict></plist>`;
}

describe("resolvePlugin by format", () => {
  const tempDir = useTempDir("ppal-resolve-formats-");
  let dir: string;
  let auDir: string;
  let db: string;

  /**
   * Put a `.component` bundle in the fake AU folder.
   *
   * @param bundle - Bundle name
   * @param info - Info.plist content
   */
  function addBundle(bundle: string, info: string | Buffer): void {
    const contents = join(auDir, `${bundle}.component`, "Contents");

    mkdirSync(contents, { recursive: true });
    writeFileSync(join(contents, "Info.plist"), info);
  }

  beforeAll(() => {
    dir = tempDir();
    auDir = join(dir, "Components");
    db = buildPluginDb(dir, SEEDS, true);
    addBundle(
      "CoreAudio",
      plist([
        ["Apple: AUDelay", "aufx"],
        ["Apple: AUMIDISynth", "aumu"],
        ["Apple: AUMIDIEffect", "aumi"],
        ["Apple: AUMixer", "aumf"],
        ["Everywhere", "aufx"],
        ["Kaivo", "aumu"],
        ["Dupe", "aufx"],
      ]),
    );
    addBundle("Serum2", plist([["Xfer Records: Serum 2 FX", "aufx"]]));
    addBundle("Binary", Buffer.from("bplist00\u0000"));
  });

  beforeEach(() => {
    vi.mocked(dbPathMod.findLivePluginsDbPath).mockResolvedValue(db);
    vi.mocked(dbPathMod.findLiveFilesDbPath).mockResolvedValue(null);
    vi.mocked(browserMod.listBrowserPlugins).mockResolvedValue([]);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  /**
   * @param listed - What Live's browser lists
   */
  function browserLists(...listed: ReturnType<typeof au>[]): void {
    vi.mocked(browserMod.listBrowserPlugins).mockResolvedValue(listed);
  }

  describe("Audio Units", () => {
    it("takes the type from the bundle and the name without its vendor", async () => {
      browserLists(au("AUDelay"));

      await expect(
        resolvePlugin({ name: "audelay" }, [auDir]),
      ).resolves.toStrictEqual({
        name: "AUDelay",
        vendor: "Apple",
        category: "audiofx",
        format: "AU",
        file: join(auDir, "CoreAudio.component"),
        shared: false,
      });
    });

    it("reads aumu as an instrument and aumf as an effect", async () => {
      browserLists(au("AUMIDISynth"), au("AUMixer"));

      await expect(
        resolvePlugin({ name: "AUMIDISynth" }, [auDir]),
      ).resolves.toStrictEqual(
        expect.objectContaining({ category: "instrument", format: "AU" }),
      );
      await expect(
        resolvePlugin({ name: "AUMixer" }, [auDir]),
      ).resolves.toStrictEqual(
        expect.objectContaining({ category: "audiofx" }),
      );
    });

    it("picks one AU out of a bundle that holds several by its name", async () => {
      browserLists(au("Serum 2 FX", "Xfer Records"));

      await expect(
        resolvePlugin({ name: "Serum 2 FX" }, [auDir]),
      ).resolves.toStrictEqual(
        expect.objectContaining({
          name: "Serum 2 FX",
          vendor: "Xfer Records",
          file: join(auDir, "Serum2.component"),
        }),
      );
    });

    it("ignores an AU the browser doesn't list", async () => {
      await expect(resolvePlugin({ name: "AUDelay" }, [auDir])).rejects.toThrow(
        /^No plug-in named "AUDelay"$/,
      );
    });

    it("acts as if no AUs are installed when the remote script can't answer", async () => {
      vi.mocked(browserMod.listBrowserPlugins).mockResolvedValue(null);

      await expect(resolvePlugin({ name: "AUDelay" }, [auDir])).rejects.toThrow(
        /^No plug-in named "AUDelay"$/,
      );
      await expect(
        resolvePlugin({ name: "Kaivo" }, [auDir]),
      ).resolves.toStrictEqual(expect.objectContaining({ format: "VST" }));
    });

    it("says it can't tell the kind when no bundle names the AU", async () => {
      browserLists(au("Ghost"));

      await expect(resolvePlugin({ name: "Ghost" }, [auDir])).rejects.toThrow(
        'Can\'t tell whether "Ghost" is an instrument or an audio effect',
      );
    });

    it("says it can't tell the kind when the bundle's plist is binary", async () => {
      const lonely = join(dir, "OnlyBinary");

      mkdirSync(join(lonely, "B.component", "Contents"), { recursive: true });
      writeFileSync(
        join(lonely, "B.component", "Contents", "Info.plist"),
        Buffer.from("bplist00"),
      );
      browserLists(au("AUDelay"));

      await expect(
        resolvePlugin({ name: "AUDelay" }, [lonely]),
      ).rejects.toThrow("instrument or an audio effect");
    });

    it("says only instruments and effects can be hosted for other types", async () => {
      browserLists(au("AUMIDIEffect"));

      await expect(
        resolvePlugin({ name: "AUMIDIEffect" }, [auDir]),
      ).rejects.toThrow(
        '"AUMIDIEffect" is neither an instrument nor an audio effect, and only those can be hosted',
      );
    });

    it("names the vendors when several vendors have an AU of that name", async () => {
      browserLists(au("Dupe", "A Co"), au("Dupe", "B Co"));

      await expect(resolvePlugin({ name: "Dupe" }, [auDir])).rejects.toThrow(
        'More than one AU plug-in is named "Dupe" (vendors: A Co, B Co)',
      );
    });

    it("takes the vendor from the bundle when the browser has no vendor folder", async () => {
      browserLists(au("Serum 2 FX", null));

      await expect(
        resolvePlugin({ name: "Serum 2 FX" }, [auDir]),
      ).resolves.toStrictEqual(
        expect.objectContaining({ vendor: "Xfer Records" }),
      );
    });

    it("calls a missing vendor unknown when several AUs share a name", async () => {
      browserLists(au("Dupe", null), au("Dupe", "B Co"));

      await expect(resolvePlugin({ name: "Dupe" }, [auDir])).rejects.toThrow(
        "(vendors: unknown, B Co)",
      );
    });

    it("counts one AU installed in two folders once", async () => {
      browserLists(au("AUDelay"), au("AUDelay"));

      await expect(
        resolvePlugin({ name: "AUDelay" }, [auDir]),
      ).resolves.toStrictEqual(expect.objectContaining({ name: "AUDelay" }));
    });

    it("copes with folders that don't exist", async () => {
      browserLists(au("AUDelay"));

      await expect(
        resolvePlugin({ name: "AUDelay" }, [join(dir, "nowhere")]),
      ).rejects.toThrow("instrument or an audio effect");
    });

    it("suggests AU names too", async () => {
      browserLists(au("AUDelay"));

      await expect(resolvePlugin({ name: "delay" }, [auDir])).rejects.toThrow(
        'No plug-in named "delay". Similar plug-ins: AUDelay',
      );
    });
  });

  describe("format order", () => {
    it("prefers VST3 over AU and VST2, without asking the browser", async () => {
      browserLists(au("Everywhere"));

      await expect(
        resolvePlugin({ name: "Everywhere" }, [auDir]),
      ).resolves.toStrictEqual(expect.objectContaining({ format: "VST3" }));
      expect(browserMod.listBrowserPlugins).not.toHaveBeenCalled();
    });

    it("prefers AU over VST2", async () => {
      browserLists(au("Kaivo", "Madrona Labs"));

      await expect(
        resolvePlugin({ name: "Kaivo" }, [auDir]),
      ).resolves.toStrictEqual(expect.objectContaining({ format: "AU" }));
    });

    it("falls back to VST2 when there is no VST3 or AU", async () => {
      await expect(
        resolvePlugin({ name: "Kaivo" }, [auDir]),
      ).resolves.toStrictEqual({
        name: "Kaivo",
        vendor: "Madrona Labs",
        category: "instrument",
        format: "VST",
        file: `${DIR}/VST/Kaivo.vst`,
        shared: false,
      });
    });
  });

  describe("VST2", () => {
    it("reads an effect", async () => {
      await expect(resolvePlugin({ name: "Oldie" })).resolves.toStrictEqual(
        expect.objectContaining({ category: "audiofx", format: "VST" }),
      );
    });

    it("refuses a shell plug-in", async () => {
      await expect(resolvePlugin({ name: "Shell One" })).rejects.toThrow(
        '"Shell One" is a VST2 shell plug-in (it shares its file with other plug-ins), and those can\'t be hosted yet',
      );
    });

    it("names the vendors when several VST2 plug-ins share the name", async () => {
      await expect(resolvePlugin({ name: "Dupe" })).rejects.toThrow(
        'More than one VST2 plug-in is named "Dupe" (vendors: A Co, B Co)',
      );
    });

    it("calls a missing vendor unknown", async () => {
      await expect(resolvePlugin({ name: "Anon" })).rejects.toThrow(
        "(vendors: unknown)",
      );
    });

    it("refuses a plug-in whose kind Live doesn't say", async () => {
      await expect(resolvePlugin({ name: "Unsure" })).rejects.toThrow(
        "instrument or an audio effect",
      );
    });
  });
});
