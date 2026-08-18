// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// Object ids for the example Live Set the docs generator reads. Live hands out
// opaque numbers, so these are numbers too — grouped by hundreds per kind so an
// id in a doc example is easy to trace back here.

export const ID = {
  liveSet: "1",

  drumTrack: "101",
  bassTrack: "102",
  vocalTrack: "103",
  returnTrack: "104",
  masterTrack: "105",

  introScene: "201",
  verseScene: "202",

  drumSessionClip: "301",
  bassSessionClip: "302",
  vocalSessionClip: "303",
  bassArrangementClip: "304",
  bassTakeLaneClip: "305",

  drumRack: "401",
  kickChain: "402",
  kickSimpler: "403",
  snareChain: "404",
  snareSimpler: "405",
  bassInstrument: "406",
  bassReverb: "407",
  kickPad: "408",
  snarePad: "409",

  introLocator: "501",
  verseLocator: "502",

  // What a create or duplicate call adds to the set
  newTrack: "601",
  newScene: "602",
  newClip: "603",
  newDevice: "604",
} as const;
