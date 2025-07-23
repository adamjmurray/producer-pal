// src/tools/read-track.test.js
import { describe, expect, it } from "vitest";
import {
  children,
  expectedClip,
  liveApiId,
  liveApiPath,
  mockLiveApiGet,
} from "../mock-live-api.js";
import { VERSION } from "../version.js";
import {
  DEVICE_TYPE,
  LIVE_API_DEVICE_TYPE_AUDIO_EFFECT,
  LIVE_API_DEVICE_TYPE_INSTRUMENT,
  LIVE_API_DEVICE_TYPE_MIDI_EFFECT,
} from "./constants.js";
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
      color: "#FF0000",
      state: "soloed",
      isArmed: true,
      followsArrangement: true,
      isGroup: false,
      isGroupMember: false,
      groupId: null,
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
      color: "#00FF00",
      state: "muted",
      isArmed: false,
      followsArrangement: true,
      isGroup: false,
      isGroupMember: false,
      groupId: null,
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
      color: "#FF0000",
      state: "soloed",
      isArmed: false,
      followsArrangement: true,
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
      color: "#0000FF",
      isArmed: false,
      followsArrangement: false,
      isGroup: false,
      isGroupMember: false,
      groupId: null,
      playingSlotIndex: 0,
      arrangementClips: [],
      sessionClips: [
        expectedClip({ id: "clip1", trackIndex: 2, clipSlotIndex: 0 }),
        expectedClip({ id: "clip2", trackIndex: 2, clipSlotIndex: 2 }),
      ],
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

  it("returns minimal session clip data when includeSessionClips is false", () => {
    liveApiId.mockImplementation(function () {
      switch (this.path) {
        case "live_set tracks 2":
          return "track3";
        case "id slot1 clip": // Direct access to slot1's clip
          return "clip1";
        case "id slot3 clip": // Direct access to slot3's clip
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
    });

    const result = readTrack({ trackIndex: 2, includeSessionClips: false });

    // Since clips exist at slots 0 and 2, we should get minimal data for those slots
    expect(result.sessionClips).toEqual([
      { clipId: "clip1", clipSlotIndex: 0 },
      { clipId: "clip2", clipSlotIndex: 2 },
    ]);
  });

  it("returns minimal arrangement clip data when includeArrangementClips is false", () => {
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

    const result = readTrack({ trackIndex: 2, includeArrangementClips: false });

    expect(result.arrangementClips).toEqual([
      { clipId: "id arr_clip1" },
      { clipId: "id arr_clip2" },
    ]);
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
        includeMidiEffects: true,
        includeAudioEffects: true,
      });

      expect(result.instrument).toEqual({
        id: "device1",
        name: "Analog",
        displayName: "Custom Analog",
        type: DEVICE_TYPE.INSTRUMENT,
      });

      expect(result.audioEffects).toEqual([
        {
          id: "device2",
          name: "Reverb",
          displayName: "Custom Reverb",
          type: DEVICE_TYPE.AUDIO_EFFECT,
        },
      ]);

      expect(result.midiEffects).toEqual([
        {
          id: "device3",
          name: "Note Length",
          displayName: "Custom Note Length",
          type: DEVICE_TYPE.MIDI_EFFECT,
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
        id: "device1",
        name: "Drum Rack",
        displayName: "My Drums",
        type: DEVICE_TYPE.DRUM_RACK,
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
        includeAudioEffects: true,
      });

      expect(result.instrument).toEqual({
        id: "device1",
        name: "Drum Rack",
        displayName: "My Drums",
        type: DEVICE_TYPE.DRUM_RACK,
        drumPads: [],
      });

      expect(result.audioEffects).toHaveLength(1);
      expect(result.audioEffects[0]).toEqual({
        id: "device2",
        name: "Reverb",
        type: DEVICE_TYPE.AUDIO_EFFECT,
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

      const result = readTrack({ trackIndex: 0 });

      expect(result.instrument).toEqual({
        id: "rack1",
        name: "Instrument Rack",
        displayName: "My Custom Rack",
        type: DEVICE_TYPE.INSTRUMENT_RACK,
        chains: [
          {
            name: "Piano",
            devices: [
              {
                id: "nested_device1",
                name: "Operator",
                displayName: "Lead Synth",
                type: DEVICE_TYPE.INSTRUMENT,
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

      const result = readTrack({ trackIndex: 0, includeAudioEffects: true });

      expect(result.audioEffects).toHaveLength(1);
      expect(result.audioEffects[0]).toEqual({
        id: "fx_rack1",
        name: "Audio Effect Rack",
        displayName: "Master FX",
        type: DEVICE_TYPE.AUDIO_EFFECT_RACK,
        chains: [
          {
            name: "Filter Chain",
            devices: [
              {
                id: "nested_effect1",
                name: "Auto Filter",
                displayName: "Sweep Filter",
                type: DEVICE_TYPE.AUDIO_EFFECT,
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

      const result = readTrack({ trackIndex: 0 });

      expect(result.instrument).toEqual({
        id: "outer_rack",
        name: "Instrument Rack",
        displayName: "Master FX",
        type: DEVICE_TYPE.INSTRUMENT_RACK,
        chains: [
          {
            name: "Wet",
            devices: [
              {
                id: "inner_rack",
                name: "Audio Effect Rack",
                displayName: "Reverb Chain",
                type: DEVICE_TYPE.AUDIO_EFFECT_RACK,
                chains: [
                  {
                    name: "Hall",
                    state: "soloed",
                    devices: [
                      {
                        id: "deep_device",
                        name: "Reverb",
                        displayName: "Big Hall",
                        type: DEVICE_TYPE.AUDIO_EFFECT,
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

      const result = readTrack({ trackIndex: 0 });

      expect(result.instrument).toEqual({
        id: "rack1",
        name: "Instrument Rack",
        displayName: "My Empty Rack",
        type: DEVICE_TYPE.INSTRUMENT_RACK,
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

      const result = readTrack({ trackIndex: 0 });

      expect(result.instrument).toEqual({
        id: "rack1",
        name: "Instrument Rack",
        displayName: "My Custom Rack",
        type: DEVICE_TYPE.INSTRUMENT_RACK,
        chains: [
          {
            name: "Piano",
            devices: [
              {
                id: "device1",
                name: "Operator",
                displayName: "Lead Synth",
                type: DEVICE_TYPE.INSTRUMENT,
              },
            ],
          },
          {
            name: "Bass",
            state: "muted",
            devices: [
              {
                id: "device2",
                name: "Wavetable",
                displayName: "Bass Synth",
                type: DEVICE_TYPE.INSTRUMENT,
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

      const result = readTrack({ trackIndex: 0, includeDrumChains: true });
      expect(result.instrument).toEqual({
        id: "drum_rack",
        name: "Drum Rack",
        displayName: "My Drums",
        type: DEVICE_TYPE.DRUM_RACK,
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
                  name: "Simpler",
                  type: DEVICE_TYPE.INSTRUMENT,
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
                  name: "Simpler",
                  type: DEVICE_TYPE.INSTRUMENT,
                }),
              ],
            },
          },
        ],
      });
    });

    it("only includes displayName when it differs from name", () => {
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

      const result = readTrack({ trackIndex: 0, includeAudioEffects: true });
      expect(result.audioEffects).toEqual([
        {
          id: "device1",
          name: "Reverb",
          type: DEVICE_TYPE.AUDIO_EFFECT,
          // No displayName since it's the same as name
        },
        {
          id: "device2",
          name: "Reverb",
          displayName: "My Custom Reverb", // Included since it differs from name
          type: DEVICE_TYPE.AUDIO_EFFECT,
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

      const result = readTrack({ trackIndex: 0, includeDrumChains: true });

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
        nested_instrument: {
          name: "Simpler",
          class_name: "Simpler",
          class_display_name: "Simpler",
          type: LIVE_API_DEVICE_TYPE_INSTRUMENT,
          is_active: 1,
          can_have_chains: 0,
          can_have_drum_pads: 0,
        },
      });

      const result = readTrack({ trackIndex: 0, includeDrumChains: true });

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

      const result = readTrack({ trackIndex: 0, includeRoutings: true });

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

      const result = readTrack({ trackIndex: 0, includeRoutings: true });

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

      const result = readTrack({ trackIndex: 0, includeRoutings: true });

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
      expect(result.isArmed).toBe(false);
      expect(result.monitoringState).toBeUndefined(); // Group tracks cannot be armed, so monitoring state is omitted
    });

    it("returns unknown monitoring state for unsupported values", () => {
      liveApiId.mockReturnValue("track1");
      mockLiveApiGet({
        Track: mockTrackProperties({
          current_monitoring_state: [999], // Invalid monitoring state value
        }),
      });

      const result = readTrack({ trackIndex: 0, includeRoutings: true });

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

      const result = readTrack({ trackIndex: 0, includeRoutings: true });

      // Should omit monitoringState property without accessing current_monitoring_state
      expect(result.monitoringState).toBeUndefined();
      expect(result.isArmed).toBe(false);
    });
  });
});
