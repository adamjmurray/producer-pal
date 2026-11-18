#!/usr/bin/env node
// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

/**
 * Spike: generate a device for one plug-in, with a Live param per plug-in
 * param, into the User Library.
 *
 * Usage: node scripts/live-api/plugin-host/generate-plugin-device.ts \
 *   <params.json> --name Diva --file Diva [--format VST3] [--effect] [--limit N]
 *
 * params.json: [{index, name, value}], as ppal-plugin-host `params` lists
 * them for a freshly loaded plug-in. Each value becomes its dial's initial one.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { buildPluginHostDevice } from "./plugin-host-device.ts";

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    name: { type: "string" },
    file: { type: "string" },
    format: { type: "string", default: "VST3" },
    effect: { type: "boolean", default: false },
    limit: { type: "string" },
  },
});

const [paramsPath] = positionals;

if (paramsPath == null || values.name == null || values.file == null) {
  throw new Error("usage: <params.json> --name <name> --file <file>");
}

const params = JSON.parse(readFileSync(paramsPath, "utf8")) as Param[];
const limit = values.limit == null ? params.length : Number(values.limit);
const dir = join(
  import.meta.dirname,
  "../../../max-for-live-device/plugin-host",
);
const kind = values.effect ? "Effect" : "Instrument";
const template = readFileSync(join(dir, `PPal Plug-in ${kind}.amxd`));
const code = readFileSync(join(dir, "wrapper.js"), "utf8");

const built = buildPluginHostDevice(template, code, {
  load: {
    format: values.format,
    file: values.file,
    name: values.name,
    synth: !values.effect,
  },
  slots: uniqueNames(params.slice(0, limit)),
});

const out = join(
  homedir(),
  "Music/Ableton/User Library/Presets",
  values.effect
    ? "Audio Effects/Max Audio Effect"
    : "Instruments/Max Instrument",
  `PPal ${values.name}.amxd`,
);

writeFileSync(out, built);
console.log(`${out} ${built.length} bytes, ${limit} params`);

interface Param {
  index: number;
  name: string;
  value?: number;
}

// Live param names must be unique in a device; plug-ins repeat them across
// modules (Diva's two envelopes both have "Attack").
function uniqueNames(list: Param[]): Param[] {
  const seen = new Map<string, number>();

  return list.map(({ index, name, value }) => {
    const count = (seen.get(name) ?? 0) + 1;

    seen.set(name, count);

    return { index, name: count === 1 ? name : `${name} (${count})`, value };
  });
}
