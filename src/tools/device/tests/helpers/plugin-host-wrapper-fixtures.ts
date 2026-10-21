// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { vi } from "vitest";
import { plugin_host_response } from "#src/live-api-adapter/live-api-adapter.ts";
import {
  type RegisteredMockObject,
  registerMockObject,
} from "#src/test/mocks/mock-registry.ts";

/** A request to a wrapper, or what it answers. */
export type WrapperMessage = Record<string, unknown>;

/**
 * Make the plug-in host bus answer in the same call, as a wrapper does. An op
 * left out is never answered, like a device that isn't a wrapper.
 * @param replies - What the wrapper says to each op
 * @returns The requests the bus heard
 */
export function installWrapper(
  replies: Partial<Record<string, (request: WrapperMessage) => WrapperMessage>>,
): WrapperMessage[] {
  const heard: WrapperMessage[] = [];

  vi.mocked(globalThis.messnamed).mockReset();
  vi.mocked(globalThis.messnamed).mockImplementation(
    (_bus: string, ...args: unknown[]) => {
      const [, requestId, json] = args as [string, string, string];
      const request = JSON.parse(json) as WrapperMessage;

      heard.push(request);

      const reply = replies[request.op as string]?.(request);

      if (reply != null) {
        plugin_host_response(requestId, JSON.stringify(reply));
      }
    },
  );

  return heard;
}

/**
 * Register a Max device the way Live reports one.
 * @param options - How it differs from a plain wrapper
 * @param options.id - Its id
 * @param options.path - Its Live path
 * @param options.name - What it is called
 * @param options.className - Live's class for the device
 * @param options.type - Live's device type (1 instrument, 2 audio effect)
 * @returns The registered device
 */
export function registerWrapperDevice(options: {
  id?: string;
  path: string;
  name?: string;
  className?: string;
  type?: number;
}): RegisteredMockObject {
  const {
    id = "device-123",
    path,
    name = "PPal Plug-in Effect",
    className = "MxDeviceAudioEffect",
    type = 2,
  } = options;

  return registerMockObject(id, {
    path,
    type: "MaxDevice",
    properties: {
      name,
      class_name: className,
      class_display_name: "Max Audio Effect",
      type,
      can_have_chains: 0,
      can_have_drum_pads: 0,
      is_active: 1,
      parameters: [],
    },
  });
}

/**
 * What a wrapper says about itself.
 * @param plugin - The plug-in it hosts, or null for none
 * @returns The reply to `info`
 */
export function infoReply(plugin: string | null): WrapperMessage {
  return { success: true, plugin, loaded: plugin };
}
