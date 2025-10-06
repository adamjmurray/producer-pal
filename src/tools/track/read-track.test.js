import { describe, expect, it } from "vitest";
import { VERSION } from "../../shared/version.js";
import {
  children,
  expectedClip,
  liveApiId,
  liveApiPath,
  mockLiveApiGet,
} from "../../test/mock-live-api.js";
import {
  DEVICE_TYPE,
  LIVE_API_DEVICE_TYPE_AUDIO_EFFECT,
  LIVE_API_DEVICE_TYPE_INSTRUMENT,
  LIVE_API_DEVICE_TYPE_MIDI_EFFECT,
} from "../constants.js";
import { readTrack } from "./read-track.js";

const mockTrackProperties = (overrides = {}) => ({
  name: "Test Track",
  has_midi_input: 1,
  color: 0,
  mute: 0,
  solo: 0,
  arm: 0,
  is_foldable: 0,
  is_grouped: 0,
  group_track: ["id", 0],
  playing_slot_index: -1,
  fired_slot_index: -1,
  clip_slots: [],
  devices: [],
  ...overrides,
});

describe("readTrack", () => {
  it("returns null values when the track does not exist", () => {
    liveApiId.mockReturnValue("id 0");

    const result = readTrack({ trackIndex: 99 });

    expect(result).toEqual({
      id: null,
      type: null,
      name: null,
      trackIndex: 99,
    });
  });

  it("returns track information for MIDI tracks", () => {
    liveApiId.mockImplementation(function () {
      switch (this.path) {
        case "live_set tracks 0":
          return "track1";
        default:
          // make default mocks appear to not exist:
          return "id 0";
      }
    });
    mockLiveApiGet({
      Track: {
        has_midi_input: 1,
        name: "Track 1",
        color: 16711680, // Red
        mute: 0,
        solo: 1,
        arm: 1,
        can_be_armed: 1,
        playing_slot_index: 2,
        fired_slot_index: 3,
        clip_slots: children("slot1", "slot2"),
        devices: [],
      },
    });

    const result = readTrack({ trackIndex: 0 });

    expect(result).toEqual({
      id: "track1",
      type: "midi",
      name: "Track 1",
      trackIndex: 0,
      state: "soloed",
      isArmed: true,
      arrangementFollower: true,
      playingSlotIndex: 2,
      firedSlotIndex: 3,
      arrangementClips: [],
      sessionClips: [],
      instrument: null,
    });
  });

  it("returns track information for audio tracks", () => {
    liveApiId.mockReturnValue("track2");
    mockLiveApiGet({
      Track: {
        has_midi_input: 0,
        name: "Audio Track",
        color: 65280, // Green
        mute: 1,
        solo: 0,
        arm: 0,
        playing_slot_index: -1,
        fired_slot_index: -1,
        clip_slots: [],
        devices: [],
      },
    });

    const result = readTrack({ trackIndex: 1 });

    expect(result).toEqual({
      id: "track2",
      type: "audio",
      name: "Audio Track",
      trackIndex: 1,
      state: "muted",
      arrangementFollower: true,
      arrangementClips: [],
      sessionClips: [],
      instrument: null,
    });
  });

  it("returns track group information", () => {
    liveApiId.mockImplementation(function () {
      switch (this.path) {
        case "live_set tracks 0":
          return "track1";
        default:
          // make default mocks appear to not exist:
          return "id 0";
      }
    });
    mockLiveApiGet({
      Track: {
        has_midi_input: 1,
        name: "Track 1",
        color: 16711680, // Red
        mute: 0,
        solo: 1,
        arm: 1,
        can_be_armed: 0, // Group tracks can't be armed
        is_foldable: 1,
        is_grouped: 1,
        group_track: ["id", 456],
        playing_slot_index: 2,
        fired_slot_index: 3,
        clip_slots: children("slot1", "slot2"),
        devices: [],
      },
    });

    const result = readTrack({ trackIndex: 0 });

    expect(result).toEqual({
      id: "track1",
      type: "midi",
      name: "Track 1",
      trackIndex: 0,
      state: "soloed",
      arrangementFollower: true,
      isGroup: true,
      isGroupMember: true,
      groupId: "456",
      playingSlotIndex: 2,
      firedSlotIndex: 3,
      arrangementClips: [],
      sessionClips: [],
      instrument: null,
    });
  });

  it("should detect Producer Pal host track", () => {
    liveApiPath.mockImplementation(function () {
      if (this._path === "this_device") {
        return "live_set tracks 1 devices 0";
      }
      return this._path;
    });

    liveApiId.mockReturnValue("track1");
    mockLiveApiGet({
      Track: mockTrackProperties(),
    });

    const result = readTrack({ trackIndex: 1 });
    expect(result.hasProducerPalDevice).toBe(true);
    expect(result.producerPalVersion).toBe(VERSION);

    const result2 = readTrack({ trackIndex: 0 });
    expect(result2.hasProducerPalDevice).toBeUndefined();
    expect(result2.producerPalVersion).toBeUndefined();
  });

  it("should omit instrument property when null for Producer Pal host track", () => {
    liveApiPath.mockImplementation(function () {
      if (this._path === "this_device") {
        return "live_set tracks 1 devices 0";
      }
      return this._path;
    });

    liveApiId.mockReturnValue("track1");
    mockLiveApiGet({
      Track: mockTrackProperties({
        devices: [], // No devices means instrument will be null
      }),
    });

    // Producer Pal host track with null instrument - should omit the property
    const hostResult = readTrack({ trackIndex: 1 });
    expect(hostResult.hasProducerPalDevice).toBe(true);
    expect(hostResult).not.toHaveProperty("instrument");

    // Regular track with null instrument - should include the property
    const regularResult = readTrack({ trackIndex: 0 });
    expect(regularResult.hasProducerPalDevice).toBeUndefined();
    expect(regularResult).toHaveProperty("instrument");
    expect(regularResult.instrument).toBe(null);
  });

  it("returns sessionClips information when the track has clips in Session view", () => {
    liveApiId.mockImplementation(function () {
      switch (this.path) {
        case "live_set tracks 2":
          return "track3";
        case "live_set tracks 2 clip_slots 0 clip":
          return "clip1";
        case "live_set tracks 2 clip_slots 2 clip":
          return "clip2";
        default:
          // make default mocks appear to not exist:
          return "id 0";
      }
    });

    mockLiveApiGet({
      Track: {
        has_midi_input: 1,
        name: "Track with Clips",
        color: 255, // Blue
        mute: 0,
        solo: 0,
        arm: 0,
        playing_slot_index: 0,
        fired_slot_index: -1,
        back_to_arranger: 1,
        clip_slots: children("slot1", "slot2", "slot3"),
        devices: [],
      },
    });

    const result = readTrack({ trackIndex: 2 });

    expect(result).toEqual({
      id: "track3",
      type: "midi",
      name: "Track with Clips",
      trackIndex: 2,
      arrangementFollower: false,
      playingSlotIndex: 0,
      arrangementClips: [],
      sessionClips: [
        {
          ...expectedClip({ id: "clip1", trackIndex: 2, sceneIndex: 0 }),
          color: undefined,
        },
        {
          ...expectedClip({ id: "clip2", trackIndex: 2, sceneIndex: 2 }),
          color: undefined,
        },
      ].map(({ color, ...clip }) => clip),
      instrument: null,
    });
  });

  it("returns arrangementClips when the track has clips in Arrangement view", () => {
    liveApiId.mockImplementation(function () {
      switch (this._path) {
        case "live_set tracks 2":
          return "track3";
        case "id arr_clip1":
        case "id arr_clip2":
          return this._path.substring(3);
        default:
          // make default mocks appear to not exist:
          return "id 0";
      }
    });

    liveApiPath.mockImplementation(function () {
      switch (this._id) {
        case "arr_clip1":
          return "live_set tracks 2 arrangement_clips 0";
        case "arr_clip2":
          return "live_set tracks 2 arrangement_clips 1";
        default:
          return this._path;
      }
    });

    mockLiveApiGet({
      Track: {
        has_midi_input: 1,
        name: "Track with Arrangement Clips",
        color: 255,
        clip_slots: children("slot1", "slot2", "slot3"),
        arrangement_clips: children("arr_clip1", "arr_clip2"),
        devices: [],
      },
      arr_clip1: {
        is_arrangement_clip: 1,
      },
      arr_clip2: {
        is_arrangement_clip: 1,
      },
    });

    const result = readTrack({ trackIndex: 2 });

    expect(result.arrangementClips.length).toBe(2);
    expect(result.arrangementClips[0].id).toBe("arr_clip1");
    expect(result.arrangementClips[1].id).toBe("arr_clip2");
  });

  it("returns session clip count when includeSessionClips is false", () => {
    liveApiId.mockImplementation(function () {
      switch (this.path) {
        case "live_set tracks 2":
          return "track3";
        case "live_set tracks 2 clip_slots 0 clip": // Path-based access for slot 0
          return "clip1";
        case "live_set tracks 2 clip_slots 1 clip": // Path-based access for slot 1 (empty)
          return "id 0";
        case "live_set tracks 2 clip_slots 2 clip": // Path-based access for slot 2
          return "clip2";
        case "id slot1 clip": // Direct access to slot1's clip
          return "clip1";
        case "id slot3 clip": // Direct access to slot3's clip
          return "clip2";
        case "clip1":
          return "clip1";
        case "clip2":
          return "clip2";
        case "id clip1":
          return "clip1";
        case "id clip2":
          return "clip2";
        default:
          return "id 0";
      }
    });

    mockLiveApiGet({
      Track: {
        has_midi_input: 1,
        name: "Track with Clips",
        color: 255,
        mute: 0,
        solo: 0,
        arm: 0,
        playing_slot_index: 0,
        fired_slot_index: -1,
        back_to_arranger: 1,
        clip_slots: children("slot1", "slot2", "slot3"),
        devices: [],
      },
      "id slot1": {
        clip: ["id", "clip1"],
      },
      "id slot2": {
        clip: ["id", 0],
      },
      "id slot3": {
        clip: ["id", "clip2"],
      },
    });

    const result = readTrack({
      trackIndex: 2,
      include: ["clip-notes", "rack-chains", "instruments"],
    });

    // Since clips exist at slots 0 and 2, we should get a count of 2
    expect(result.sessionClipCount).toBe(2);
  });

  it("returns arrangement clip count when includeArrangementClips is false", () => {
    liveApiId.mockImplementation(function () {
      switch (this._path) {
        case "live_set tracks 2":
          return "track3";
        default:
          return "id 0";
      }
    });

    mockLiveApiGet({
      Track: {
        has_midi_input: 1,
        name: "Track with Arrangement Clips",
        color: 255,
        clip_slots: [],
        arrangement_clips: children("arr_clip1", "arr_clip2"),
        devices: [],
      },
    });

    const result = readTrack({
      trackIndex: 2,
      include: ["clip-notes", "rack-chains", "instruments"],
    });

    expect(result.arrangementClipCount).toBe(2);
  });

  it("returns arrangement clip count when includeArrangementClips is false (additional test)", () => {
    liveApiId.mockImplementation(function () {
      switch (this._path) {
        case "live_set tracks 1":
          return "track2";
        default:
          return "id 0";
      }
    });

    mockLiveApiGet({
      Track: {
        has_midi_input: 1,
        name: "Arrangement ID Test Track",
        color: 255,
        clip_slots: [],
        arrangement_clips: children("arr_clip3", "arr_clip4", "arr_clip5"),
        devices: [],
      },
    });

    // Call with includeArrangementClips explicitly false to get count
    const result = readTrack({
      trackIndex: 1,
      include: ["clip-notes", "rack-chains", "instruments"], // excludes "arrangement-clips"
    });

    // Verify that we get a count instead of clip details
    expect(result.arrangementClipCount).toBe(3);

    // Verify consistency with track ID format
    expect(result.id).toBe("track2");
  });

  describe("devices", () => {
    it("returns null instrument when track has no devices", () => {
      liveApiId.mockReturnValue("track1");
      mockLiveApiGet({
        Track: mockTrackProperties({
          devices: [],
        }),
      });

      const result = readTrack({ trackIndex: 0 });
      expect(result.instrument).toBeNull();
      expect(result.midiEffects).toBeUndefined();
      expect(result.audioEffects).toBeUndefined();
    });

    it("categorizes devices correctly", () => {
      liveApiId.mockImplementation(function () {
        if (this._path === "live_set tracks 0") {
          return "track1";
        }
        return this._id;
      });
      mockLiveApiGet({
        Track: mockTrackProperties({
          devices: children("device1", "device2", "device3"),
        }),
        device1: {
          name: "Custom Analog",
          class_name: "InstrumentVector",
          class_display_name: "Analog",
          type: LIVE_API_DEVICE_TYPE_INSTRUMENT,
          is_active: 1,
          can_have_chains: 0,
          can_have_drum_pads: 0,
        },
        device2: {
          name: "Custom Reverb",
          class_name: "Reverb",
          class_display_name: "Reverb",
          type: LIVE_API_DEVICE_TYPE_AUDIO_EFFECT,
          is_active: 1,
          can_have_chains: 0,
          can_have_drum_pads: 0,
        },
        device3: {
          name: "Custom Note Length",
          class_name: "MidiNoteLength",
          class_display_name: "Note Length",
          type: LIVE_API_DEVICE_TYPE_MIDI_EFFECT,
          is_active: 0,
          can_have_chains: 0,
          can_have_drum_pads: 0,
        },
      });

      const result = readTrack({
        trackIndex: 0,
        include: [
          "clip-notes",
          "rack-chains",
          "instruments",
          "session-clips",
          "arrangement-clips",
          "midi-effects",
          "audio-effects",
        ],
      });

      expect(result.instrument).toEqual({
        type: "instrument: Analog",
        name: "Custom Analog",
      });

      expect(result.audioEffects).toEqual([
        {
          type: "audio-effect: Reverb",
          name: "Custom Reverb",
        },
      ]);

      expect(result.midiEffects).toEqual([
        {
          type: "midi-effect: Note Length",
          name: "Custom Note Length",
          deactivated: true,
        },
      ]);
    });

    it("correctly identifies drum rack devices", () => {
      liveApiId.mockImplementation(function () {
        if (this._path === "live_set tracks 0") {
          return "track1";
        }
        return this._id;
      });
      mockLiveApiGet({
        Track: mockTrackProperties({
          devices: children("device1"),
        }),
        device1: {
          name: "My Drums",
          class_name: "DrumGroupDevice",
          class_display_name: "Drum Rack",
          type: LIVE_API_DEVICE_TYPE_INSTRUMENT,
          is_active: 1,
          can_have_chains: 1,
          can_have_drum_pads: 1,
          drum_pads: [],
          return_chains: [],
        },
      });

      const result = readTrack({ trackIndex: 0 });
      expect(result.instrument).toEqual({
        name: "My Drums",
        type: "drum-rack",
        drumPads: [],
      });
    });

    it("includes all device categories when explicitly requested", () => {
      liveApiId.mockImplementation(function () {
        if (this._path === "live_set tracks 0") {
          return "track1";
        }
        return this._id;
      });
      mockLiveApiGet({
        Track: mockTrackProperties({
          devices: children("device1", "device2"),
        }),
        device1: {
          name: "My Drums",
          class_name: "DrumGroupDevice",
          class_display_name: "Drum Rack",
          type: LIVE_API_DEVICE_TYPE_INSTRUMENT,
          is_active: 1,
          can_have_chains: 1,
          can_have_drum_pads: 1,
          chains: [],
          return_chains: [],
        },
        device2: {
          name: "Reverb",
          class_name: "Reverb",
          class_display_name: "Reverb",
          type: LIVE_API_DEVICE_TYPE_AUDIO_EFFECT,
          is_active: 1,
          can_have_chains: 0,
          can_have_drum_pads: 0,
        },
      });

      const result = readTrack({
        trackIndex: 0,
        include: [
          "clip-notes",
          "rack-chains",
          "instruments",
          "session-clips",
          "arrangement-clips",
          "audio-effects",
        ],
      });

      expect(result.instrument).toEqual({
        type: "drum-rack",
        name: "My Drums",
        drumPads: [],
      });

      expect(result.audioEffects).toHaveLength(1);
      expect(result.audioEffects[0]).toEqual({
        type: "audio-effect: Reverb",
      });
    });

    it("includes nested devices from instrument rack chains", () => {
      liveApiId.mockImplementation(function () {
        switch (this._path) {
          case "live_set tracks 0":
            return "track1";
          case "live_set tracks 0 devices 0":
            return "rack1";
          case "live_set tracks 0 devices 0 chains 0":
            return "chain1";
          case "live_set tracks 0 devices 0 chains 0 devices 0":
            return "nested_device1";
          default:
            return this._id;
        }
      });

      mockLiveApiGet({
        Track: mockTrackProperties({
          devices: children("rack1"),
        }),
        rack1: {
          name: "My Custom Rack",
          class_name: "InstrumentGroupDevice",
          class_display_name: "Instrument Rack",
          type: LIVE_API_DEVICE_TYPE_INSTRUMENT,
          is_active: 1,
          can_have_chains: 1,
          can_have_drum_pads: 0,
          chains: children("chain1"),
          return_chains: [],
        },
        chain1: {
          name: "Piano",
          color: 16711680, // Red
          mute: 0,
          muted_via_solo: 0,
          solo: 0,
          devices: children("nested_device1"),
        },
        nested_device1: {
          name: "Lead Synth",
          class_name: "Operator",
          class_display_name: "Operator",
          type: LIVE_API_DEVICE_TYPE_INSTRUMENT,
          is_active: 1,
          can_have_chains: 0,
          can_have_drum_pads: 0,
        },
      });

      const result = readTrack({
        trackIndex: 0,
        include: ["instruments", "rack-chains"],
      });

      expect(result.instrument).toEqual({
        type: "instrument-rack",
        name: "My Custom Rack",
        chains: [
          {
            name: "Piano",
            devices: [
              {
                type: "instrument: Operator",
                name: "Lead Synth",
              },
            ],
          },
        ],
      });
    });

    it("includes nested devices from audio effect rack chains", () => {
      liveApiId.mockImplementation(function () {
        switch (this._path) {
          case "live_set tracks 0":
            return "track1";
          case "live_set tracks 0 devices 0":
            return "fx_rack1";
          case "live_set tracks 0 devices 0 chains 0":
            return "chain1";
          case "live_set tracks 0 devices 0 chains 0 devices 0":
            return "nested_effect1";
          default:
            return this._id;
        }
      });

      mockLiveApiGet({
        Track: mockTrackProperties({
          devices: children("fx_rack1"),
        }),
        fx_rack1: {
          name: "Master FX",
          class_name: "AudioEffectGroupDevice",
          class_display_name: "Audio Effect Rack",
          type: LIVE_API_DEVICE_TYPE_AUDIO_EFFECT,
          is_active: 1,
          can_have_chains: 1,
          can_have_drum_pads: 0,
          chains: children("chain1"),
          return_chains: [],
        },
        chain1: {
          name: "Filter Chain",
          color: 255, // Blue
          mute: 0,
          muted_via_solo: 0,
          solo: 0,
          devices: children("nested_effect1"),
        },
        nested_effect1: {
          name: "Sweep Filter",
          class_name: "AutoFilter2",
          class_display_name: "Auto Filter",
          type: LIVE_API_DEVICE_TYPE_AUDIO_EFFECT,
          is_active: 1,
          can_have_chains: 0,
          can_have_drum_pads: 0,
        },
      });

      const result = readTrack({
        trackIndex: 0,
        include: [
          "clip-notes",
          "rack-chains",
          "instruments",
          "session-clips",
          "arrangement-clips",
          "audio-effects",
        ],
      });

      expect(result.audioEffects).toHaveLength(1);
      expect(result.audioEffects[0]).toEqual({
        type: "audio-effect-rack",
        name: "Master FX",
        chains: [
          {
            name: "Filter Chain",
            devices: [
              {
                type: "audio-effect: Auto Filter",
                name: "Sweep Filter",
              },
            ],
          },
        ],
      });
    });

    it("handles deeply nested racks", () => {
      liveApiId.mockImplementation(function () {
        switch (this._path) {
          case "live_set tracks 0":
            return "track1";
          case "live_set tracks 0 devices 0":
            return "outer_rack";
          case "live_set tracks 0 devices 0 chains 0":
            return "outer_chain";
          case "live_set tracks 0 devices 0 chains 0 devices 0":
            return "inner_rack";
          case "live_set tracks 0 devices 0 chains 0 devices 0 chains 0":
            return "inner_chain";
          case "live_set tracks 0 devices 0 chains 0 devices 0 chains 0 devices 0":
            return "deep_device";
          default:
            return this._id;
        }
      });

      mockLiveApiGet({
        Track: mockTrackProperties({
          devices: children("outer_rack"),
        }),
        outer_rack: {
          name: "Master FX",
          class_name: "InstrumentGroupDevice",
          class_display_name: "Instrument Rack",
          type: LIVE_API_DEVICE_TYPE_INSTRUMENT,
          is_active: 1,
          can_have_chains: 1,
          can_have_drum_pads: 0,
          chains: children("outer_chain"),
          return_chains: [],
        },
        outer_chain: {
          name: "Wet",
          color: 255, // Blue
          mute: 0,
          muted_via_solo: 0,
          solo: 0,
          devices: children("inner_rack"),
        },
        inner_rack: {
          name: "Reverb Chain",
          class_name: "AudioEffectGroupDevice",
          class_display_name: "Audio Effect Rack",
          type: LIVE_API_DEVICE_TYPE_AUDIO_EFFECT,
          is_active: 1,
          can_have_chains: 1,
          can_have_drum_pads: 0,
          chains: children("inner_chain"),
          return_chains: [],
        },
        inner_chain: {
          name: "Hall",
          color: 65280, // Green
          mute: 0,
          muted_via_solo: 0,
          solo: 1,
          devices: children("deep_device"),
        },
        deep_device: {
          name: "Big Hall",
          class_name: "Reverb",
          class_display_name: "Reverb",
          type: LIVE_API_DEVICE_TYPE_AUDIO_EFFECT,
          is_active: 1,
          can_have_chains: 0,
          can_have_drum_pads: 0,
        },
      });

      const result = readTrack({
        trackIndex: 0,
        include: ["instruments", "rack-chains"],
      });

      expect(result.instrument).toEqual({
        type: "instrument-rack",
        name: "Master FX",
        chains: [
          {
            name: "Wet",
            devices: [
              {
                type: "audio-effect-rack",
                name: "Reverb Chain",
                chains: [
                  {
                    name: "Hall",
                    state: "soloed",
                    devices: [
                      {
                        type: "audio-effect: Reverb",
                        name: "Big Hall",
                      },
                    ],
                  },
                ],
                hasSoloedChain: true,
              },
            ],
          },
        ],
      });
    });

    it("handles empty chains in racks", () => {
      liveApiId.mockImplementation(function () {
        switch (this._path) {
          case "live_set tracks 0":
            return "track1";
          case "live_set tracks 0 devices 0":
            return "rack1";
          case "live_set tracks 0 devices 0 chains 0":
            return "empty_chain";
          default:
            return this._id;
        }
      });

      mockLiveApiGet({
        Track: mockTrackProperties({
          devices: children("rack1"),
        }),
        rack1: {
          name: "My Empty Rack",
          class_name: "InstrumentGroupDevice",
          class_display_name: "Instrument Rack",
          type: LIVE_API_DEVICE_TYPE_INSTRUMENT,
          is_active: 1,
          can_have_chains: 1,
          can_have_drum_pads: 0,
          chains: children("empty_chain"),
          return_chains: [],
        },
        empty_chain: {
          name: "Empty Chain",
          color: 0, // Black
          mute: 0,
          muted_via_solo: 0,
          solo: 0,
          devices: [], // empty chain
        },
      });

      const result = readTrack({
        trackIndex: 0,
        include: ["instruments", "rack-chains"],
      });

      expect(result.instrument).toEqual({
        name: "My Empty Rack",
        type: "instrument-rack",
        chains: [
          {
            name: "Empty Chain",
            devices: [],
          },
        ],
      });
    });

    it("handles multiple chains in a rack", () => {
      liveApiId.mockImplementation(function () {
        switch (this._path) {
          case "live_set tracks 0":
            return "track1";
          case "live_set tracks 0 devices 0":
            return "rack1";
          case "live_set tracks 0 devices 0 chains 0":
            return "chain1";
          case "live_set tracks 0 devices 0 chains 1":
            return "chain2";
          case "live_set tracks 0 devices 0 chains 0 devices 0":
            return "device1";
          case "live_set tracks 0 devices 0 chains 1 devices 0":
            return "device2";
          default:
            return this._id;
        }
      });

      mockLiveApiGet({
        Track: mockTrackProperties({
          devices: children("rack1"),
        }),
        rack1: {
          name: "My Custom Rack",
          class_name: "InstrumentGroupDevice",
          class_display_name: "Instrument Rack",
          type: LIVE_API_DEVICE_TYPE_INSTRUMENT,
          is_active: 1,
          can_have_chains: 1,
          can_have_drum_pads: 0,
          chains: children("chain1", "chain2"),
          return_chains: [],
        },
        chain1: {
          name: "Piano",
          color: 16711680, // Red
          mute: 0,
          muted_via_solo: 0,
          solo: 0,
          devices: children("device1"),
        },
        chain2: {
          name: "Bass",
          color: 65280, // Green
          mute: 1,
          muted_via_solo: 0,
          solo: 0,
          devices: children("device2"),
        },
        device1: {
          name: "Lead Synth",
          class_name: "Operator",
          class_display_name: "Operator",
          type: LIVE_API_DEVICE_TYPE_INSTRUMENT,
          is_active: 1,
          can_have_chains: 0,
          can_have_drum_pads: 0,
        },
        device2: {
          name: "Bass Synth",
          class_name: "Wavetable",
          class_display_name: "Wavetable",
          type: LIVE_API_DEVICE_TYPE_INSTRUMENT,
          is_active: 1,
          can_have_chains: 0,
          can_have_drum_pads: 0,
        },
      });

      const result = readTrack({
        trackIndex: 0,
        include: ["instruments", "rack-chains"],
      });

      expect(result.instrument).toEqual({
        type: "instrument-rack",
        name: "My Custom Rack",
        chains: [
          {
            name: "Piano",
            devices: [
              {
                type: "instrument: Operator",
                name: "Lead Synth",
              },
            ],
          },
          {
            name: "Bass",
            state: "muted",
            devices: [
              {
                type: "instrument: Wavetable",
                name: "Bass Synth",
              },
            ],
          },
        ],
      });
    });

    it("handles drum rack drum pads with hasSoloedChain property", () => {
      liveApiId.mockImplementation(function () {
        switch (this._path) {
          case "live_set tracks 0":
            return "track1";
          case "live_set tracks 0 devices 0":
            return "drum_rack";
          case "live_set tracks 0 devices 0 drum_pads 36":
            return "kick_pad";
          case "live_set tracks 0 devices 0 drum_pads 38":
            return "snare_pad";
          case "live_set tracks 0 devices 0 drum_pads 36 chains 0":
            return "kick_chain";
          case "live_set tracks 0 devices 0 drum_pads 38 chains 0":
            return "snare_chain";
          default:
            return this._id;
        }
      });

      mockLiveApiGet({
        Track: mockTrackProperties({
          devices: children("drum_rack"),
        }),
        drum_rack: {
          name: "My Drums",
          class_name: "DrumGroupDevice",
          class_display_name: "Drum Rack",
          type: LIVE_API_DEVICE_TYPE_INSTRUMENT,
          is_active: 1,
          can_have_chains: 1,
          can_have_drum_pads: 1,
          drum_pads: children("kick_pad", "snare_pad"),
          return_chains: [],
        },
        kick_pad: {
          name: "Kick",
          note: 36, // C1
          mute: 0,
          solo: 0,
          chains: children("kick_chain"),
        },
        snare_pad: {
          name: "Snare",
          note: 38, // D1
          mute: 0,
          solo: 1, // This pad is soloed
          chains: children("snare_chain"),
        },
        kick_chain: {
          name: "Kick",
          color: 16711680, // Red
          mute: 0,
          muted_via_solo: 1, // Muted because snare chain is soloed
          solo: 0,
          devices: children("kick_device"),
        },
        snare_chain: {
          name: "Snare",
          color: 65280, // Green
          mute: 0,
          muted_via_solo: 0, // Not muted via solo because this is the soloed one
          solo: 1,
          devices: children("snare_device"),
        },
        kick_device: {
          name: "Simpler",
          class_name: "Simpler",
          class_display_name: "Simpler",
          type: LIVE_API_DEVICE_TYPE_INSTRUMENT,
          is_active: 1,
          can_have_chains: 0,
          can_have_drum_pads: 0,
        },
        snare_device: {
          name: "Simpler",
          class_name: "Simpler",
          class_display_name: "Simpler",
          type: LIVE_API_DEVICE_TYPE_INSTRUMENT,
          is_active: 1,
          can_have_chains: 0,
          can_have_drum_pads: 0,
        },
      });

      const result = readTrack({
        trackIndex: 0,
        include: [
          "clip-notes",
          "rack-chains",
          "instruments",
          "session-clips",
          "arrangement-clips",
          "drum-chains",
        ],
      });
      expect(result.instrument).toEqual({
        type: "drum-rack",
        name: "My Drums",
        drumPads: [
          {
            name: "Kick",
            note: 36, // C1
            state: "muted-via-solo",
            chain: {
              name: "Kick",
              state: "muted-via-solo",
              devices: [
                expect.objectContaining({
                  type: "instrument: Simpler",
                }),
              ],
            },
          },
          {
            name: "Snare",
            note: 38, // D1
            state: "soloed",
            chain: {
              name: "Snare",
              state: "soloed",
              devices: [
                expect.objectContaining({
                  type: "instrument: Simpler",
                }),
              ],
            },
          },
        ],
      });
    });

    it("combines device name and preset name", () => {
      liveApiId.mockImplementation(function () {
        if (this._path === "live_set tracks 0") {
          return "track1";
        }
        return this._id;
      });
      mockLiveApiGet({
        Track: mockTrackProperties({
          devices: children("device1", "device2"),
        }),
        device1: {
          name: "Reverb", // Same as class_display_name
          class_name: "Reverb",
          class_display_name: "Reverb",
          type: LIVE_API_DEVICE_TYPE_AUDIO_EFFECT,
          is_active: 1,
          can_have_chains: 0,
          can_have_drum_pads: 0,
        },
        device2: {
          name: "My Custom Reverb", // Different from class_display_name
          class_name: "Reverb",
          class_display_name: "Reverb",
          type: LIVE_API_DEVICE_TYPE_AUDIO_EFFECT,
          is_active: 1,
          can_have_chains: 0,
          can_have_drum_pads: 0,
        },
      });

      const result = readTrack({
        trackIndex: 0,
        include: [
          "clip-notes",
          "rack-chains",
          "instruments",
          "session-clips",
          "arrangement-clips",
          "audio-effects",
        ],
      });
      expect(result.audioEffects).toEqual([
        {
          type: "audio-effect: Reverb",
        },
        {
          type: "audio-effect: Reverb",
          name: "My Custom Reverb",
        },
      ]);
    });
  });

  describe("drumPads", () => {
    it("returns null when the track has no devices", () => {
      liveApiId.mockReturnValue("track1");
      mockLiveApiGet({
        Track: mockTrackProperties({
          name: "Track No Devices",
          devices: [],
        }),
      });
      const result = readTrack({ trackIndex: 0 });
      expect(result.drumMap).toBeUndefined();
    });

    it("returns null when the track has devices but no instruments", () => {
      liveApiId.mockReturnValue("track1");
      mockLiveApiGet({
        Track: mockTrackProperties({
          name: "Track No Instruments",
          devices: children("effect1", "effect2"),
        }),
        effect1: { type: LIVE_API_DEVICE_TYPE_AUDIO_EFFECT },
        effect2: { type: LIVE_API_DEVICE_TYPE_AUDIO_EFFECT },
      });
      const result = readTrack({ trackIndex: 0 });
      expect(result.drumMap).toBeUndefined();
    });

    it("returns null when the track has an instrument but it's not a drum rack", () => {
      mockLiveApiGet({
        Track: mockTrackProperties({
          name: "Track Non-Drum Instrument",
          devices: children("wavetable1"),
        }),
        wavetable1: {
          type: LIVE_API_DEVICE_TYPE_INSTRUMENT,
          can_have_drum_pads: 0,
        },
      });
      const result = readTrack({ trackIndex: 0 });
      expect(result.drumMap).toBeUndefined();
    });

    it("returns empty array when the drum rack has no pads", () => {
      liveApiId.mockImplementation(function () {
        if (this._path === "live_set tracks 0") return "track1";
        if (this._path === "live_set tracks 0 devices 0") return "drumrack";
        return this._id;
      });
      mockLiveApiGet({
        Track: mockTrackProperties({
          name: "Track Empty Drum Rack",
          devices: children("drumrack"),
        }),
        drumrack: {
          name: "Empty Drum Rack",
          class_name: "DrumGroupDevice",
          class_display_name: "Drum Rack",
          type: LIVE_API_DEVICE_TYPE_INSTRUMENT,
          is_active: 1,
          can_have_chains: 1,
          can_have_drum_pads: 1,
          drum_pads: [],
          return_chains: [],
        },
      });
      const result = readTrack({ trackIndex: 0 });
      expect(result.drumMap).toEqual({});
    });

    it("only includes drum pads that have chains to play a sound", () => {
      liveApiId.mockImplementation(function () {
        switch (this._path) {
          case "live_set tracks 0":
            return "track1";
          case "live_set tracks 0 devices 0":
            return "drumrack";
          case "live_set tracks 0 devices 0 drum_pads 60":
            return "pad1";
          case "live_set tracks 0 devices 0 drum_pads 62":
            return "pad2";
          case "live_set tracks 0 devices 0 drum_pads 64":
            return "pad3";
          case "live_set tracks 0 devices 0 drum_pads 60 chains 0":
            return "chain1";
          case "live_set tracks 0 devices 0 drum_pads 64 chains 0":
            return "chain2";
          default:
            return this._id;
        }
      });
      mockLiveApiGet({
        Track: mockTrackProperties({
          name: "Track Drum Rack With Pads",
          devices: children("drumrack"),
        }),
        drumrack: {
          name: "Drum Rack With Pads",
          class_name: "DrumGroupDevice",
          class_display_name: "Drum Rack",
          type: LIVE_API_DEVICE_TYPE_INSTRUMENT,
          is_active: 1,
          can_have_chains: 1,
          can_have_drum_pads: 1,
          drum_pads: children("pad1", "pad2", "pad3"),
          return_chains: [],
        },
        pad1: {
          note: 60, // C3
          name: "Kick",
          mute: 0,
          solo: 0,
          chains: children("chain1"),
        },
        pad2: {
          note: 62, // D3
          name: "Snare",
          mute: 0,
          solo: 0,
          chains: [], // No chains, should be excluded
        },
        pad3: {
          note: 64, // E3
          name: "Hi-hat",
          mute: 0,
          solo: 0,
          chains: children("chain2"),
        },
        chain1: {
          name: "Kick",
          color: 16711680,
          mute: 0,
          solo: 0,
          devices: children("kick_device"),
        },
        chain2: {
          name: "Hi-hat",
          color: 65280,
          mute: 0,
          solo: 0,
          devices: children("hihat_device"),
        },
        kick_device: {
          name: "Simpler",
          class_name: "Simpler",
          class_display_name: "Simpler",
          type: LIVE_API_DEVICE_TYPE_INSTRUMENT,
          is_active: 1,
          can_have_chains: 0,
          can_have_drum_pads: 0,
        },
        hihat_device: {
          name: "Simpler",
          class_name: "Simpler",
          class_display_name: "Simpler",
          type: LIVE_API_DEVICE_TYPE_INSTRUMENT,
          is_active: 1,
          can_have_chains: 0,
          can_have_drum_pads: 0,
        },
      });
      const result = readTrack({ trackIndex: 0 });
      expect(result.drumMap).toEqual({
        C3: "Kick",
        E3: "Hi-hat",
      });
    });

    it("stops at first drum rack found", () => {
      liveApiId.mockImplementation(function () {
        switch (this._path) {
          case "live_set tracks 0":
            return "track1";
          case "live_set tracks 0 devices 0":
            return "midiEffect";
          case "live_set tracks 0 devices 1":
            return "drumrack1";
          case "live_set tracks 0 devices 2":
            return "drumrack2";
          case "live_set tracks 0 devices 1 drum_pads 60":
            return "pad1";
          case "live_set tracks 0 devices 1 drum_pads 60 chains 0":
            return "chain1";
          case "live_set tracks 0 devices 2 drum_pads 61":
            return "pad2";
          case "live_set tracks 0 devices 2 drum_pads 61 chains 0":
            return "chain2";
          default:
            return this._id;
        }
      });
      mockLiveApiGet({
        Track: mockTrackProperties({
          name: "Track Multiple Instruments",
          // In theory you could have multiple drum racks in an instrument rack.
          // this is not supported as a feature, but let's make sure something reasonable happens:
          devices: children("midiEffect", "drumrack1", "drumrack2"),
        }),
        midiEffect: {
          name: "MIDI Effect",
          class_name: "MidiEffect",
          class_display_name: "MIDI Effect",
          type: LIVE_API_DEVICE_TYPE_MIDI_EFFECT,
          is_active: 1,
          can_have_chains: 0,
          can_have_drum_pads: 0,
        },
        drumrack1: {
          name: "First Drum Rack",
          class_name: "DrumGroupDevice",
          class_display_name: "Drum Rack",
          type: LIVE_API_DEVICE_TYPE_INSTRUMENT,
          is_active: 1,
          can_have_chains: 1,
          can_have_drum_pads: 1,
          drum_pads: children("pad1"),
          return_chains: [],
        },
        pad1: {
          note: 60, // C3
          name: "First Drum Rack Kick",
          mute: 0,
          solo: 0,
          chains: children("chain1"),
        },
        chain1: {
          name: "First Drum Rack Kick",
          color: 16711680,
          mute: 0,
          solo: 0,
          devices: children("device1"),
        },
        device1: {
          name: "Simpler",
          class_name: "Simpler",
          class_display_name: "Simpler",
          type: LIVE_API_DEVICE_TYPE_INSTRUMENT,
          is_active: 1,
          can_have_chains: 0,
          can_have_drum_pads: 0,
        },
        drumrack2: {
          name: "Second Drum Rack",
          class_name: "DrumGroupDevice",
          class_display_name: "Drum Rack",
          type: LIVE_API_DEVICE_TYPE_INSTRUMENT,
          is_active: 1,
          can_have_chains: 1,
          can_have_drum_pads: 1,
          drum_pads: children("pad2"),
          return_chains: [],
        },
        pad2: {
          note: 61, // Db3
          name: "Second Drum Rack Snare",
          mute: 0,
          solo: 0,
          chains: children("chain2"),
        },
        chain2: {
          name: "Second Drum Rack Snare",
          color: 65280,
          mute: 0,
          solo: 0,
          devices: children("device2"),
        },
        device2: {
          name: "Simpler",
          class_name: "Simpler",
          class_display_name: "Simpler",
          type: LIVE_API_DEVICE_TYPE_INSTRUMENT,
          is_active: 1,
          can_have_chains: 0,
          can_have_drum_pads: 0,
        },
      });
      const result = readTrack({ trackIndex: 0 });
      expect(result.drumMap).toEqual({
        C3: "First Drum Rack Kick",
      });
    });

    it("finds drum pads in nested drum rack inside instrument rack", () => {
      liveApiId.mockImplementation(function () {
        switch (this._path) {
          case "live_set tracks 0":
            return "track1";
          case "live_set tracks 0 devices 0":
            return "instrumentRack";
          case "live_set tracks 0 devices 0 chains 0":
            return "chain1";
          case "live_set tracks 0 devices 0 chains 0 devices 0":
            return "nestedDrumRack";
          case "live_set tracks 0 devices 0 chains 0 devices 0 drum_pads 36":
            return "pad1";
          case "live_set tracks 0 devices 0 chains 0 devices 0 drum_pads 37":
            return "pad2";
          case "live_set tracks 0 devices 0 chains 0 devices 0 drum_pads 36 chains 0":
            return "drumchain1";
          case "live_set tracks 0 devices 0 chains 0 devices 0 drum_pads 37 chains 0":
            return "drumchain2";
          default:
            return this._id;
        }
      });
      mockLiveApiGet({
        Track: mockTrackProperties({
          name: "Track Nested Drum Rack",
          devices: children("instrumentRack"),
        }),
        instrumentRack: {
          name: "Instrument Rack",
          class_name: "InstrumentGroupDevice",
          class_display_name: "Instrument Rack",
          type: LIVE_API_DEVICE_TYPE_INSTRUMENT,
          is_active: 1,
          can_have_chains: 1,
          can_have_drum_pads: 0,
          chains: children("chain1"),
          return_chains: [],
        },
        chain1: {
          name: "Chain 1",
          color: 16711680,
          mute: 0,
          solo: 0,
          devices: children("nestedDrumRack"),
        },
        nestedDrumRack: {
          name: "Nested Drum Rack",
          class_name: "DrumGroupDevice",
          class_display_name: "Drum Rack",
          type: LIVE_API_DEVICE_TYPE_INSTRUMENT,
          is_active: 1,
          can_have_chains: 1,
          can_have_drum_pads: 1,
          drum_pads: children("pad1", "pad2"),
          return_chains: [],
        },
        pad1: {
          note: 36, // C1
          name: "Kick Dub",
          mute: 0,
          solo: 0,
          chains: children("drumchain1"),
        },
        pad2: {
          note: 37, // Db1
          name: "Snare Dub",
          mute: 0,
          solo: 0,
          chains: children("drumchain2"),
        },
        drumchain1: {
          name: "Kick Dub",
          color: 16711680,
          mute: 0,
          solo: 0,
          devices: children("kickdevice"),
        },
        drumchain2: {
          name: "Snare Dub",
          color: 65280,
          mute: 0,
          solo: 0,
          devices: children("snaredevice"),
        },
        kickdevice: {
          name: "Simpler",
          class_name: "Simpler",
          class_display_name: "Simpler",
          type: LIVE_API_DEVICE_TYPE_INSTRUMENT,
          is_active: 1,
          can_have_chains: 0,
          can_have_drum_pads: 0,
        },
        snaredevice: {
          name: "Simpler",
          class_name: "Simpler",
          class_display_name: "Simpler",
          type: LIVE_API_DEVICE_TYPE_INSTRUMENT,
          is_active: 1,
          can_have_chains: 0,
          can_have_drum_pads: 0,
        },
      });
      const result = readTrack({ trackIndex: 0 });
      expect(result.drumMap).toEqual({
        C1: "Kick Dub",
        Db1: "Snare Dub",
      });
    });

    it("returns null when instrument rack has no chains", () => {
      mockLiveApiGet({
        Track: mockTrackProperties({
          name: "Track Empty Instrument Rack",
          devices: children("instrumentRack"),
        }),
        instrumentRack: {
          type: LIVE_API_DEVICE_TYPE_INSTRUMENT,
          can_have_drum_pads: 0,
          class_name: "InstrumentGroupDevice",
          chains: [],
        },
      });
      const result = readTrack({ trackIndex: 0 });
      expect(result.drumMap).toBeUndefined();
    });

    it("returns null when instrument rack first chain has no devices", () => {
      mockLiveApiGet({
        Track: mockTrackProperties({
          name: "Track Instrument Rack Empty Chain",
          devices: children("instrumentRack"),
        }),
        instrumentRack: {
          type: LIVE_API_DEVICE_TYPE_INSTRUMENT,
          can_have_drum_pads: 0,
          class_name: "InstrumentGroupDevice",
          chains: children("chain1"),
        },
        chain1: {
          devices: [],
        },
      });
      const result = readTrack({ trackIndex: 0 });
      expect(result.drumMap).toBeUndefined();
    });

    it("returns null when instrument rack first chain first device is not a drum rack", () => {
      mockLiveApiGet({
        Track: mockTrackProperties({
          name: "Track Instrument Rack Non-Drum Device",
          devices: children("instrumentRack"),
        }),
        instrumentRack: {
          type: LIVE_API_DEVICE_TYPE_INSTRUMENT,
          can_have_drum_pads: 0,
          class_name: "InstrumentGroupDevice",
          chains: children("chain1"),
        },
        chain1: {
          devices: children("wavetable"),
        },
        wavetable: {
          type: LIVE_API_DEVICE_TYPE_INSTRUMENT,
          can_have_drum_pads: 0,
        },
      });
      const result = readTrack({ trackIndex: 0 });
      expect(result.drumMap).toBeUndefined();
    });

    it("prefers direct drum rack over nested drum rack", () => {
      mockLiveApiGet({
        Track: mockTrackProperties({
          name: "Track Direct and Nested Drum Racks",
          devices: children("directDrumRack", "instrumentRack"),
        }),
        directDrumRack: {
          type: LIVE_API_DEVICE_TYPE_INSTRUMENT,
          can_have_drum_pads: 1,
          drum_pads: children("pad1"),
        },
        pad1: {
          note: 60,
          name: "Direct Kick",
          chains: children("chain1"),
        },
        instrumentRack: {
          type: LIVE_API_DEVICE_TYPE_INSTRUMENT,
          can_have_drum_pads: 0,
          class_name: "InstrumentGroupDevice",
          chains: children("chain1"),
        },
        chain1: {
          devices: children("nestedDrumRack"),
        },
        nestedDrumRack: {
          type: LIVE_API_DEVICE_TYPE_INSTRUMENT,
          can_have_drum_pads: 1,
          drum_pads: children("pad2"),
        },
        pad2: {
          note: 61,
          name: "Nested Snare",
          chains: children("chain2"),
        },
      });
      const result = readTrack({ trackIndex: 0 });
      expect(result.drumMap).toEqual({ C3: "Direct Kick" });
    });

    it("adds hasInstrument:false property only to drum pads without instruments", () => {
      liveApiId.mockImplementation(function () {
        switch (this._path) {
          case "live_set tracks 0":
            return "track1";
          case "live_set tracks 0 devices 0":
            return "drum_rack";
          case "live_set tracks 0 devices 0 drum_pads 36":
            return "kick_pad";
          case "live_set tracks 0 devices 0 drum_pads 37":
            return "empty_pad";
          case "live_set tracks 0 devices 0 drum_pads 36 chains 0":
            return "kick_chain";
          case "live_set tracks 0 devices 0 drum_pads 37 chains 0":
            return "empty_chain";
          default:
            return this._id;
        }
      });

      mockLiveApiGet({
        Track: mockTrackProperties({
          devices: children("drum_rack"),
        }),
        drum_rack: {
          name: "Test Drum Rack",
          class_name: "DrumGroupDevice",
          class_display_name: "Drum Rack",
          type: LIVE_API_DEVICE_TYPE_INSTRUMENT,
          is_active: 1,
          can_have_chains: 1,
          can_have_drum_pads: 1,
          drum_pads: children("kick_pad", "empty_pad"),
          return_chains: [],
        },
        kick_pad: {
          name: "Kick",
          note: 36,
          mute: 0,
          solo: 0,
          chains: children("kick_chain"),
        },
        empty_pad: {
          name: "Empty",
          note: 37,
          mute: 0,
          solo: 0,
          chains: children("empty_chain"),
        },
        kick_chain: {
          name: "Kick",
          color: 16711680,
          mute: 0,
          muted_via_solo: 0,
          solo: 0,
          devices: children("kick_device"),
        },
        empty_chain: {
          name: "Empty",
          color: 65280,
          mute: 0,
          muted_via_solo: 0,
          solo: 0,
          devices: [], // No devices = no instruments
        },
        kick_device: {
          name: "Simpler",
          class_name: "Simpler",
          class_display_name: "Simpler",
          type: LIVE_API_DEVICE_TYPE_INSTRUMENT,
          is_active: 1,
          can_have_chains: 0,
          can_have_drum_pads: 0,
        },
      });

      const result = readTrack({
        trackIndex: 0,
        include: [
          "clip-notes",
          "rack-chains",
          "instruments",
          "session-clips",
          "arrangement-clips",
          "drum-chains",
        ],
      });

      expect(result.instrument.drumPads).toEqual([
        expect.objectContaining({
          name: "Kick",
          note: 36,
          // Should not have hasInstrument property when it has an instrument
        }),
        expect.objectContaining({
          name: "Empty",
          note: 37,
          hasInstrument: false, // Should have hasInstrument: false when no instruments
        }),
      ]);

      // The kick pad should not have hasInstrument property
      expect(result.instrument.drumPads[0]).not.toHaveProperty("hasInstrument");
      // The empty pad should have hasInstrument: false
      expect(result.instrument.drumPads[1]).toHaveProperty(
        "hasInstrument",
        false,
      );
    });

    it("excludes drum pads without instruments from drumMap", () => {
      liveApiId.mockImplementation(function () {
        switch (this._path) {
          case "live_set tracks 0":
            return "track1";
          case "live_set tracks 0 devices 0":
            return "drum_rack";
          case "live_set tracks 0 devices 0 drum_pads 36":
            return "kick_pad";
          case "live_set tracks 0 devices 0 drum_pads 37":
            return "empty_pad";
          case "live_set tracks 0 devices 0 drum_pads 38":
            return "snare_pad";
          case "live_set tracks 0 devices 0 drum_pads 36 chains 0":
            return "kick_chain";
          case "live_set tracks 0 devices 0 drum_pads 37 chains 0":
            return "empty_chain";
          case "live_set tracks 0 devices 0 drum_pads 38 chains 0":
            return "snare_chain";
          default:
            return this._id;
        }
      });

      mockLiveApiGet({
        Track: mockTrackProperties({
          devices: children("drum_rack"),
        }),
        drum_rack: {
          name: "Test Drum Rack",
          class_name: "DrumGroupDevice",
          class_display_name: "Drum Rack",
          type: LIVE_API_DEVICE_TYPE_INSTRUMENT,
          is_active: 1,
          can_have_chains: 1,
          can_have_drum_pads: 1,
          drum_pads: children("kick_pad", "empty_pad", "snare_pad"),
          return_chains: [],
        },
        kick_pad: {
          name: "Kick",
          note: 36, // C1
          mute: 0,
          solo: 0,
          chains: children("kick_chain"),
        },
        empty_pad: {
          name: "Empty",
          note: 37, // Db1
          mute: 0,
          solo: 0,
          chains: children("empty_chain"),
        },
        snare_pad: {
          name: "Snare",
          note: 38, // D1
          mute: 0,
          solo: 0,
          chains: children("snare_chain"),
        },
        kick_chain: {
          name: "Kick",
          color: 16711680,
          mute: 0,
          muted_via_solo: 0,
          solo: 0,
          devices: children("kick_device"),
        },
        empty_chain: {
          name: "Empty",
          color: 65280,
          mute: 0,
          muted_via_solo: 0,
          solo: 0,
          devices: [], // No devices = no instruments
        },
        snare_chain: {
          name: "Snare",
          color: 255,
          mute: 0,
          muted_via_solo: 0,
          solo: 0,
          devices: children("snare_device"),
        },
        kick_device: {
          name: "Simpler",
          class_name: "Simpler",
          class_display_name: "Simpler",
          type: LIVE_API_DEVICE_TYPE_INSTRUMENT,
          is_active: 1,
          can_have_chains: 0,
          can_have_drum_pads: 0,
        },
        snare_device: {
          name: "Simpler",
          class_name: "Simpler",
          class_display_name: "Simpler",
          type: LIVE_API_DEVICE_TYPE_INSTRUMENT,
          is_active: 1,
          can_have_chains: 0,
          can_have_drum_pads: 0,
        },
      });

      const result = readTrack({ trackIndex: 0 });

      // drumMap should only include pads with instruments (kick and snare), not empty pad
      expect(result.drumMap).toEqual({
        C1: "Kick", // Has instrument, included
        D1: "Snare", // Has instrument, included
        // Db1 "Empty" should be excluded because it has no instruments
      });
    });

    it("detects instruments nested within racks in drum pad chains", () => {
      liveApiId.mockImplementation(function () {
        switch (this._path) {
          case "live_set tracks 0":
            return "track1";
          case "live_set tracks 0 devices 0":
            return "drum_rack";
          case "live_set tracks 0 devices 0 drum_pads 36":
            return "kick_pad";
          case "live_set tracks 0 devices 0 drum_pads 36 chains 0":
            return "kick_chain";
          case "live_set tracks 0 devices 0 drum_pads 36 chains 0 devices 0":
            return "nested_rack";
          case "live_set tracks 0 devices 0 drum_pads 36 chains 0 devices 0 chains 0":
            return "nested_chain";
          case "live_set tracks 0 devices 0 drum_pads 36 chains 0 devices 0 chains 0 devices 0":
            return "nested_instrument";
          default:
            return this._id;
        }
      });

      mockLiveApiGet({
        Track: mockTrackProperties({
          devices: children("drum_rack"),
        }),
        drum_rack: {
          name: "Test Drum Rack",
          class_name: "DrumGroupDevice",
          class_display_name: "Drum Rack",
          type: LIVE_API_DEVICE_TYPE_INSTRUMENT,
          is_active: 1,
          can_have_chains: 1,
          can_have_drum_pads: 1,
          drum_pads: children("kick_pad"),
          return_chains: [],
        },
        kick_pad: {
          name: "Kick",
          note: 36,
          mute: 0,
          solo: 0,
          chains: children("kick_chain"),
        },
        kick_chain: {
          name: "Kick",
          color: 16711680,
          mute: 0,
          muted_via_solo: 0,
          solo: 0,
          devices: children("nested_rack"), // Nested rack instead of direct instrument
        },
        nested_rack: {
          name: "Nested Rack",
          class_name: "InstrumentGroupDevice",
          class_display_name: "Instrument Rack",
          type: LIVE_API_DEVICE_TYPE_INSTRUMENT,
          is_active: 1,
          can_have_chains: 1,
          can_have_drum_pads: 0,
          chains: children("nested_chain"),
          return_chains: [],
        },
        nested_chain: {
          name: "Nested Chain",
          color: 65280,
          mute: 0,
          muted_via_solo: 0,
          solo: 0,
          devices: children("nested_instrument"),
        },
        nested_instruments: {
          name: "Simpler",
          class_name: "Simpler",
          class_display_name: "Simpler",
          type: LIVE_API_DEVICE_TYPE_INSTRUMENT,
          is_active: 1,
          can_have_chains: 0,
          can_have_drum_pads: 0,
        },
      });

      const result = readTrack({
        trackIndex: 0,
        include: [
          "clip-notes",
          "rack-chains",
          "instruments",
          "session-clips",
          "arrangement-clips",
          "drum-chains",
        ],
      });

      // Should detect the nested instrument and not add hasInstrument property
      expect(result.instrument.drumPads[0]).not.toHaveProperty("hasInstrument");

      // drumMap should include the drum pad since it has a nested instrument
      expect(result.drumMap).toEqual({
        C1: "Kick",
      });
    });
  });

  describe("includeRoutings", () => {
    it("excludes routing properties by default", () => {
      liveApiId.mockReturnValue("track1");
      mockLiveApiGet({
        Track: mockTrackProperties({
          available_input_routing_channels: [
            '{"available_input_routing_channels": [{"display_name": "In 1", "identifier": 1}, {"display_name": "In 2", "identifier": 2}]}',
          ],
          available_input_routing_types: [
            '{"available_input_routing_types": [{"display_name": "Ext. In", "identifier": 17}, {"display_name": "Resampling", "identifier": 18}]}',
          ],
          available_output_routing_channels: [
            '{"available_output_routing_channels": [{"display_name": "Master", "identifier": 26}, {"display_name": "A", "identifier": 27}]}',
          ],
          available_output_routing_types: [
            '{"available_output_routing_types": [{"display_name": "Track Out", "identifier": 25}, {"display_name": "Send Only", "identifier": 28}]}',
          ],
          input_routing_channel: [
            '{"input_routing_channel": {"display_name": "In 1", "identifier": 1}}',
          ],
          input_routing_type: [
            '{"input_routing_type": {"display_name": "Ext. In", "identifier": 17}}',
          ],
          output_routing_channel: [
            '{"output_routing_channel": {"display_name": "Master", "identifier": 26}}',
          ],
          output_routing_type: [
            '{"output_routing_type": {"display_name": "Track Out", "identifier": 25}}',
          ],
        }),
      });

      const result = readTrack({ trackIndex: 0 });

      expect(result.availableInputRoutingChannels).toBeUndefined();
      expect(result.availableInputRoutingTypes).toBeUndefined();
      expect(result.availableOutputRoutingChannels).toBeUndefined();
      expect(result.availableOutputRoutingTypes).toBeUndefined();
      expect(result.inputRoutingChannel).toBeUndefined();
      expect(result.inputRoutingType).toBeUndefined();
      expect(result.outputRoutingChannel).toBeUndefined();
      expect(result.outputRoutingType).toBeUndefined();
    });

    it("includes routing properties when includeRoutings is true", () => {
      liveApiId.mockReturnValue("track1");
      mockLiveApiGet({
        Track: mockTrackProperties({
          available_input_routing_channels: [
            '{"available_input_routing_channels": [{"display_name": "In 1", "identifier": 1}, {"display_name": "In 2", "identifier": 2}]}',
          ],
          available_input_routing_types: [
            '{"available_input_routing_types": [{"display_name": "Ext. In", "identifier": 17}, {"display_name": "Resampling", "identifier": 18}]}',
          ],
          available_output_routing_channels: [
            '{"available_output_routing_channels": [{"display_name": "Master", "identifier": 26}, {"display_name": "A", "identifier": 27}]}',
          ],
          available_output_routing_types: [
            '{"available_output_routing_types": [{"display_name": "Track Out", "identifier": 25}, {"display_name": "Send Only", "identifier": 28}]}',
          ],
          input_routing_channel: [
            '{"input_routing_channel": {"display_name": "In 1", "identifier": 1}}',
          ],
          input_routing_type: [
            '{"input_routing_type": {"display_name": "Ext. In", "identifier": 17}}',
          ],
          output_routing_channel: [
            '{"output_routing_channel": {"display_name": "Master", "identifier": 26}}',
          ],
          output_routing_type: [
            '{"output_routing_type": {"display_name": "Track Out", "identifier": 25}}',
          ],
          current_monitoring_state: [1],
        }),
      });

      const result = readTrack({
        trackIndex: 0,
        include: ["all-routings"],
      });

      expect(result.availableInputRoutingChannels).toEqual([
        { name: "In 1", inputId: "1" },
        { name: "In 2", inputId: "2" },
      ]);
      expect(result.availableInputRoutingTypes).toEqual([
        { name: "Ext. In", inputId: "17" },
        { name: "Resampling", inputId: "18" },
      ]);
      expect(result.availableOutputRoutingChannels).toEqual([
        { name: "Master", outputId: "26" },
        { name: "A", outputId: "27" },
      ]);
      expect(result.availableOutputRoutingTypes).toEqual([
        { name: "Track Out", outputId: "25" },
        { name: "Send Only", outputId: "28" },
      ]);
      expect(result.inputRoutingChannel).toEqual({
        name: "In 1",
        inputId: "1",
      });
      expect(result.inputRoutingType).toEqual({
        name: "Ext. In",
        inputId: "17",
      });
      expect(result.outputRoutingChannel).toEqual({
        name: "Master",
        outputId: "26",
      });
      expect(result.outputRoutingType).toEqual({
        name: "Track Out",
        outputId: "25",
      });
      expect(result.monitoringState).toBe("auto");
    });

    it("handles null routing properties gracefully", () => {
      liveApiId.mockReturnValue("track1");
      mockLiveApiGet({
        Track: mockTrackProperties({
          available_input_routing_channels: null,
          available_input_routing_types: null,
          available_output_routing_channels: null,
          available_output_routing_types: null,
          input_routing_channel: null,
          input_routing_type: null,
          output_routing_channel: null,
          output_routing_type: null,
          current_monitoring_state: [999],
        }),
      });

      const result = readTrack({
        trackIndex: 0,
        include: ["all-routings"],
      });

      expect(result.availableInputRoutingChannels).toEqual([]);
      expect(result.availableInputRoutingTypes).toEqual([]);
      expect(result.availableOutputRoutingChannels).toEqual([]);
      expect(result.availableOutputRoutingTypes).toEqual([]);
      expect(result.inputRoutingChannel).toBeNull();
      expect(result.inputRoutingType).toBeNull();
      expect(result.outputRoutingChannel).toBeNull();
      expect(result.outputRoutingType).toBeNull();
      expect(result.monitoringState).toBe("unknown");
    });

    it("excludes input routing properties for group tracks when includeRoutings is true", () => {
      liveApiId.mockReturnValue("group1");
      mockLiveApiGet({
        Track: mockTrackProperties({
          is_foldable: 1, // This makes it a group track
          can_be_armed: 0, // Group tracks can't be armed
          available_output_routing_channels: [
            '{"available_output_routing_channels": [{"display_name": "Master", "identifier": 26}, {"display_name": "A", "identifier": 27}]}',
          ],
          available_output_routing_types: [
            '{"available_output_routing_types": [{"display_name": "Track Out", "identifier": 25}, {"display_name": "Send Only", "identifier": 28}]}',
          ],
          output_routing_channel: [
            '{"output_routing_channel": {"display_name": "Master", "identifier": 26}}',
          ],
          output_routing_type: [
            '{"output_routing_type": {"display_name": "Track Out", "identifier": 25}}',
          ],
          current_monitoring_state: [1],
        }),
      });

      const result = readTrack({
        trackIndex: 0,
        include: ["all-routings"],
      });

      // Group tracks should omit input routing properties entirely
      expect(result.availableInputRoutingChannels).toBeUndefined();
      expect(result.availableInputRoutingTypes).toBeUndefined();
      expect(result.inputRoutingChannel).toBeUndefined();
      expect(result.inputRoutingType).toBeUndefined();

      // But should still have output routing properties
      expect(result.availableOutputRoutingChannels).toEqual([
        { name: "Master", outputId: "26" },
        { name: "A", outputId: "27" },
      ]);
      expect(result.availableOutputRoutingTypes).toEqual([
        { name: "Track Out", outputId: "25" },
        { name: "Send Only", outputId: "28" },
      ]);
      expect(result.outputRoutingChannel).toEqual({
        name: "Master",
        outputId: "26",
      });
      expect(result.outputRoutingType).toEqual({
        name: "Track Out",
        outputId: "25",
      });

      // Group track specific properties
      expect(result.isGroup).toBe(true);
      expect(result.isArmed).toBeUndefined();
      expect(result.monitoringState).toBeUndefined(); // Group tracks cannot be armed, so monitoring state is omitted
    });

    it("returns unknown monitoring state for unsupported values", () => {
      liveApiId.mockReturnValue("track1");
      mockLiveApiGet({
        Track: mockTrackProperties({
          current_monitoring_state: [999], // Invalid monitoring state value
        }),
      });

      const result = readTrack({
        trackIndex: 0,
        include: ["all-routings"],
      });

      // Should return "unknown" for unsupported monitoring state values
      expect(result.monitoringState).toBe("unknown");

      // Other routing properties should still work
      expect(result.availableInputRoutingChannels).toEqual([]);
      expect(result.availableInputRoutingTypes).toEqual([]);
      expect(result.availableOutputRoutingChannels).toEqual([]);
      expect(result.availableOutputRoutingTypes).toEqual([]);
    });

    it("omits monitoring state for tracks that cannot be armed", () => {
      liveApiId.mockReturnValue("track1");
      mockLiveApiGet({
        Track: mockTrackProperties({
          can_be_armed: [0], // Track cannot be armed (group/master/return tracks)
          current_monitoring_state: [1], // This should not be accessed
        }),
      });

      const result = readTrack({
        trackIndex: 0,
        include: [
          "clip-notes",
          "rack-chains",
          "instruments",
          "session-clips",
          "arrangement-clips",
          "routings",
        ],
      });

      // Should omit monitoringState property without accessing current_monitoring_state
      expect(result.monitoringState).toBeUndefined();
      expect(result.isArmed).toBeUndefined();
    });
  });

  describe("wildcard include '*'", () => {
    it("includes all available options when '*' is used", () => {
      liveApiId.mockImplementation(function () {
        switch (this._path) {
          case "live_set tracks 0":
            return "track1";
          case "live_set tracks 0 devices 0":
            return "synth1";
          case "live_set tracks 0 devices 1":
            return "effect1";
          case "live_set tracks 0 clip_slots 0 clip":
            return "clip1";
          default:
            return this._id;
        }
      });

      mockLiveApiGet({
        Track: mockTrackProperties({
          name: "Wildcard Test Track",
          has_midi_input: 1,
          devices: children("synth1", "effect1"),
          clip_slots: children("slot1"),
          arrangement_clips: children("arr_clip1"),
          available_input_routing_channels: [
            '{"available_input_routing_channels": [{"display_name": "In 1", "identifier": 1}]}',
          ],
          available_input_routing_types: [
            '{"available_input_routing_types": [{"display_name": "Ext. In", "identifier": 17}]}',
          ],
          available_output_routing_channels: [
            '{"available_output_routing_channels": [{"display_name": "Master", "identifier": 26}]}',
          ],
          available_output_routing_types: [
            '{"available_output_routing_types": [{"display_name": "Track Out", "identifier": 25}]}',
          ],
          input_routing_channel: [
            '{"input_routing_channel": {"display_name": "In 1", "identifier": 1}}',
          ],
          input_routing_type: [
            '{"input_routing_type": {"display_name": "Ext. In", "identifier": 17}}',
          ],
          output_routing_channel: [
            '{"output_routing_channel": {"display_name": "Master", "identifier": 26}}',
          ],
          output_routing_type: [
            '{"output_routing_type": {"display_name": "Track Out", "identifier": 25}}',
          ],
          current_monitoring_state: [1],
        }),
        synth1: {
          name: "Analog",
          class_name: "UltraAnalog",
          class_display_name: "Analog",
          type: LIVE_API_DEVICE_TYPE_INSTRUMENT,
          is_active: 1,
          can_have_chains: 0,
          can_have_drum_pads: 0,
        },
        effect1: {
          name: "Reverb",
          class_name: "Reverb",
          class_display_name: "Reverb",
          type: LIVE_API_DEVICE_TYPE_AUDIO_EFFECT,
          is_active: 1,
          can_have_chains: 0,
          can_have_drum_pads: 0,
        },
        slot1: {
          clip: expectedClip("clip1", "session"),
        },
        clip1: expectedClip("clip1", "session"),
        arr_clip1: expectedClip("arr_clip1", "arrangement"),
      });

      // Test with '*' - should include everything
      const resultWildcard = readTrack({
        trackIndex: 0,
        include: ["*"],
      });

      // Test explicit list - should produce identical result
      const resultExplicit = readTrack({
        trackIndex: 0,
        include: [
          "drum-chains",
          "clip-notes",
          "rack-chains",
          "midi-effects",
          "instruments",
          "audio-effects",
          "routings",
          "available-routings",
          "session-clips",
          "arrangement-clips",
          "all-devices",
          "all-routings",
          "color",
        ],
      });

      // Results should be identical
      expect(resultWildcard).toEqual(resultExplicit);

      // Verify key properties are included
      expect(resultWildcard).toEqual(
        expect.objectContaining({
          instrument: expect.any(Object),
          audioEffects: expect.any(Array),
          midiEffects: expect.any(Array),
          sessionClips: expect.any(Array),
          arrangementClips: expect.any(Array),
          availableInputRoutingChannels: expect.any(Array),
          inputRoutingChannel: expect.any(Object),
          monitoringState: expect.any(String),
        }),
      );
    });
  });

  describe("category parameter", () => {
    describe("return tracks", () => {
      it("reads return track when category is 'return'", () => {
        liveApiId.mockImplementation(function () {
          if (this.path === "live_set return_tracks 1") {
            return "return_track_1";
          }
          return "id 0";
        });

        mockLiveApiGet({
          "live_set return_tracks 1": {
            name: "Return B",
            has_midi_input: 0, // Return tracks are typically audio
            color: 65280, // Green
            mute: 0,
            solo: 0,
            arm: 0,
            can_be_armed: 0, // Return tracks cannot be armed
            is_foldable: 0,
            is_grouped: 0,
            group_track: ["id", 0],
            devices: [],
            clip_slots: [],
            arrangement_clips: [],
            back_to_arranger: 0,
            playing_slot_index: -1,
            fired_slot_index: -1,
            muted_via_solo: 0,
          },
        });

        const result = readTrack({ trackIndex: 1, category: "return" });

        expect(result).toEqual({
          id: "return_track_1",
          type: "audio",
          name: "Return B",
          returnTrackIndex: 1,
          arrangementFollower: true,
          sessionClips: [], // Return tracks have no session clips
          arrangementClips: [], // Return tracks have no arrangement clips
          instrument: null,
        });
      });

      it("returns null values when return track does not exist", () => {
        liveApiId.mockReturnValue("id 0");

        const result = readTrack({ trackIndex: 99, category: "return" });

        expect(result).toEqual({
          id: null,
          type: null,
          name: null,
          returnTrackIndex: 99,
        });
      });

      it("includes routing properties for return tracks when requested", () => {
        liveApiId.mockImplementation(function () {
          if (this.path === "live_set return_tracks 0") {
            return "return_track_1";
          }
          return "id 0";
        });
        liveApiPath.mockImplementation(function () {
          return this._path;
        });

        mockLiveApiGet({
          "live_set return_tracks 0": {
            name: "Return A",
            has_midi_input: 0,
            can_be_armed: 0,
            color: 0,
            mute: 0,
            solo: 0,
            arm: 0,
            is_foldable: 0,
            is_grouped: 0,
            group_track: ["id", 0],
            devices: [],
            clip_slots: [],
            arrangement_clips: [],
            back_to_arranger: 0,
            playing_slot_index: -1,
            fired_slot_index: -1,
            muted_via_solo: 0,
            available_output_routing_channels: [
              '{"available_output_routing_channels": [{"display_name": "Master", "identifier": 26}]}',
            ],
            available_output_routing_types: [
              '{"available_output_routing_types": [{"display_name": "Track Out", "identifier": 25}]}',
            ],
            output_routing_channel: [
              '{"output_routing_channel": {"display_name": "Master", "identifier": 26}}',
            ],
            output_routing_type: [
              '{"output_routing_type": {"display_name": "Track Out", "identifier": 25}}',
            ],
            available_input_routing_channels: null,
            available_input_routing_types: null,
            input_routing_channel: null,
            input_routing_type: null,
          },
        });

        const result = readTrack({
          trackIndex: 0,
          category: "return",
          include: ["routings", "available-routings"],
        });

        // Return tracks should have null input routing (they don't accept input)
        expect(result.inputRoutingType).toBeNull();
        expect(result.inputRoutingChannel).toBeNull();
        expect(result.availableInputRoutingTypes).toEqual([]);
        expect(result.availableInputRoutingChannels).toEqual([]);

        // But should have output routing
        expect(result.outputRoutingType).toEqual({
          name: "Track Out",
          outputId: "25",
        });
        expect(result.outputRoutingChannel).toEqual({
          name: "Master",
          outputId: "26",
        });
      });
    });

    describe("master track", () => {
      it("reads master track when category is 'master'", () => {
        liveApiId.mockImplementation(function () {
          if (this.path === "live_set master_track") {
            return "master_track";
          }
          return "id 0";
        });

        mockLiveApiGet({
          "live_set master_track": {
            name: "Master",
            has_midi_input: 0, // Master track is audio
            color: 16777215, // White
            can_be_armed: 0, // Master track cannot be armed
            is_foldable: 0,
            is_grouped: 0,
            group_track: ["id", 0],
            devices: children("compressor1"),
            clip_slots: [],
            arrangement_clips: [],
            back_to_arranger: 0,
            playing_slot_index: -1,
            fired_slot_index: -1,
            muted_via_solo: 0,
            mute: 0,
            solo: 0,
            arm: 0,
          },
          compressor1: {
            name: "Compressor",
            class_name: "Compressor2",
            class_display_name: "Compressor",
            type: LIVE_API_DEVICE_TYPE_AUDIO_EFFECT,
            is_active: 1,
            can_have_chains: 0,
            can_have_drum_pads: 0,
          },
        });

        const result = readTrack({ trackIndex: 999, category: "master" }); // trackIndex should be ignored

        expect(result).toEqual({
          id: "master_track",
          type: "audio",
          name: "Master",
          arrangementFollower: true,
          sessionClips: [], // Master track has no session clips
          arrangementClips: [], // Master track has no arrangement clips
          instrument: null,
        });

        // trackIndex should be ignored for master track
        expect(result.trackIndex).toBeUndefined();
        expect(result.returnTrackIndex).toBeUndefined();
      });

      it("returns null values when master track does not exist", () => {
        liveApiId.mockReturnValue("id 0");

        const result = readTrack({ trackIndex: 0, category: "master" });

        expect(result).toEqual({
          id: null,
          type: null,
          name: null,
          trackIndex: null, // trackIndex is null for master track
        });
      });

      it("includes audio effects for master track when requested", () => {
        liveApiId.mockImplementation(function () {
          switch (this._path) {
            case "live_set master_track":
              return "master_track";
            case "live_set master_track devices 0":
              return "compressor1";
            case "live_set master_track devices 1":
              return "limiter1";
            default:
              return this._id;
          }
        });

        mockLiveApiGet({
          "live_set master_track": {
            name: "Master",
            has_midi_input: 0,
            color: 0,
            mute: 0,
            solo: 0,
            arm: 0,
            can_be_armed: 0,
            is_foldable: 0,
            is_grouped: 0,
            group_track: ["id", 0],
            devices: children("compressor1", "limiter1"),
            clip_slots: [],
            arrangement_clips: [],
            back_to_arranger: 0,
            playing_slot_index: -1,
            fired_slot_index: -1,
            muted_via_solo: 0,
          },
          compressor1: {
            name: "Compressor",
            class_name: "Compressor2",
            class_display_name: "Compressor",
            type: LIVE_API_DEVICE_TYPE_AUDIO_EFFECT,
            is_active: 1,
            can_have_chains: 0,
            can_have_drum_pads: 0,
          },
          limiter1: {
            name: "Limiter",
            class_name: "Limiter",
            class_display_name: "Limiter",
            type: LIVE_API_DEVICE_TYPE_AUDIO_EFFECT,
            is_active: 1,
            can_have_chains: 0,
            can_have_drum_pads: 0,
          },
        });

        const result = readTrack({
          trackIndex: 0,
          category: "master",
          include: ["audio-effects"],
        });

        expect(result.audioEffects).toEqual([
          {
            type: "audio-effect: Compressor",
          },
          {
            type: "audio-effect: Limiter",
          },
        ]);
      });

      it("sets null routing properties for master track when requested", () => {
        liveApiId.mockReturnValue("master_track");
        mockLiveApiGet({
          Track: {
            name: "Master",
            has_midi_input: 0,
            can_be_armed: 0,
            color: 0,
            mute: 0,
            solo: 0,
            arm: 0,
            is_foldable: 0,
            is_grouped: 0,
            group_track: ["id", 0],
            devices: [],
            clip_slots: [],
            arrangement_clips: [],
            back_to_arranger: 0,
            playing_slot_index: -1,
            fired_slot_index: -1,
            muted_via_solo: 0,
          },
        });

        const result = readTrack({
          trackIndex: 0,
          category: "master",
          include: ["routings", "available-routings"],
        });

        // Master track should have null routing properties
        expect(result.inputRoutingType).toBeNull();
        expect(result.inputRoutingChannel).toBeNull();
        expect(result.outputRoutingType).toBeNull();
        expect(result.outputRoutingChannel).toBeNull();
        expect(result.availableInputRoutingTypes).toEqual([]);
        expect(result.availableInputRoutingChannels).toEqual([]);
        expect(result.availableOutputRoutingTypes).toEqual([]);
        expect(result.availableOutputRoutingChannels).toEqual([]);
      });

      it("reads master track without requiring trackIndex", () => {
        liveApiId.mockReturnValue("master_track");
        mockLiveApiGet({
          "live_set master_track": {
            name: "Master",
            has_midi_input: 0,
            can_be_armed: 0,
            color: 16777215, // White
            mute: 0,
            solo: 0,
            arm: 0,
            is_foldable: 0,
            is_grouped: 0,
            group_track: ["id", 0],
            devices: [],
            clip_slots: [],
            arrangement_clips: [],
            back_to_arranger: 0,
            playing_slot_index: -1,
            fired_slot_index: -1,
            muted_via_solo: 0,
          },
        });

        const result = readTrack({ category: "master" });

        expect(result).toEqual({
          id: "master_track",
          type: "audio",
          name: "Master",
          arrangementFollower: true,
          sessionClips: [],
          arrangementClips: [],
          instrument: null,
        });
      });
    });

    describe("regular tracks (default behavior)", () => {
      it("defaults to regular track when category is not specified", () => {
        liveApiId.mockReturnValue("track1");
        mockLiveApiGet({
          Track: mockTrackProperties({
            name: "Default Track",
          }),
        });

        const result = readTrack({ trackIndex: 0 });

        expect(result.trackIndex).toBe(0);
        expect(result.returnTrackIndex).toBeUndefined();
        expect(result.id).toBe("track1");
      });

      it("reads regular track when category is explicitly 'regular'", () => {
        liveApiId.mockReturnValue("track1");
        mockLiveApiGet({
          Track: mockTrackProperties({
            name: "Regular Track",
          }),
        });

        const result = readTrack({ trackIndex: 0, category: "regular" });

        expect(result.trackIndex).toBe(0);
        expect(result.returnTrackIndex).toBeUndefined();
        expect(result.id).toBe("track1");
      });
    });

    describe("invalid category", () => {
      it("throws error for invalid category", () => {
        expect(() => {
          readTrack({ trackIndex: 0, category: "invalid" });
        }).toThrow(
          'Invalid category: invalid. Must be "regular", "return", or "master".',
        );
      });
    });
  });

  describe("trackId parameter", () => {
    it("reads track by trackId", () => {
      liveApiId.mockImplementation(function () {
        if (this._path === "id 123") {
          return "123";
        }
        return this._id;
      });
      liveApiPath.mockImplementation(function () {
        if (this._path === "id 123") {
          return "live_set tracks 2";
        }
        return this._path;
      });

      mockLiveApiGet({
        "live_set tracks 2": {
          name: "Track by ID",
          has_midi_input: 1,
          color: 16711680, // Red
          mute: 0,
          solo: 0,
          arm: 1,
          can_be_armed: 1,
          is_foldable: 0,
          is_grouped: 0,
          group_track: ["id", 0],
          devices: [],
          clip_slots: [],
          arrangement_clips: [],
          back_to_arranger: 0,
          playing_slot_index: -1,
          fired_slot_index: -1,
          muted_via_solo: 0,
        },
      });

      const result = readTrack({ trackId: "123" });

      expect(result).toEqual({
        id: "123",
        type: "midi",
        name: "Track by ID",
        trackIndex: 2,
        isArmed: true,
        arrangementFollower: true,
        sessionClips: [],
        arrangementClips: [],
        instrument: null,
      });
    });

    it("reads return track by trackId", () => {
      liveApiId.mockImplementation(function () {
        if (this._path === "id 456") {
          return "456";
        }
        return this._id;
      });
      liveApiPath.mockImplementation(function () {
        if (this._path === "id 456") {
          return "live_set return_tracks 1";
        }
        return this._path;
      });

      mockLiveApiGet({
        "live_set return_tracks 1": {
          name: "Return by ID",
          has_midi_input: 0,
          color: 65280, // Green
          mute: 0,
          solo: 0,
          arm: 0,
          can_be_armed: 0,
          is_foldable: 0,
          is_grouped: 0,
          group_track: ["id", 0],
          devices: [],
          clip_slots: [],
          arrangement_clips: [],
          back_to_arranger: 0,
          playing_slot_index: -1,
          fired_slot_index: -1,
          muted_via_solo: 0,
        },
      });

      const result = readTrack({ trackId: "456" });

      expect(result).toEqual({
        id: "456",
        type: "audio",
        name: "Return by ID",
        returnTrackIndex: 1,
        arrangementFollower: true,
        sessionClips: [],
        arrangementClips: [],
        instrument: null,
      });
    });

    it("reads master track by trackId", () => {
      liveApiId.mockImplementation(function () {
        if (this._path === "id 789") {
          return "789";
        }
        return this._id;
      });
      liveApiPath.mockImplementation(function () {
        if (this._path === "id 789") {
          return "live_set master_track";
        }
        return this._path;
      });

      mockLiveApiGet({
        "live_set master_track": {
          name: "Master by ID",
          has_midi_input: 0,
          color: 16777215, // White
          mute: 0,
          solo: 0,
          arm: 0,
          can_be_armed: 0,
          is_foldable: 0,
          is_grouped: 0,
          group_track: ["id", 0],
          devices: [],
          clip_slots: [],
          arrangement_clips: [],
          back_to_arranger: 0,
          playing_slot_index: -1,
          fired_slot_index: -1,
          muted_via_solo: 0,
        },
      });

      const result = readTrack({ trackId: "789" });

      expect(result).toEqual({
        id: "789",
        type: "audio",
        name: "Master by ID",
        arrangementFollower: true,
        sessionClips: [],
        arrangementClips: [],
        instrument: null,
      });
    });

    it("throws error when trackId does not exist", () => {
      liveApiId.mockReturnValue("id 0");

      expect(() => {
        readTrack({ trackId: "nonexistent" });
      }).toThrow('No track exists for trackId "nonexistent"');
    });

    it("throws error when neither trackId nor trackIndex provided", () => {
      expect(() => {
        readTrack({});
      }).toThrow("Either trackId or trackIndex must be provided");
    });

    it("ignores category when trackId is provided", () => {
      liveApiId.mockImplementation(function () {
        if (this._path === "id 999") {
          return "999";
        }
        return this._id;
      });
      liveApiPath.mockImplementation(function () {
        if (this._path === "id 999") {
          return "live_set tracks 0";
        }
        return this._path;
      });

      mockLiveApiGet({
        "live_set tracks 0": {
          name: "Track ignores type",
          has_midi_input: 1,
          color: 0,
          mute: 0,
          solo: 0,
          arm: 0,
          can_be_armed: 1,
          is_foldable: 0,
          is_grouped: 0,
          group_track: ["id", 0],
          devices: [],
          clip_slots: [],
          arrangement_clips: [],
          back_to_arranger: 0,
          playing_slot_index: -1,
          fired_slot_index: -1,
          muted_via_solo: 0,
        },
      });

      // category should be ignored when trackId is provided
      const result = readTrack({ trackId: "999", category: "return" });

      // Should read as regular track (from path) not return track
      expect(result.trackIndex).toBe(0);
      expect(result.returnTrackIndex).toBeUndefined();
    });
  });

  describe("drum-maps include option", () => {
    it("includes drumMap but strips chains when using drum-maps", () => {
      liveApiId.mockImplementation(function () {
        switch (this._path) {
          case "live_set tracks 0":
            return "track1";
          case "live_set tracks 0 devices 0":
            return "drumrack1";
          case "live_set tracks 0 devices 0 drum_pads 60":
            return "pad1";
          case "live_set tracks 0 devices 0 drum_pads 60 chains 0":
            return "chain1";
          case "live_set tracks 0 devices 0 drum_pads 60 chains 0 devices 0":
            return "kick_device";
          case "live_set tracks 0 devices 0 chains 0":
            return "main_chain";
          default:
            return this._id;
        }
      });

      mockLiveApiGet({
        Track: mockTrackProperties({
          devices: children("drumrack1"),
        }),
        drumrack1: {
          name: "Test Drum Rack",
          class_name: "DrumGroupDevice",
          class_display_name: "Drum Rack",
          type: LIVE_API_DEVICE_TYPE_INSTRUMENT,
          is_active: 1,
          can_have_chains: 1,
          can_have_drum_pads: 1,
          drum_pads: children("pad1"),
          chains: children("main_chain"),
          return_chains: [],
        },
        main_chain: {
          name: "Main Chain",
          mute: 0,
          muted_via_solo: 0,
          solo: 0,
          devices: [],
        },
        pad1: {
          note: 60, // C3
          name: "Test Kick",
          mute: 0,
          muted_via_solo: 0,
          solo: 0,
          chains: children("chain1"),
        },
        chain1: {
          name: "Kick Chain",
          mute: 0,
          muted_via_solo: 0,
          solo: 0,
          devices: children("kick_device"),
        },
        kick_device: {
          name: "Kick Instrument",
          class_name: "Simpler",
          type: LIVE_API_DEVICE_TYPE_INSTRUMENT,
        },
      });

      const result = readTrack({
        trackIndex: 0,
        include: ["instruments", "drum-maps"],
      });

      // Should have drumMap
      expect(result.drumMap).toEqual({
        C3: "Test Kick",
      });

      // Should have instrument but NO chains
      expect(result.instrument).toEqual({
        name: "Test Drum Rack",
        type: "drum-rack",
        drumPads: [
          {
            name: "Test Kick",
            note: 60,
          },
        ],
      });

      // Critical: chains should be stripped
      expect(result.instrument.chains).toBeUndefined();
    });

    it("drum racks don't have main chains even with rack-chains included", () => {
      liveApiId.mockImplementation(function () {
        switch (this._path) {
          case "live_set tracks 0":
            return "track1";
          case "live_set tracks 0 devices 0":
            return "drumrack1";
          case "live_set tracks 0 devices 0 drum_pads 60":
            return "pad1";
          case "live_set tracks 0 devices 0 drum_pads 60 chains 0":
            return "chain1";
          case "live_set tracks 0 devices 0 drum_pads 60 chains 0 devices 0":
            return "kick_device2";
          case "live_set tracks 0 devices 0 chains 0":
            return "main_chain";
          default:
            return this._id;
        }
      });

      mockLiveApiGet({
        Track: mockTrackProperties({
          devices: children("drumrack1"),
        }),
        drumrack1: {
          name: "Test Drum Rack",
          class_name: "DrumGroupDevice",
          class_display_name: "Drum Rack",
          type: LIVE_API_DEVICE_TYPE_INSTRUMENT,
          is_active: 1,
          can_have_chains: 1,
          can_have_drum_pads: 1,
          drum_pads: children("pad1"),
          chains: children("main_chain"),
          return_chains: [],
        },
        main_chain: {
          name: "Main Chain",
          mute: 0,
          muted_via_solo: 0,
          solo: 0,
          devices: [],
        },
        pad1: {
          note: 60, // C3
          name: "Test Kick",
          mute: 0,
          muted_via_solo: 0,
          solo: 0,
          chains: children("chain1"),
        },
        chain1: {
          name: "Kick Chain",
          mute: 0,
          muted_via_solo: 0,
          solo: 0,
          devices: children("kick_device2"),
        },
        kick_device2: {
          name: "Kick Instrument",
          class_name: "Simpler",
          type: LIVE_API_DEVICE_TYPE_INSTRUMENT,
        },
      });

      const result = readTrack({
        trackIndex: 0,
        include: ["instruments", "drum-maps", "rack-chains"],
      });

      // Should have drumMap
      expect(result.drumMap).toEqual({
        C3: "Test Kick",
      });

      // Should have instrument WITHOUT chains (drum racks don't expose main chains)
      expect(result.instrument).toEqual({
        name: "Test Drum Rack",
        type: "drum-rack",
        drumPads: [
          {
            name: "Test Kick",
            note: 60,
          },
        ],
      });

      // Critical: chains should NOT be present on drum racks
      expect(result.instrument.chains).toBeUndefined();
    });

    it("strips chains from all device types when using drum-maps", () => {
      liveApiId.mockImplementation(function () {
        switch (this._path) {
          case "live_set tracks 0":
            return "track1";
          case "live_set tracks 0 devices 0":
            return "midi_effect_rack";
          case "live_set tracks 0 devices 1":
            return "instrument_rack";
          case "live_set tracks 0 devices 2":
            return "audio_effect_rack";
          case "live_set tracks 0 devices 0 chains 0":
            return "midi_chain";
          case "live_set tracks 0 devices 1 chains 0":
            return "inst_chain";
          case "live_set tracks 0 devices 2 chains 0":
            return "audio_chain";
          default:
            return this._id;
        }
      });

      mockLiveApiGet({
        Track: mockTrackProperties({
          devices: children(
            "midi_effect_rack",
            "instrument_rack",
            "audio_effect_rack",
          ),
        }),
        midi_effect_rack: {
          name: "MIDI Effect Rack",
          class_name: "MidiEffectGroupDevice",
          class_display_name: "MIDI Effect Rack",
          type: LIVE_API_DEVICE_TYPE_MIDI_EFFECT,
          is_active: 1,
          can_have_chains: 1,
          can_have_drum_pads: 0,
          chains: children("midi_chain"),
          return_chains: [],
        },
        instrument_rack: {
          name: "Instrument Rack",
          class_name: "InstrumentGroupDevice",
          class_display_name: "Instrument Rack",
          type: LIVE_API_DEVICE_TYPE_INSTRUMENT,
          is_active: 1,
          can_have_chains: 1,
          can_have_drum_pads: 0,
          chains: children("inst_chain"),
          return_chains: [],
        },
        audio_effect_rack: {
          name: "Audio Effect Rack",
          class_name: "AudioEffectGroupDevice",
          class_display_name: "Audio Effect Rack",
          type: LIVE_API_DEVICE_TYPE_AUDIO_EFFECT,
          is_active: 1,
          can_have_chains: 1,
          can_have_drum_pads: 0,
          chains: children("audio_chain"),
          return_chains: [],
        },
        midi_chain: {
          name: "MIDI Chain",
          mute: 0,
          muted_via_solo: 0,
          solo: 0,
          devices: [],
        },
        inst_chain: {
          name: "Inst Chain",
          mute: 0,
          muted_via_solo: 0,
          solo: 0,
          devices: [],
        },
        audio_chain: {
          name: "Audio Chain",
          mute: 0,
          muted_via_solo: 0,
          solo: 0,
          devices: [],
        },
      });

      const result = readTrack({
        trackIndex: 0,
        include: ["midi-effects", "instruments", "audio-effects", "drum-maps"],
      });

      // All devices should have chains stripped
      expect(result.midiEffects[0]).toEqual({
        type: "midi-effect-rack",
      });
      expect(result.midiEffects[0].chains).toBeUndefined();

      expect(result.instrument).toEqual({
        type: "instrument-rack",
      });
      expect(result.instrument.chains).toBeUndefined();

      expect(result.audioEffects[0]).toEqual({
        type: "audio-effect-rack",
      });
      expect(result.audioEffects[0].chains).toBeUndefined();
    });

    it("uses drum-maps by default (not rack-chains)", () => {
      liveApiId.mockImplementation(function () {
        switch (this._path) {
          case "live_set tracks 0":
            return "track1";
          case "live_set tracks 0 devices 0":
            return "instrument_rack";
          case "live_set tracks 0 devices 0 chains 0":
            return "chain1";
          default:
            return this._id;
        }
      });

      mockLiveApiGet({
        Track: mockTrackProperties({
          devices: children("instrument_rack"),
        }),
        instrument_rack: {
          name: "Instrument Rack",
          class_name: "InstrumentGroupDevice",
          class_display_name: "Instrument Rack",
          type: LIVE_API_DEVICE_TYPE_INSTRUMENT,
          is_active: 1,
          can_have_chains: 1,
          can_have_drum_pads: 0,
          chains: children("chain1"),
          return_chains: [],
        },
        chain1: {
          name: "Chain 1",
          mute: 0,
          muted_via_solo: 0,
          solo: 0,
          devices: [],
        },
      });

      // Call with NO include param - should use defaults
      const result = readTrack({ trackIndex: 0 });

      // Should have instrument but NO chains (proving drum-maps is default, not rack-chains)
      expect(result.instrument).toEqual({
        type: "instrument-rack",
      });
      expect(result.instrument.chains).toBeUndefined();
    });

    it("handles drum-maps with no drum racks gracefully", () => {
      mockLiveApiGet({
        Track: mockTrackProperties({
          devices: children("wavetable"),
        }),
        wavetable: {
          name: "Wavetable",
          class_name: "InstrumentVector",
          class_display_name: "Wavetable",
          type: LIVE_API_DEVICE_TYPE_INSTRUMENT,
          is_active: 1,
          can_have_chains: 0,
          can_have_drum_pads: 0,
        },
      });

      const result = readTrack({
        trackIndex: 0,
        include: ["instruments", "drum-maps"],
      });

      // Should have instrument but no drumMap
      expect(result.instrument).toEqual({
        type: "instrument: Wavetable",
      });
      expect(result.drumMap).toBeUndefined();
      expect(result.instrument.chains).toBeUndefined();
    });
  });
});
