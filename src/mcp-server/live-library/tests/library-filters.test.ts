// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from "vitest";
import {
  deriveItemType,
  deviceTypeForKind,
  folderKindsForSource,
  fourCC,
  fourCCsForKind,
  keywordsForType,
  resolveClipSubtype,
  resolveKind,
  resolveSource,
} from "../library-filters.ts";
// clampLibraryLimit lives in the sibling library-types.ts (the same pure
// library-DB coercion layer); its tests live here rather than in a separate file
// to stay under the tests/ folder-item cap.
import { clampLibraryLimit, MAX_LIBRARY_LIMIT } from "../library-types.ts";

describe("fourCC", () => {
  it("encodes 'fldr' as 1718379634 (matches Live's spike-confirmed value)", () => {
    expect(fourCC("fldr")).toBe(1_718_379_634);
  });

  it("produces unsigned 32-bit values", () => {
    // 'wav-' starts with 0x77, won't overflow into negative — but checks the shape
    const code = fourCC("wav-");

    expect(code).toBeGreaterThan(0);
    expect(Number.isInteger(code)).toBe(true);
  });

  it("computes the big-endian uint32 explicitly", () => {
    // 'a'=0x61, 'i'=0x69, 'f'=0x66, 'f'=0x66 → 0x61696666
    expect(fourCC("aiff")).toBe(0x61_69_66_66);
  });

  it("encodes the full ASCII range without sign overflow", () => {
    // 'p'=0x70 in 'plug' has bit 7 clear; 'vstp' starts with 0x76 too.
    // Force a high-bit byte to verify the unsigned shift in fourCC().
    // 0xFF...... would overflow signed int32; >>> 0 must keep it positive.
    expect(fourCC("\xFF\x00\x00\x00")).toBe(0xff_00_00_00);
    expect(fourCC("\xFF\x00\x00\x00")).toBeGreaterThan(0);
  });

  it("round-trips through resolveKind for known audio types", () => {
    expect(resolveKind(fourCC("aiff"))).toBe("audio");
    expect(resolveKind(fourCC("wav-"))).toBe("audio");
    expect(resolveKind(fourCC("flac"))).toBe("audio");
    expect(resolveKind(fourCC("mp3-"))).toBe("audio");
  });
});

/**
 * Canonical file_type integers as observed in a Live 12.3 files DB. These
 * are the raw numbers SQLite returns for `files.file_type`; locking them
 * in this test catches accidental edits to fourCC() or the KIND_FOURCC
 * table that would silently break every prod query.
 */
describe("fourCCsForKind — DB-verified integer mappings", () => {
  it("matches Live 12.3 files.file_type values for every public kind", () => {
    expect(fourCCsForKind("audio")).toStrictEqual([
      1_634_297_446, // aiff
      2_002_875_949, // wav-
      1_718_378_851, // flac
      1_836_069_677, // mp3-
      1_869_047_670, // oggv
    ]);
    expect(fourCCsForKind("midi")).toStrictEqual([1_835_623_529]); // midi
    expect(fourCCsForKind("live-clip")).toStrictEqual([1_634_493_229]); // alc-
    expect(fourCCsForKind("preset")).toStrictEqual([1_633_973_805]); // adv-
    expect(fourCCsForKind("device-group")).toStrictEqual([1_633_969_965]); // adg-
    expect(fourCCsForKind("m4l-device")).toStrictEqual([1_634_562_093]); // amp-
    expect(fourCCsForKind("live-set")).toStrictEqual([1_634_497_325]); // als-
    expect(fourCCsForKind("plugin")).toStrictEqual([
      1_987_277_875, // vst3
      1_987_277_936, // vstp
      1_635_086_450, // aupr
      1_886_156_135, // plug
    ]);
    expect(fourCCsForKind("image")).toStrictEqual([
      1_886_283_565, // png-
      1_785_750_887, // jpeg
      1_953_064_550, // tiff
    ]);
    expect(fourCCsForKind("video")).toStrictEqual([
      1_836_069_933, // mp4-
      1_903_455_606, // qtmv
      1_635_150_125, // avi-
    ]);
    expect(fourCCsForKind("folder")).toStrictEqual([
      1_718_379_634, // fldr
      1_818_651_748, // lfld
      1_885_760_612, // pfld
      1_684_434_020, // dfld
    ]);
  });
});

