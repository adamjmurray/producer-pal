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
 *   [--au "<AU name>"]
 *
 * params.json: [{index, name, value}], as ppal-plugin-host `params` lists
 * them for a freshly loaded plug-in. Each value becomes its dial's initial one.
 * With --au (macOS), the plug-in's Audio Unit says which group each param is
 * in, and repeated names get their group in front.
 */

import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { buildPluginHostDevice } from "./plugin-host-device.ts";
import {
  type AuParam,
  groupParams,
  knobPages,
  type Param,
  uniqueNames,
} from "./plugin-param-groups.ts";

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    name: { type: "string" },
    file: { type: "string" },
    format: { type: "string", default: "VST3" },
    effect: { type: "boolean", default: false },
    limit: { type: "string" },
    au: { type: "string" },
  },
});

const [paramsPath] = positionals;

if (paramsPath == null || values.name == null || values.file == null) {
  throw new Error("usage: <params.json> --name <name> --file <file>");
}

const listed = JSON.parse(readFileSync(paramsPath, "utf8")) as Param[];
const params =
  values.au == null ? listed : groupParams(listed, auParams(values.au));
const limit = values.limit == null ? params.length : Number(values.limit);
const dir = join(
  import.meta.dirname,
  "../../../max-for-live-device/plugin-host",
);
const kind = values.effect ? "Effect" : "Instrument";
const template = readFileSync(join(dir, `PPal Plug-in ${kind}.amxd`));
const code = readFileSync(join(dir, "wrapper.js"), "utf8");

const slots = uniqueNames(params.slice(0, limit));
const built = buildPluginHostDevice(template, code, {
  load: {
    format: values.format,
    file: values.file,
    name: values.name,
    synth: !values.effect,
  },
  slots,
  pages: knobPages(slots),
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

function auParams(name: string): AuParam[] {
  const script = join(import.meta.dirname, "au-param-groups.swift");

  return JSON.parse(
    execFileSync("swift", [script, name], { encoding: "utf8" }),
  ) as AuParam[];
}
