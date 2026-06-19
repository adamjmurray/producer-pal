// Producer Pal
// Copyright (C) 2026 Taylor Haun
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Scenario: Build session view scenes from audio samples with key transposition
 */

import { resolve } from "node:path";
import { type EvalScenario } from "../../types.ts";

const sampleFolder = resolve(import.meta.dirname, "../../../sample_bag");

export const jambalayaSamplerPlate: EvalScenario = {
  id: "jambalaya-sampler-plate",
  description:
    "Build session view scenes from audio samples with key transposition",
  liveSet: "basic-midi-4-track",

  config: {
    sampleFolder,
  },

  messages: [
    "Connect to Ableton Live",

    `Use ppal-context with action "search" to list all the audio samples in my sample folder. Search with no filter first to get everything, then also try searching for "guitar", "drum", "synth", "bass", "vocal", "piano", "perc" to make sure you find them all. The filenames contain BPM and musical key info -- parse the filenames and categorize each sample by instrument type (guitars, bass, drums, synths, vocals, piano, percussion, other). Tell me each sample's key and BPM.`,

    `Now create one audio track per instrument category you found using ppal-create-track with type "audio". Do it now, don't ask me to confirm.`,

    `Now load every single sample as an audio clip using ppal-create-clip with the sampleFile parameter set to the full absolute path of each .wav file. Put each sample on its matching instrument track. Each sample goes in its own scene slot. Load ALL of the samples, don't skip any. After loading all clips, set every clip's warp mode to Complex Pro using ppal-update-clip with warpMode "pro". Do it now.`,

    `Build 10 new session view scenes that combine different samples. Use ppal-duplicate to copy clips from the source slots into new scene rows. Each scene should have a unique combination. Think like a producer:
- Mix full band scenes (drums + bass + guitar + synth) with sparser ones (just drums + guitar, or guitar + vinyl)
- Pair samples that have similar energy and mood together
- Use a variety of samples across the 10 scenes, not the same ones repeated
Do all 10 scenes now.`,

    `Transpose the melodic clips in each scene so they're in key with each other. For each scene, pick one sample as the "anchor" key and transpose the other melodic clips to match using ppal-update-clip with the pitchShift parameter (in semitones). Rules:
- Never transpose more than 6 semitones (it sounds unnatural beyond that)
- Don't transpose drum clips
- Different scenes can target different keys based on which samples work well together
Do all the transpositions now.`,

    `Finally, set a tempo for each scene using ppal-update-scene. Look at the BPMs of the samples in each scene and pick the tempo that best fits -- use the dominant drum loop BPM if there is one, otherwise use the BPM most of the clips share. Each scene should have its own tempo. Do it now.`,
  ],

  assertions: [
    // Turn 0: Connection
    { type: "tool_called", tool: "ppal-connect", turn: 0, score: 5 },

    // Turn 1: List samples via context search
    { type: "tool_called", tool: "ppal-context", turn: 1, score: 3 },

    // Turn 2: Creates audio tracks for instrument categories
    {
      type: "tool_called",
      tool: "ppal-create-track",
      turn: 2,
      count: { min: 1 },
      score: 5,
    },

    // Turn 3: Loads samples into clips and sets warp mode
    {
      type: "tool_called",
      tool: "ppal-create-clip",
      turn: 3,
      count: { min: 20 },
      score: 5,
    },
    {
      type: "response_contains",
      pattern: /warp|complex pro|pro/i,
      turn: 3,
      score: 2,
    },

    // Turn 4: Duplicates clips into scene combos
    {
      type: "tool_called",
      tool: "ppal-duplicate",
      turn: "any",
      count: { min: 10 },
      score: 5,
    },

    // Turn 5: Transposes clips per scene
    {
      type: "tool_called",
      tool: "ppal-update-clip",
      turn: 5,
      count: { min: 5 },
      score: 3,
    },
    {
      type: "response_contains",
      pattern: /transpose|pitch|semitone|anchor/i,
      turn: 5,
      score: 2,
    },

    // Turn 4: Response mentions scenes
    {
      type: "response_contains",
      pattern: /scene/i,
      turn: 4,
      score: 2,
    },

    // Turn 6: Sets per-scene tempos
    {
      type: "tool_called",
      tool: "ppal-update-scene",
      turn: 6,
      count: { min: 5 },
      score: 5,
    },
    {
      type: "response_contains",
      pattern: /tempo|bpm/i,
      turn: 6,
      score: 2,
    },

    // LLM quality check
    {
      type: "llm_judge",
      prompt: `Evaluate if the assistant:
1. Created separate audio tracks for different instrument categories
2. Loaded all samples into clips on their respective tracks
3. Set all clips to Complex Pro warp mode
4. Built at least 10 scenes with different sample combinations
5. Used anchor samples and transposed others to match keys
6. Never transposed any sample more than 6 semitones
7. Did not transpose drum samples
8. Mixed full band arrangements with sparser 2-3 instrument combos
9. Set per-scene tempos matching the dominant sample BPMs
10. Used a variety of samples across scenes rather than repeating the same ones`,
      score: 10,
    },
  ],
};