describe("fourCCsForKind", () => {
  it("maps audio to 5 audio file types", () => {
    expect(fourCCsForKind("audio")).toHaveLength(5);
  });

  it("maps plugin to 4 plugin file types", () => {
    expect(fourCCsForKind("plugin")).toHaveLength(4);
  });

  it("maps each kind to a non-empty set", () => {
    const kinds = [
      "audio",
      "midi",
      "live-clip",
      "preset",
      "device-group",
      "m4l-device",
      "live-set",
      "plugin",
      "image",
      "video",
      "folder",
    ] as const;

    for (const kind of kinds) {
      expect(fourCCsForKind(kind).length).toBeGreaterThan(0);
    }
  });

  it("separates midi from live-clip", () => {
    expect(fourCCsForKind("midi")).toStrictEqual([fourCC("midi")]);
    expect(fourCCsForKind("live-clip")).toStrictEqual([fourCC("alc-")]);
  });

  it("separates device-group from m4l-device", () => {
    expect(fourCCsForKind("device-group")).toStrictEqual([fourCC("adg-")]);
    expect(fourCCsForKind("m4l-device")).toStrictEqual([fourCC("amp-")]);
  });
});

describe("resolveKind", () => {
  it("returns null for unknown file_type", () => {
    expect(resolveKind(0)).toBeNull();
    expect(resolveKind(99_999_999)).toBeNull();
  });

  it("resolves device-group and m4l-device distinctly", () => {
    expect(resolveKind(fourCC("adg-"))).toBe("device-group");
    expect(resolveKind(fourCC("amp-"))).toBe("m4l-device");
  });

  it("resolves midi and live-clip distinctly", () => {
    expect(resolveKind(fourCC("midi"))).toBe("midi");
    expect(resolveKind(fourCC("alc-"))).toBe("live-clip");
  });
});

describe("deviceTypeForKind", () => {
  it("maps Live's documented device_type integers", () => {
    // Verified against `files.device_type` distinct values in a Live 12.3
    // files DB: 1=instrument (e.g. Ultra Analog VA-3), 2=audiofx
    // (e.g. FabFilter Volcano 3), 4=midifx (e.g. Bouncy Notes).
    expect(deviceTypeForKind("instrument")).toBe(1);
    expect(deviceTypeForKind("audiofx")).toBe(2);
    expect(deviceTypeForKind("midifx")).toBe(4);
  });
});

describe("folderKindsForSource", () => {
  // Verified against `places.folder_kind` in a Live 12.3 files DB:
  //   0  → pack folder names (e.g. "Core Library", "Drum Booth")
  //   1  → "User Library"
  //   2  → User Library subfolders (e.g. "Samples", "MIDI Mod")
  //   4  → "Current Project" (intentionally unmapped — not a browse category)
  //   5  → "Presets" (intentionally unmapped — internal)
  //   8  → "Built-in"
  //   9  → "Cloud"
  //   10 → "Plugins"

  it("maps user to [1,2] (User Library + subfolders)", () => {
    expect(folderKindsForSource("user")).toStrictEqual([1, 2]);
  });

  it("maps pack to [0]", () => {
    expect(folderKindsForSource("pack")).toStrictEqual([0]);
  });

  it("maps builtin/cloud/plugin to single integers", () => {
    expect(folderKindsForSource("builtin")).toStrictEqual([8]);
    expect(folderKindsForSource("cloud")).toStrictEqual([9]);
    expect(folderKindsForSource("plugin")).toStrictEqual([10]);
  });

  it("returns [] for the synthetic 'sampleFolder' source (no DB encoding)", () => {
    expect(folderKindsForSource("sampleFolder")).toStrictEqual([]);
  });
});

