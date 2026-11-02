// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { describe, expect, it } from "vitest";
import { toolDefUpdateDevice } from "#src/tools/device/update/update-device.def.ts";
import {
  collectHiddenParams,
  hiddenParamWarnings,
} from "#src/tools/shared/tool-framework/hidden-param.ts";
import { resolveToolSchema } from "#src/tools/shared/tool-framework/resolve-tool-schema.ts";
import { toolDefUpdateTrack } from "#src/tools/track/update/update-track.def.ts";

const TOOLS = [
  ["ppal-update-track", toolDefUpdateTrack],
  ["ppal-update-device", toolDefUpdateDevice],
] as const;

describe.each(TOOLS)("%s: deprecated sendGainDb + sendReturn", (_name, def) => {
  const { inputSchema } = def.toolOptions;
  const hidden = collectHiddenParams(inputSchema);

  it("is not published, while sends is", () => {
    const { published } = resolveToolSchema(inputSchema, {
      notation: "barbeat",
      smallModelMode: false,
    });

    expect(Object.keys(published)).toContain("sends");
    expect(Object.keys(published)).not.toContain("sendGainDb");
    expect(Object.keys(published)).not.toContain("sendReturn");
  });

  it("warns on each param, naming the sends call this one means", () => {
    const warnings = hiddenParamWarnings(["sendGainDb", "sendReturn"], hidden, {
      sendGainDb: -6,
      sendReturn: " B Reverb ",
    });

    expect(warnings).toStrictEqual(
      ["sendGainDb", "sendReturn"].map(
        (param) =>
          `WARNING: param "${param}" is deprecated and will be removed; use "sends" instead. ` +
          'Replace sendGainDb and sendReturn with sends: [{"return":"B Reverb","gainDb":-6}]',
      ),
    );
  });

  it("says to make one call per return when the returns pair per target", () => {
    const [warning] = hiddenParamWarnings(["sendReturn"], hidden, {
      sendGainDb: -6,
      sendReturn: "A,B",
    });

    expect(warning).toContain("sends sets the same entries on every target");
    expect(warning).toContain("make one call per return");
  });

  it("keeps a return whose comma is escaped as one return, unescaped", () => {
    const [warning] = hiddenParamWarnings(["sendReturn"], hidden, {
      sendGainDb: -6,
      sendReturn: "A\\, Hard",
    });

    expect(warning).toContain('[{"return":"A, Hard","gainDb":-6}]');
  });

  it("shows the entry's shape when the call gave no return", () => {
    const [warning] = hiddenParamWarnings(["sendGainDb"], hidden, {
      sendGainDb: -6,
    });

    expect(warning).toContain("with sends: [{return, gainDb}]");
  });
});
