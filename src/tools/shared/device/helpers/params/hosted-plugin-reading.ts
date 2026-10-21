// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

// A hosted plug-in lives inside a Producer Pal wrapper device (a Max for Live
// device around `vst~`). It reads as the plug-in it hosts, with its real params
// addressed as `h<number>`.

import {
  type PluginHostResponse,
  probePluginHost,
} from "#src/tools/advanced/plugin-host/plugin-host-v8-protocol.ts";
import { MAX_READ_PARAMS } from "#src/tools/shared/device/helpers/params/param-read-cap.ts";

/** The Max device classes a wrapper can have. Users can rename a device, so the class is the only fixed thing to go by. */
const WRAPPER_CLASSES = new Set(["MxDeviceAudioEffect", "MxDeviceInstrument"]);

/** What a wrapper is called when nobody renamed it. */
const DEFAULT_WRAPPER_NAMES = new Set([
  "PPal Plug-in Effect",
  "PPal Plug-in Instrument",
]);

/** A device that hosts a plug-in. */
export interface HostedPlugin {
  /** The plug-in's name, or null when the wrapper has none loaded. */
  label: string | null;
}

/** One param of a hosted plug-in, as a read lists it. */
export interface HostedParamRead {
  id: string;
  name: string;
  value?: string;
}

/** A page of a hosted plug-in's params, and how many matched in all. */
export interface HostedParams {
  parameters: HostedParamRead[];
  total: number;
}

/** What the wrapper sends for one param. */
interface WrapperParam {
  index: number;
  name: string;
  display?: string;
}

/**
 * Whether a device is a plug-in host wrapper. Only Max audio effects and
 * instruments are asked, and a device that isn't a wrapper doesn't answer, so
 * the check costs nothing for it.
 * @param device - A device
 * @returns The hosted plug-in, or null for any other device
 */
export function detectHostedPlugin(device: LiveAPI): HostedPlugin | null {
  const className = device.getProperty("class_name");

  if (typeof className !== "string" || !WRAPPER_CLASSES.has(className)) {
    return null;
  }

  const reply = probePluginHost(device.id, "info");

  return reply == null ? null : { label: pluginLabel(reply) };
}

/**
 * Whether a wrapper still has its default name, so it adds nothing to the
 * plug-in it reads as.
 * @param name - The device's name
 * @returns True for a wrapper's default name
 */
export function isDefaultWrapperName(name: string): boolean {
  return DEFAULT_WRAPPER_NAMES.has(name);
}

/**
 * The id a hosted plug-in's param is addressed by.
 * @param index - The param's number in the plug-in (the first is 1)
 * @returns The id, like `h56`
 */
export function hostedParamId(index: number): string {
  return `h${index}`;
}

/**
 * Read the first params of a hosted plug-in, never more than a read lists.
 * @param device - The wrapper device
 * @param includeValues - Whether to add each param's value as the plug-in
 *   displays it
 * @param search - Case-insensitive name filter
 * @returns The params and how many matched, or null when the plug-in can't be
 *   read
 */
export function readHostedParams(
  device: LiveAPI,
  includeValues: boolean,
  search?: string,
): HostedParams | null {
  const needle = search?.trim();
  const reply = probePluginHost(device.id, "params", {
    ...(needle && { search: needle }),
    limit: MAX_READ_PARAMS,
  });

  if (reply?.success !== true) {
    return null;
  }

  const params = (reply.params ?? []) as WrapperParam[];

  return {
    parameters: params.map((param) => ({
      id: hostedParamId(param.index),
      name: param.name,
      ...(includeValues &&
        param.display != null && { value: param.display.trim() }),
    })),
    total: Number(reply.total ?? params.length),
  };
}

/**
 * The plug-in's name. A wrapper that has been through a Set reload knows its
 * plug-in only by file, as `C74_VST3:/Serum2 123456`, so the bundle name stands
 * in for it.
 * @param reply - The wrapper's reply about itself
 * @returns The name, or null when no plug-in is loaded
 */
function pluginLabel(reply: PluginHostResponse): string | null {
  const name = typeof reply.plugin === "string" ? reply.plugin : null;

  if (name == null || name === "") {
    return null;
  }

  const file = /^C74_[A-Z0-9]+:\/(.*)$/i.exec(name);

  return file ? (file[1] as string).replace(/ -?\d+$/, "") : name;
}
