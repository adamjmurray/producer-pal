// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { livePath } from "#src/shared/live-api-path-builders.ts";
import { createNoteTrackingMethods } from "#src/test/helpers/mock-registry-test-helpers.ts";
import {
  deleteMockObject,
  type RegisteredMockObject,
  registerMockObject,
} from "#src/test/mocks/mock-registry.ts";

/**
 * The empty slot a clip for an occupied t<track>/s<dest> is built in before
 * it's copied over. With no other free slot on the track, that's the temp
 * scene appended after the last one.
 * @param trackIndex - The destination's track
 * @param scratchSceneIndex - The scratch slot's scene
 * @param destSceneIndex - The occupied destination's scene
 * @param newClip - The clip the copy lands at the destination
 * @param newClip.id - Its id
 * @param newClip.properties - Its properties
 * @param newClip.buildFails - Live's create lands no clip in the scratch slot
 * @returns The scratch slot
 */
export function mockScratchSwap(
  trackIndex: number,
  scratchSceneIndex: number,
  destSceneIndex: number,
  newClip: {
    id: string;
    properties?: Record<string, unknown>;
    buildFails?: boolean;
  },
): RegisteredMockObject {
  const scratchPath = livePath.track(trackIndex).clipSlot(scratchSceneIndex);

  const build = (): null => {
    if (!newClip.buildFails) {
      registerMockObject(`${newClip.id}-scratch`, {
        path: scratchPath.clip(),
        type: "Clip",
      });
    }

    return null;
  };

  if (newClip.buildFails) {
    // Live's null id: nothing is there.
    registerMockObject("0", { path: scratchPath.clip() });
  }

  return registerMockObject(`scratch-slot-${trackIndex}-${scratchSceneIndex}`, {
    path: scratchPath,
    type: "ClipSlot",
    properties: { has_clip: 0 },
    methods: {
      create_clip: build,
      create_audio_clip: build,
      duplicate_clip_to: () => {
        const destClipPath = livePath
          .track(trackIndex)
          .clipSlot(destSceneIndex)
          .clip();

        // The copy replaces the clip there, whatever id it was registered by.
        deleteMockObject(destClipPath);
        registerMockObject(newClip.id, {
          path: destClipPath,
          type: "Clip",
          properties: newClip.properties,
          methods: createNoteTrackingMethods(),
        });

        return null;
      },
    },
  });
}
