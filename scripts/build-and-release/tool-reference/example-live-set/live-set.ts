// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// The example Live Set every doc example is read from: three tracks (a drum
// kit, a bass, a muted vocal), one return, two scenes, and two locators. Small
// enough to read in a doc, wide enough that every tool has something to say.

import { livePath } from "#src/shared/live-api-path-builders.ts";
import { children } from "#src/test/mocks/mock-live-api.ts";
import {
  mockNonExistentObjects,
  registerMockObject,
} from "#src/test/mocks/mock-registry.ts";
import { registerExampleClips } from "./clips.ts";
import { registerExampleDevices } from "./devices.ts";
import { ID } from "./ids.ts";
import { registerExampleTracks } from "./tracks.ts";
import { liveSetMethods } from "./writes.ts";

/**
 * Build the whole example Live Set in the mock registry.
 * @returns Nothing; every object lands in the mock registry
 */
export function buildExampleLiveSet(): void {
  // Anything the fixture forgot reads as missing rather than as a plausible
  // default, so a gap shows up as a wrong example instead of hiding.
  mockNonExistentObjects();

  // View aliases go first on purpose. In Live, "live_set view selected_track"
  // and "live_set tracks 1" are one object with one id; the mock registry keys
  // by id as well as by path, so registering the alias first lets the real
  // object win the id lookup while the alias keeps answering for its own path.
  registerViewAliases();

  registerLiveSet();
  registerExampleTracks();
  registerExampleClips();
  registerExampleDevices();
  registerScenes();
  registerLocators();
  registerApp();
}

function registerLiveSet(): void {
  registerMockObject(ID.liveSet, {
    path: livePath.liveSet,
    type: "Song",
    properties: {
      name: "Example Set",
      tempo: 110,
      signature_numerator: 4,
      signature_denominator: 4,
      is_playing: 1,
      current_song_time: 16,
      scale_mode: 1,
      scale_name: "Minor",
      root_note: 5, // F
      scale_intervals: [0, 2, 3, 5, 7, 8, 10],
      loop: 1,
      loop_start: 0,
      loop_length: 32,
      back_to_arranger: 0,
      tracks: children(ID.drumTrack, ID.bassTrack, ID.vocalTrack),
      return_tracks: children(ID.returnTrack),
      scenes: children(ID.introScene, ID.verseScene),
      cue_points: children(ID.introLocator, ID.verseLocator),
      master_track: children(ID.masterTrack),
    },
    methods: liveSetMethods(),
  });
}

function registerScenes(): void {
  registerMockObject(ID.introScene, {
    path: livePath.scene(0),
    type: "Scene",
    properties: {
      name: "Intro",
      color: 0xff4c4c,
      is_empty: 0,
      is_triggered: 0,
      tempo: -1,
      tempo_enabled: 0,
      time_signature_numerator: -1,
      time_signature_denominator: -1,
      time_signature_enabled: 0,
      clip_slots: children("drum_slot_0", "bass_slot_0", "vocal_slot_0"),
    },
  });

  registerMockObject(ID.verseScene, {
    path: livePath.scene(1),
    type: "Scene",
    properties: {
      name: "Verse",
      color: 0xb87a35,
      is_empty: 0,
      is_triggered: 0,
      tempo: 96,
      tempo_enabled: 1,
      time_signature_numerator: 6,
      time_signature_denominator: 8,
      time_signature_enabled: 1,
      clip_slots: children("drum_slot_1", "bass_slot_1", "vocal_slot_1"),
    },
  });
}

function registerLocators(): void {
  registerMockObject(ID.introLocator, {
    path: livePath.cuePoint(0),
    type: "CuePoint",
    properties: { name: "Intro", time: 0 },
  });

  registerMockObject(ID.verseLocator, {
    path: livePath.cuePoint(1),
    type: "CuePoint",
    properties: { name: "Verse", time: 32 },
  });
}

// What ppal-select reports as selected: the Bass track, the Verse scene, and
// the Bass Line clip in that scene.
function registerViewAliases(): void {
  registerMockObject(ID.bassTrack, {
    path: livePath.view.selectedTrack,
    type: "Track",
    returnPath: String(livePath.track(1)),
    properties: { has_midi_input: 1 },
  });

  registerMockObject(ID.verseScene, {
    path: livePath.view.selectedScene,
    type: "Scene",
    returnPath: livePath.scene(1),
  });

  registerMockObject(ID.bassSessionClip, {
    path: livePath.view.detailClip,
    type: "Clip",
    returnPath: livePath.track(1).clipSlot(1).clip(),
  });

  registerMockObject("bass_slot_1", {
    path: livePath.view.highlightedClipSlot,
    type: "ClipSlot",
    returnPath: String(livePath.track(1).clipSlot(1)),
  });

  registerMockObject("song_view", {
    path: livePath.view.song,
    type: "Song.View",
    methods: { select_device: () => null },
  });

  registerMockObject("bass_track_view", {
    path: `${String(livePath.track(1))} view`,
    properties: { selected_device: children(ID.bassInstrument) },
  });
}

// The app view ppal-select reads, plus the Live version ppal-connect checks.
function registerApp(): void {
  registerMockObject("app_view", {
    path: livePath.view.app,
    type: "Application.View",
    properties: { focused_document_view: "Session" },
    methods: {
      show_view: () => 0,
      focus_view: () => 0,
      hide_view: () => 0,
      is_view_visible: () => 0,
    },
  });

  registerMockObject("live_app", {
    path: "live_app",
    type: "Application",
    methods: { get_version_string: () => "12.4.1" },
  });
}