describe("resolveSource", () => {
  it("returns null for unknown folder_kind", () => {
    expect(resolveSource(99)).toBeNull();
  });

  it("returns null for folder_kinds Live uses but we don't expose", () => {
    // 4 = "Current Project", 5 = "Presets" — both intentionally unmapped
    expect(resolveSource(4)).toBeNull();
    expect(resolveSource(5)).toBeNull();
  });

  it("resolves user, pack, builtin, cloud, plugin", () => {
    expect(resolveSource(0)).toBe("pack");
    expect(resolveSource(1)).toBe("user");
    expect(resolveSource(2)).toBe("user");
    expect(resolveSource(8)).toBe("builtin");
    expect(resolveSource(9)).toBe("cloud");
    expect(resolveSource(10)).toBe("plugin");
  });
});

describe("resolveClipSubtype", () => {
  const ALC = fourCC("alc-");

  it("resolves MIDI and audio Live-clip subtypes", () => {
    expect(resolveClipSubtype(ALC, fourCC("alcM"))).toBe("midi");
    expect(resolveClipSubtype(ALC, fourCC("alcA"))).toBe("audio");
  });

  it("returns null for non-.alc file types", () => {
    expect(resolveClipSubtype(fourCC("wav-"), fourCC("alcM"))).toBeNull();
  });

  it("returns null for a null or unrecognized subtype", () => {
    expect(resolveClipSubtype(ALC, null)).toBeNull();
    expect(resolveClipSubtype(ALC, 12_345)).toBeNull();
  });
});

describe("keywordsForType", () => {
  it("maps each type to its Live keyword name(s)", () => {
    expect(keywordsForType("loop")).toStrictEqual(["Loop", "Looping"]);
    expect(keywordsForType("oneshot")).toStrictEqual(["One Shot"]);
    expect(keywordsForType("impulse-response")).toStrictEqual([
      "Impulse Response",
    ]);
  });
});

describe("deriveItemType", () => {
  it("derives each type from its tag name", () => {
    expect(deriveItemType(["Loop"])).toBe("loop");
    expect(deriveItemType(["Looping"])).toBe("loop");
    expect(deriveItemType(["One Shot"])).toBe("oneshot");
    expect(deriveItemType(["Impulse Response"])).toBe("impulse-response");
  });

  it("returns null when no Type tag applies", () => {
    expect(deriveItemType([])).toBeNull();
    expect(deriveItemType(["Kick", "Punchy"])).toBeNull();
  });

  it("prefers loop over oneshot when a file carries both", () => {
    expect(deriveItemType(["One Shot", "Loop"])).toBe("loop");
  });
});

describe("clampLibraryLimit", () => {
  const DEFAULT = 50;

  it("returns a valid in-range integer unchanged", () => {
    expect(clampLibraryLimit(25, DEFAULT)).toBe(25);
    expect(clampLibraryLimit(1, DEFAULT)).toBe(1);
  });

  it("floors a fractional request", () => {
    expect(clampLibraryLimit(5.9, DEFAULT)).toBe(5);
  });

  it("caps a request above MAX_LIBRARY_LIMIT", () => {
    expect(clampLibraryLimit(MAX_LIBRARY_LIMIT + 500, DEFAULT)).toBe(
      MAX_LIBRARY_LIMIT,
    );
  });

  it("falls back to the default when the request is missing", () => {
    // Guards the `requested == null` branch of the coercion.
    expect(clampLibraryLimit(undefined, DEFAULT)).toBe(DEFAULT);
  });

  it("falls back to the default for a non-finite request", () => {
    // Guards the `!Number.isFinite(requested)` branch (NaN / ±Infinity).
    expect(clampLibraryLimit(Number.NaN, DEFAULT)).toBe(DEFAULT);
    expect(clampLibraryLimit(Number.POSITIVE_INFINITY, DEFAULT)).toBe(DEFAULT);
  });

  it("falls back to the default for a non-positive request", () => {
    // Guards the `requested <= 0` branch — 0 and negatives are meaningless
    // limits, so they coerce to the default rather than to 0 rows.
    expect(clampLibraryLimit(0, DEFAULT)).toBe(DEFAULT);
    expect(clampLibraryLimit(-5, DEFAULT)).toBe(DEFAULT);
  });
});
