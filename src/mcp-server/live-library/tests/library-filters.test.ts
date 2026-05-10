// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from "vitest";
import {
  deviceTypeForKind,
  folderKindsForSource,
  fourCC,
  fourCCsForKind,
  resolveKind,
  resolveSource,
} from "../library-filters.ts";

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

  it("round-trips through resolveKind for known audio types", () => {
    expect(resolveKind(fourCC("aiff"))).toBe("audio");
    expect(resolveKind(fourCC("wav-"))).toBe("audio");
    expect(resolveKind(fourCC("flac"))).toBe("audio");
    expect(resolveKind(fourCC("mp3-"))).toBe("audio");
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
    expect(deviceTypeForKind("instrument")).toBe(1);
    expect(deviceTypeForKind("audiofx")).toBe(2);
    expect(deviceTypeForKind("midifx")).toBe(4);
  });
});

describe("folderKindsForSource", () => {
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
});

describe("resolveSource", () => {
  it("returns null for unknown folder_kind", () => {
    expect(resolveSource(99)).toBeNull();
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
