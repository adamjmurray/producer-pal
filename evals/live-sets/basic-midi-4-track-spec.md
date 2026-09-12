# basic-midi-4-track Specification

The default eval Live Set: four instrument tracks, no clips. Most scenarios
start here and build what they need.

## Global Settings

| Property       | Value              |
| -------------- | ------------------ |
| Name           | basic-midi-4-track |
| Tempo          | 120 BPM            |
| Time Signature | 4/4                |
| Scale          | A Minor            |
| Locators       | None               |

## Scenes

8 scenes, all empty, named "1" through "8" (Live's defaults).

## Tracks

| Path | Name   | Color | Gain  | Instrument                           | Other devices                   |
| ---- | ------ | ----- | ----- | ------------------------------------ | ------------------------------- |
| t0   | Drums  | Brown | -6 dB | Instrument Rack "Cyndal Kit"         | Channel EQ, Utility             |
| t1   | Bass   | Red   | -6 dB | Instrument Rack "Electric Bass Open" | Channel EQ, Utility             |
| t2   | Chords | Green | -9 dB | Instrument Rack "Grand Piano ..."    | Channel EQ, Utility             |
| t3   | Lead   | Blue  | -6 dB | Instrument Rack "Wish U Were Lead"   | Pitch (d0), Channel EQ, Utility |
| t4   | 5-MIDI | Teal  | 0 dB  | —                                    | Producer Pal (d0)               |

Every track is unmuted, unsoloed, centered, with both sends at -70 dB (off).

t3's Pitch device sits at `t3/d0`, **before** the instrument — the one track
where `d0` is not the instrument.

### Drum map

The kit is nested: `t0/d0` is the "Cyndal Kit" **instrument** rack, and the drum
rack is one chain down at `t0/d0/c0/d0`. Pads are named after their samples.

| Pitch   | Pad                       | Pitch | Pad                   |
| ------- | ------------------------- | ----- | --------------------- |
| C1      | Kick Cyndal               | A1    | Tom Hi Hybrid Sense   |
| Db1     | Tom Hybrid Sense          | Bb1   | Hihat Pedal           |
| D1      | Rim Hybrid Sense          | B1    | Tom Hi Hybrid Sense   |
| Eb1     | Snare Mahogany Bottom Mic | C2    | Shaker Acoustified 07 |
| E1      | Snare Hybrid Sense        | Db2   | Crash Acoustified 03  |
| F1 / G1 | Perc Hi Hybrid Sense      | D2    | Crash Electrified 10  |
| Gb1/Ab1 | Hihat Closed Trad         | Eb2   | Ride Sense 1          |

## Return and Master Tracks

| Path | Name     | Device        |
| ---- | -------- | ------------- |
| rt0  | A-Delay  | Echo          |
| rt1  | B-Reverb | Hybrid Reverb |
| mt   | Main     | Limiter       |
