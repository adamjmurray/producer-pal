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

### Drum map (t0/d0)

C1 Kick, Db1/A1/B1 Toms, D1 Rim, Eb1/E1 Snares, F1/G1 Perc Hi, Gb1/Ab1 Hihat
Closed, Bb1 Hihat Pedal, C2 Shaker, Db2/D2 Crash, Eb2 Ride.

## Return and Master Tracks

| Path | Name     | Device        |
| ---- | -------- | ------------- |
| rt0  | A-Delay  | Echo          |
| rt1  | B-Reverb | Hybrid Reverb |
| mt   | Main     | Limiter       |
