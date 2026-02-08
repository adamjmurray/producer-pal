# Arrangement Clip Tests Specification

Comprehensive test set for arrangement clip edge cases.

## Global Settings

- **Name:** arrangement-clip-tests
- **Tempo:** 120 BPM
- **Time Signature:** 4/4
- **Scale:** A Minor

_No session clips in this set — all clips are arrangement clips_

---

## MIDI Tracks (t0-t14)

### Looped Clips (t0-t8)

| Track | Name             | Clip Length | Arr Length | firstStart | Edge Case                                                   |
| ----- | ---------------- | ----------- | ---------- | ---------- | ----------------------------------------------------------- |
| t0    | 1. MIDI - Looped | 1:0         | 1:0        | 1\|1       | clip length == arr length, start == firstStart              |
| t1    | 2. MIDI - Looped | 0:3         | 1:0        | 1\|1       | clip length < arr length (tiles), start == firstStart       |
| t2    | 3. MIDI - Looped | 1:0         | 0:3        | 1\|1       | clip length > arr length (partial), start == firstStart     |
| t3    | 4. MIDI - Looped | 1:0         | 1:0        | 1\|2       | clip length == arr length, start < firstStart (loop offset) |
| t4    | 5. MIDI - Looped | 0:3         | 1:0        | 1\|2       | clip length < arr length, start < firstStart                |
| t5    | 6. MIDI - Looped | 1:0         | 0:3        | 1\|2       | clip length > arr length, start < firstStart                |
| t6    | 7. MIDI - Looped | 0:3         | 1:0        | 1\|1       | clip length == arr length, start > firstStart               |
| t7    | 8. MIDI - Looped | 0:2         | 1:0        | 1\|1       | clip length < arr length, start > firstStart                |
| t8    | 9. MIDI - Looped | 0:3         | 0:3        | 1\|1       | clip length > arr length, start > firstStart                |

### Unlooped Clips (t9-t14)

| Track | Name               | Clip Length | Arr Length | Hidden Content | Edge Case                                    |
| ----- | ------------------ | ----------- | ---------- | -------------- | -------------------------------------------- |
| t9    | 1. MIDI - Unlooped | 1:0         | 1:0        | No             | All content visible, start == firstStart     |
| t10   | 2. MIDI - Unlooped | 0:3         | 0:3        | Yes            | Content beyond boundary, start == firstStart |
| t11   | 3. MIDI - Unlooped | 0:3         | 0:3        | No             | Content before arr start, start < firstStart |
| t12   | 4. MIDI - Unlooped | 0:2         | 0:2        | Yes            | Hidden content, start < firstStart           |
| t13   | 5. MIDI - Unlooped | 1:0         | 1:0        | No             | All visible, start > firstStart              |
| t14   | 6. MIDI - Unlooped | 0:3         | 0:3        | Yes            | Hidden content, start > firstStart           |

---

## Audio Tracks (t15-t35)

_All audio tracks use: Perc Semba 100 bpm.wav (Core Library)_

### Looped - Warped (t15-t23)

| Track | Name              | Clip Length | Arr Length | firstStart | Edge Case                                      |
| ----- | ----------------- | ----------- | ---------- | ---------- | ---------------------------------------------- |
| t15   | 1. Audio - Looped | 2:0         | 2:0        | 1\|1       | clip length == arr length, start == firstStart |
| t16   | 2. Audio - Looped | 2:0         | 2:1        | 1\|1       | clip length < arr length (tiles)               |
| t17   | 3. Audio - Looped | 2:0         | 1:1        | 1\|1       | clip length > arr length (partial)             |
| t18   | 4. Audio - Looped | 2:0         | 2:0        | 1\|2       | Loop start offset (firstStart = 1\|2)          |
| t19   | 5. Audio - Looped | 2:0         | 2:1        | 1\|2       | Short loop with offset start                   |
| t20   | 6. Audio - Looped | 2:0         | 1:1        | 1\|2       | Long loop, offset start, partial               |
| t21   | 7. Audio - Looped | 1:3         | 2:0        | 1\|1       | Arr starts ahead in loop (start > firstStart)  |
| t22   | 8. Audio - Looped | 1:3         | 2:1        | 1\|1       | Short loop, arr starts ahead                   |
| t23   | 9. Audio - Looped | 1:3         | 1:1        | 1\|1       | Long loop, arr positioned into content         |

### Unlooped - Warped (t24-t29)

| Track | Name                | Clip Length | Arr Length | Hidden Content | Edge Case                                |
| ----- | ------------------- | ----------- | ---------- | -------------- | ---------------------------------------- |
| t24   | 1. Audio - Unlooped | 2:0         | 2:0        | No             | All content visible, start == firstStart |
| t25   | 2. Audio - Unlooped | 1:1         | 1:1        | Yes            | Content beyond boundary                  |
| t26   | 4. Audio - Unlooped | 2:0         | 2:0        | No             | Content before arr start                 |
| t27   | 5. Audio - Unlooped | 1:1         | 1:1        | Yes            | Hidden content, start < firstStart       |
| t28   | 7. Audio - Unlooped | 1:3         | 1:3        | No             | All visible, start > firstStart          |
| t29   | 8. Audio - Unlooped | 1:0         | 1:0        | Yes            | Hidden content, start > firstStart       |

### Unwarped (t30-t35)

| Track | Name                | Clip Length | Arr Length | Hidden Content | Edge Case                                  |
| ----- | ------------------- | ----------- | ---------- | -------------- | ------------------------------------------ |
| t30   | 1. Audio - Unwarped | 2:0         | 2:1.6      | No             | Natural sample length, start == firstStart |
| t31   | 2. Audio - Unwarped | 1:1         | 1:1        | Yes            | Content beyond boundary                    |
| t32   | 4. Audio - Unwarped | 2:0         | 2:1.6      | No             | Content before arr start                   |
| t33   | 5. Audio - Unwarped | 1:1         | 1:1        | Yes            | Hidden content, start < firstStart         |
| t34   | 7. Audio - Unwarped | 1:3.4       | 2:0.4      | No             | All visible, start > firstStart            |
| t35   | 8. Audio - Unwarped | 1:0.4       | 1:0        | Yes            | Hidden content, start > firstStart         |

---

## Test Coverage

**MIDI:** 15 clips testing looped/unlooped × length relationships ×
start/firstStart timing

**Audio:** 21 clips testing looped/unlooped × warped/unwarped × length
relationships × start/firstStart timing

**Key edge cases:**

- Looped clips with various clip length vs arrangement length (==, <, >)
- firstStart offsets (loop start points)
- Hidden content (clip content beyond arrangement boundaries)
- Arrangement positioned into loop content
- Tiled/repeated loop content
- Unwarped audio with natural sample timing
