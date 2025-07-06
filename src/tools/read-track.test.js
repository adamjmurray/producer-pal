// src/tools/read-track.test.js
import { describe, expect, it } from "vitest";
import {
  children,
  expectedClip,
  liveApiId,
  liveApiPath,
  mockLiveApiGet,
} from "../mock-live-api";
import {
  DEVICE_TYPE,
  LIVE_API_DEVICE_TYPE_AUDIO_EFFECT,
  LIVE_API_DEVICE_TYPE_INSTRUMENT,
  LIVE_API_DEVICE_TYPE_MIDI_EFFECT,
  readTrack,
} from "./read-track";

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
      isMuted: false,
      isSoloed: true,
      isArmed: true,
      followsArrangement: true,
      isGroup: false,
      isGroupMember: false,
      groupId: null,
      playingSlotIndex: 2,
      firedSlotIndex: 3,
      drumPads: null,
      arrangementClips: [],
      sessionClips: [],
      devices: [],
      hasAudioEffects: false,
      hasInstrument: false,
      hasMidiEffects: false,
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
      isMuted: true,
      isSoloed: false,
      isArmed: false,
      followsArrangement: true,
      isGroup: false,
      isGroupMember: false,
      groupId: null,
      playingSlotIndex: -1,
      firedSlotIndex: -1,
      drumPads: null,
      arrangementClips: [],
      sessionClips: [],
      devices: [],
      hasAudioEffects: false,
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
      isMuted: false,
      isSoloed: true,
      isArmed: true,
      followsArrangement: true,
      isGroup: true,
      isGroupMember: true,
      groupId: "456",
      playingSlotIndex: 2,
      firedSlotIndex: 3,
      drumPads: null,
      arrangementClips: [],
      sessionClips: [],
      devices: [],
      hasAudioEffects: false,
      hasInstrument: false,
      hasMidiEffects: false,
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
    expect(result.producerPalVersion).toBe("0.9.0");

    const result2 = readTrack({ trackIndex: 0 });
    expect(result2.hasProducerPalDevice).toBeUndefined();
    expect(result2.producerPalVersion).toBeUndefined();
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
      isMuted: false,
      isSoloed: false,
      followsArrangement: false,
      isGroup: false,
      isGroupMember: false,
      groupId: null,
      firedSlotIndex: -1,
      playingSlotIndex: 0,
      drumPads: null,
      arrangementClips: [],
      sessionClips: [
        expectedClip({ id: "clip1", trackIndex: 2, clipSlotIndex: 0 }),
        expectedClip({ id: "clip2", trackIndex: 2, clipSlotIndex: 2 }),
      ],
      devices: [],
      hasAudioEffects: false,
      hasInstrument: false,
      hasMidiEffects: false,
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

  describe("devices", () => {
    it("returns empty array when track has no devices", () => {
      liveApiId.mockReturnValue("track1");
      mockLiveApiGet({
        Track: mockTrackProperties({
          devices: [],
        }),
      });

      const result = readTrack({ trackIndex: 0 });
      expect(result.devices).toEqual([]);
    });

    it("returns device information for tracks with devices", () => {
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

      const result = readTrack({ trackIndex: 0 });
      expect(result.devices).toEqual([
        {
          id: "device1",
          name: "Analog",
          displayName: "Custom Analog",
          type: DEVICE_TYPE.INSTRUMENT,
          isActive: true,
        },
        {
          id: "device2",
          name: "Reverb",
          displayName: "Custom Reverb",
          type: DEVICE_TYPE.AUDIO_EFFECT,
          isActive: true,
        },
        {
          id: "device3",
          name: "Note Length",
          displayName: "Custom Note Length",
          type: DEVICE_TYPE.MIDI_EFFECT,
          isActive: false,
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
          chains: [],
          return_chains: [],
        },
      });

      const result = readTrack({ trackIndex: 0 });
      expect(result.devices[0]).toEqual({
        id: "device1",
        name: "Drum Rack",
        displayName: "My Drums",
        type: DEVICE_TYPE.DRUM_RACK,
        isActive: true,
        chains: [],
      });
    });

    it("includes drum rack devices (read-track always includes them)", () => {
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

      const result = readTrack({ trackIndex: 0 });
      expect(result.devices).toHaveLength(2); // Both drum rack and reverb should be included
      expect(
        result.devices.find((d) => d.type === DEVICE_TYPE.DRUM_RACK),
      ).toBeDefined();
      expect(
        result.devices.find((d) => d.type === DEVICE_TYPE.AUDIO_EFFECT),
      ).toBeDefined();
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

      expect(result.devices).toHaveLength(1);
      expect(result.devices[0]).toEqual({
        id: "rack1",
        name: "Instrument Rack",
        displayName: "My Custom Rack",
        type: DEVICE_TYPE.INSTRUMENT_RACK,
        isActive: true,
        chains: [
          {
            name: "Piano",
            color: "#FF0000",
            isMuted: false,
            isSoloed: false,
            devices: [
              {
                id: "nested_device1",
                name: "Operator",
                displayName: "Lead Synth",
                type: DEVICE_TYPE.INSTRUMENT,
                isActive: true,
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

      const result = readTrack({ trackIndex: 0 });

      expect(result.devices).toHaveLength(1);
      expect(result.devices[0]).toEqual({
        id: "fx_rack1",
        name: "Audio Effect Rack",
        displayName: "Master FX",
        type: DEVICE_TYPE.AUDIO_EFFECT_RACK,
        isActive: true,
        chains: [
          {
            name: "Filter Chain",
            color: "#0000FF",
            isMuted: false,
            isSoloed: false,
            devices: [
              {
                id: "nested_effect1",
                name: "Auto Filter",
                displayName: "Sweep Filter",
                type: DEVICE_TYPE.AUDIO_EFFECT,
                isActive: true,
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

      expect(result.devices).toHaveLength(1);
      expect(result.devices[0]).toEqual({
        id: "outer_rack",
        name: "Instrument Rack",
        displayName: "Master FX",
        type: DEVICE_TYPE.INSTRUMENT_RACK,
        isActive: true,
        chains: [
          {
            name: "Wet",
            color: "#0000FF",
            isMuted: false,
            isSoloed: false,
            devices: [
              {
                id: "inner_rack",
                name: "Audio Effect Rack",
                displayName: "Reverb Chain",
                type: DEVICE_TYPE.AUDIO_EFFECT_RACK,
                isActive: true,
                chains: [
                  {
                    name: "Hall",
                    color: "#00FF00",
                    isMuted: false,
                    isSoloed: true,
                    devices: [
                      {
                        id: "deep_device",
                        name: "Reverb",
                        displayName: "Big Hall",
                        type: DEVICE_TYPE.AUDIO_EFFECT,
                        isActive: true,
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

      expect(result.devices).toHaveLength(1);
      expect(result.devices[0]).toEqual({
        id: "rack1",
        name: "Instrument Rack",
        displayName: "My Empty Rack",
        type: DEVICE_TYPE.INSTRUMENT_RACK,
        isActive: true,
        chains: [
          {
            name: "Empty Chain",
            color: "#000000",
            isMuted: false,
            isSoloed: false,
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

      expect(result.devices).toHaveLength(1);
      expect(result.devices[0]).toEqual({
        id: "rack1",
        name: "Instrument Rack",
        displayName: "My Custom Rack",
        type: DEVICE_TYPE.INSTRUMENT_RACK,
        isActive: true,
        chains: [
          {
            name: "Piano",
            color: "#FF0000",
            isMuted: false,
            isSoloed: false,
            devices: [
              {
                id: "device1",
                name: "Operator",
                displayName: "Lead Synth",
                type: DEVICE_TYPE.INSTRUMENT,
                isActive: true,
              },
            ],
          },
          {
            name: "Bass",
            color: "#00FF00",
            isMuted: true,
            isSoloed: false,
            devices: [
              {
                id: "device2",
                name: "Wavetable",
                displayName: "Bass Synth",
                type: DEVICE_TYPE.INSTRUMENT,
                isActive: true,
              },
            ],
          },
        ],
      });
    });

    it("handles drum rack chains with hasSoloedChain property", () => {
      liveApiId.mockImplementation(function () {
        switch (this._path) {
          case "live_set tracks 0":
            return "track1";
          case "live_set tracks 0 devices 0":
            return "drum_rack";
          case "live_set tracks 0 devices 0 chains 0":
            return "chain1";
          case "live_set tracks 0 devices 0 chains 1":
            return "chain2";
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
          chains: children("chain1", "chain2"),
          return_chains: [],
        },
        chain1: {
          name: "Kick",
          color: 16711680, // Red
          mute: 0,
          muted_via_solo: 0,
          solo: 0,
          devices: [],
        },
        chain2: {
          name: "Snare",
          color: 65280, // Green
          mute: 0,
          muted_via_solo: 0,
          solo: 1, // This chain is soloed
          devices: [],
        },
      });

      const result = readTrack({ trackIndex: 0 });
      expect(result.devices[0]).toEqual({
        id: "drum_rack",
        name: "Drum Rack",
        displayName: "My Drums",
        type: DEVICE_TYPE.DRUM_RACK,
        isActive: true,
        hasSoloedChain: true, // Because chain2 is soloed
        chains: [
          {
            name: "Kick",
            color: "#FF0000",
            isMuted: false,
            isSoloed: false,
            devices: [],
            // No isMutedViaSolo for drum rack chains
          },
          {
            name: "Snare",
            color: "#00FF00",
            isMuted: false,
            isSoloed: true,
            devices: [],
            // No isMutedViaSolo for drum rack chains
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

      const result = readTrack({ trackIndex: 0 });
      expect(result.devices).toEqual([
        {
          id: "device1",
          name: "Reverb",
          type: DEVICE_TYPE.AUDIO_EFFECT,
          isActive: true,
          // No displayName since it's the same as name
        },
        {
          id: "device2",
          name: "Reverb",
          displayName: "My Custom Reverb", // Included since it differs from name
          type: DEVICE_TYPE.AUDIO_EFFECT,
          isActive: true,
        },
      ]);
    });
  });

  describe("track device properties", () => {
    it("adds hasInstrument, hasAudioEffects, hasMidiEffects properties for MIDI tracks", () => {
      liveApiId.mockImplementation(function () {
        if (this._path === "live_set tracks 0") {
          return "track1";
        }
        return this._id;
      });
      mockLiveApiGet({
        Track: mockTrackProperties({
          has_midi_input: 1,
          devices: children("device1", "device2", "device3"),
        }),
        device1: {
          name: "Analog",
          class_name: "UltraAnalog",
          class_display_name: "Analog",
          type: LIVE_API_DEVICE_TYPE_INSTRUMENT,
          is_active: 1,
          can_have_chains: 0,
          can_have_drum_pads: 0,
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
        device3: {
          name: "Note Length",
          class_name: "MidiNoteLength",
          class_display_name: "Note Length",
          type: LIVE_API_DEVICE_TYPE_MIDI_EFFECT,
          is_active: 1,
          can_have_chains: 0,
          can_have_drum_pads: 0,
        },
      });

      const result = readTrack({ trackIndex: 0 });
      expect(result.hasInstrument).toBe(true);
      expect(result.hasAudioEffects).toBe(true);
      expect(result.hasMidiEffects).toBe(true);
    });

    it("only includes hasAudioEffects for audio tracks", () => {
      liveApiId.mockImplementation(function () {
        if (this._path === "live_set tracks 0") {
          return "track1";
        }
        return this._id;
      });
      mockLiveApiGet({
        Track: mockTrackProperties({
          has_midi_input: 0, // Audio track
          devices: children("device1"),
        }),
        device1: {
          name: "Reverb",
          class_name: "Reverb",
          class_display_name: "Reverb",
          type: LIVE_API_DEVICE_TYPE_AUDIO_EFFECT,
          is_active: 1,
          can_have_chains: 0,
          can_have_drum_pads: 0,
        },
      });

      const result = readTrack({ trackIndex: 0 });
      expect(result.hasInstrument).toBeUndefined(); // Not included for audio tracks
      expect(result.hasAudioEffects).toBe(true);
      expect(result.hasMidiEffects).toBeUndefined(); // Not included for audio tracks
    });

    it("excludes device properties from Producer Pal host track when false", () => {
      liveApiPath.mockImplementation(function () {
        if (this._path === "this_device") {
          return "live_set tracks 1 devices 0";
        }
        return this._path;
      });

      liveApiId.mockReturnValue("track1");
      mockLiveApiGet({
        Track: mockTrackProperties({
          has_midi_input: 1,
          devices: [], // No devices
        }),
      });

      const result = readTrack({ trackIndex: 1 }); // Producer Pal host track
      expect(result.hasInstrument).toBeUndefined(); // Omitted because false
      expect(result.hasAudioEffects).toBe(false); // Always included
      expect(result.hasMidiEffects).toBeUndefined(); // Omitted because false
      expect(result.hasProducerPalDevice).toBe(true);
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
      expect(result.drumPads).toBeNull();
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
      expect(result.drumPads).toBeNull();
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
      expect(result.drumPads).toBeNull();
    });

    it("returns empty array when the drum rack has no pads", () => {
      mockLiveApiGet({
        Track: mockTrackProperties({
          name: "Track Empty Drum Rack",
          devices: children("drumrack"),
        }),
        drumrack: {
          type: LIVE_API_DEVICE_TYPE_INSTRUMENT,
          can_have_drum_pads: 1,
          drum_pads: [],
        },
      });
      const result = readTrack({ trackIndex: 0 });
      expect(result.drumPads).toEqual([]);
    });

    it("only includes drum pads that have chains to play a sound", () => {
      mockLiveApiGet({
        Track: mockTrackProperties({
          name: "Track Drum Rack With Pads",
          devices: children("drumrack"),
        }),
        drumrack: {
          type: LIVE_API_DEVICE_TYPE_INSTRUMENT,
          can_have_drum_pads: 1,
          drum_pads: children("pad1", "pad2", "pad3"),
        },
        pad1: {
          note: 60,
          name: "Kick",
          chains: children("chain1"),
        },
        pad2: {
          note: 62,
          name: "Snare",
          chains: [],
        },
        pad3: {
          note: 64,
          name: "Hi-hat",
          chains: children("chain2"),
        },
      });
      const result = readTrack({ trackIndex: 0 });
      expect(result.drumPads).toEqual([
        { pitch: "C3", name: "Kick" },
        { pitch: "E3", name: "Hi-hat" },
      ]);
    });

    it("stops at first drum rack found", () => {
      mockLiveApiGet({
        Track: mockTrackProperties({
          name: "Track Multiple Instruments",
          // In theory you could have multiple drum racks in an instrument rack.
          // this is not supported as a feature, but let's make sure something reasonable happens:
          devices: children("midiEffect", "drumrack1", "drumrack2"),
        }),
        midiEffect: { type: LIVE_API_DEVICE_TYPE_MIDI_EFFECT },
        drumrack1: {
          type: LIVE_API_DEVICE_TYPE_INSTRUMENT,
          can_have_drum_pads: 1,
          drum_pads: children("pad1"),
        },
        pad1: {
          note: 60,
          name: "First Drum Rack Kick",
          chains: children("chain1"),
        },
        drumrack2: {
          type: LIVE_API_DEVICE_TYPE_INSTRUMENT,
          can_have_drum_pads: 1,
          drum_pads: children("pad2"),
        },
        pad2: {
          note: 61,
          name: "Second Drum Rack Snare",
          chains: children("chain2"),
        },
      });
      const result = readTrack({ trackIndex: 0 });
      expect(result.drumPads).toEqual([
        { pitch: "C3", name: "First Drum Rack Kick" },
      ]);
    });

    it("finds drum pads in nested drum rack inside instrument rack", () => {
      mockLiveApiGet({
        Track: mockTrackProperties({
          name: "Track Nested Drum Rack",
          devices: children("instrumentRack"),
        }),
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
          drum_pads: children("pad1", "pad2"),
        },
        pad1: {
          note: 36,
          name: "Kick Dub",
          chains: children("chain1"),
        },
        pad2: {
          note: 37,
          name: "Snare Dub",
          chains: children("chain2"),
        },
      });
      const result = readTrack({ trackIndex: 0 });
      expect(result.drumPads).toEqual([
        { pitch: "C1", name: "Kick Dub" },
        { pitch: "Db1", name: "Snare Dub" },
      ]);
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
      expect(result.drumPads).toBeNull();
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
      expect(result.drumPads).toBeNull();
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
      expect(result.drumPads).toBeNull();
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
      expect(result.drumPads).toEqual([{ pitch: "C3", name: "Direct Kick" }]);
    });
  });
});
