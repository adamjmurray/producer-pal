# Duplicate Tool Response Format Refactor

## Current Response Formats

### Track Duplication

**Single Track (count=1)**

```json
{
  "type": "track",
  "id": "15",
  "count": 1,
  "duplicated": true,
  "newTrackId": "274",
  "newTrackIndex": 2,
  "duplicatedClips": [
    { "id": "275", "view": "Session", "trackIndex": 2, "sceneIndex": 0 },
    { "id": "276", "view": "Session", "trackIndex": 2, "sceneIndex": 1 }
  ]
}
```

**Multiple Tracks (count=2)**

```json
{
  "type": "track",
  "id": "14",
  "count": 2,
  "duplicated": true,
  "objects": [
    {
      "newTrackId": "294",
      "newTrackIndex": 1,
      "duplicatedClips": [
        { "id": "295", "view": "Session", "trackIndex": 1, "sceneIndex": 0 },
        { "id": "296", "view": "Session", "trackIndex": 1, "sceneIndex": 1 }
      ]
    },
    {
      "newTrackId": "310",
      "newTrackIndex": 2,
      "duplicatedClips": [
        { "id": "311", "view": "Session", "trackIndex": 2, "sceneIndex": 0 },
        { "id": "312", "view": "Session", "trackIndex": 2, "sceneIndex": 1 }
      ]
    }
  ]
}
```

### Clip Duplication

**Single Clip to Session (count=1)**

```json
{
  "type": "clip",
  "id": "276",
  "count": 1,
  "duplicated": true,
  "destination": "session",
  "name": "DUPE",
  "duplicatedClip": {
    "id": "290",
    "view": "Session",
    "trackIndex": 2,
    "sceneIndex": 2,
    "name": "DUPE"
  }
}
```

**Multiple Clips to Session (count=3)**

```json
{
  "type": "clip",
  "id": "276",
  "count": 3,
  "duplicated": true,
  "destination": "session",
  "name": "DUPE",
  "objects": [
    {
      "duplicatedClip": {
        "id": "291",
        "view": "Session",
        "trackIndex": 2,
        "sceneIndex": 2,
        "name": "DUPE"
      }
    },
    {
      "duplicatedClip": {
        "id": "292",
        "view": "Session",
        "trackIndex": 2,
        "sceneIndex": 3,
        "name": "DUPE 2"
      }
    },
    {
      "duplicatedClip": {
        "id": "293",
        "view": "Session",
        "trackIndex": 2,
        "sceneIndex": 4,
        "name": "DUPE 3"
      }
    }
  ]
}
```

**Single Clip to Arrangement (count=1)**

```json
{
  "type": "clip",
  "id": "293",
  "count": 1,
  "duplicated": true,
  "destination": "arrangement",
  "arrangementStartTime": "1|1",
  "duplicatedClip": {
    "id": "337",
    "view": "Arrangement",
    "trackIndex": 4,
    "arrangementStartTime": "1|1"
  }
}
```

### Scene Duplication

**Multiple Scenes to Arrangement (count=2)**

```json
{
  "type": "scene",
  "id": "2",
  "count": 2,
  "duplicated": true,
  "destination": "arrangement",
  "arrangementStartTime": "5|1",
  "objects": [
    {
      "arrangementStartTime": "5|1",
      "duplicatedClips": [
        {
          "id": "326",
          "view": "Arrangement",
          "trackIndex": 0,
          "arrangementStartTime": "5|1"
        },
        {
          "id": "327",
          "view": "Arrangement",
          "trackIndex": 1,
          "arrangementStartTime": "5|1"
        },
        {
          "id": "328",
          "view": "Arrangement",
          "trackIndex": 2,
          "arrangementStartTime": "5|1"
        },
        {
          "id": "329",
          "view": "Arrangement",
          "trackIndex": 3,
          "arrangementStartTime": "5|1"
        },
        {
          "id": "330",
          "view": "Arrangement",
          "trackIndex": 4,
          "arrangementStartTime": "5|1"
        }
      ]
    },
    {
      "arrangementStartTime": "9|1",
      "duplicatedClips": [
        {
          "id": "331",
          "view": "Arrangement",
          "trackIndex": 0,
          "arrangementStartTime": "9|1"
        },
        {
          "id": "332",
          "view": "Arrangement",
          "trackIndex": 1,
          "arrangementStartTime": "9|1"
        },
        {
          "id": "333",
          "view": "Arrangement",
          "trackIndex": 2,
          "arrangementStartTime": "9|1"
        },
        {
          "id": "334",
          "view": "Arrangement",
          "trackIndex": 3,
          "arrangementStartTime": "9|1"
        },
        {
          "id": "335",
          "view": "Arrangement",
          "trackIndex": 4,
          "arrangementStartTime": "9|1"
        }
      ]
    }
  ]
}
```

## Current Issues

1. **Inconsistent Structure**: Single count uses direct fields (`newTrackId`,
   `duplicatedClip`), multiple count uses `objects` array
2. **Redundant Wrapping**: In multi-count responses, each item in `objects`
   array unnecessarily wraps the actual data
3. **Inconsistent Naming**: `duplicatedClips` vs `duplicatedClip` vs
   `newTrackId`
4. **Mixed Terminology**: "duplicated" vs "new" prefixes

## Proposed Unified Format

### Structure by Operation Type

**Track Duplication**

```json
{
  "type": "track",
  "id": "14",
  "count": 2,
  "newTracks": [
    {
      "id": "294",
      "trackIndex": 1,
      "clips": [
        { "id": "295", "view": "Session", "trackIndex": 1, "sceneIndex": 0 },
        { "id": "296", "view": "Session", "trackIndex": 1, "sceneIndex": 1 }
      ]
    },
    {
      "id": "310",
      "trackIndex": 2,
      "clips": [
        { "id": "311", "view": "Session", "trackIndex": 2, "sceneIndex": 0 },
        { "id": "312", "view": "Session", "trackIndex": 2, "sceneIndex": 1 }
      ]
    }
  ]
}
```

**Clip Duplication**

```json
{
  "type": "clip",
  "id": "276",
  "count": 3,
  "destination": "session",
  "name": "DUPE",
  "newClips": [
    {
      "id": "291",
      "view": "Session",
      "trackIndex": 2,
      "sceneIndex": 2,
      "name": "DUPE"
    },
    {
      "id": "292",
      "view": "Session",
      "trackIndex": 2,
      "sceneIndex": 3,
      "name": "DUPE 2"
    },
    {
      "id": "293",
      "view": "Session",
      "trackIndex": 2,
      "sceneIndex": 4,
      "name": "DUPE 3"
    }
  ]
}
```

**Scene Duplication to Arrangement**

```json
{
  "type": "scene",
  "id": "2",
  "count": 2,
  "destination": "arrangement",
  "arrangementStartTime": "5|1",
  "newScenes": [
    {
      "clips": [
        {
          "id": "326",
          "view": "Arrangement",
          "trackIndex": 0,
          "arrangementStartTime": "5|1"
        },
        {
          "id": "327",
          "view": "Arrangement",
          "trackIndex": 1,
          "arrangementStartTime": "5|1"
        }
      ]
    },
    {
      "clips": [
        {
          "id": "331",
          "view": "Arrangement",
          "trackIndex": 0,
          "arrangementStartTime": "9|1"
        },
        {
          "id": "332",
          "view": "Arrangement",
          "trackIndex": 1,
          "arrangementStartTime": "9|1"
        }
      ]
    }
  ]
}
```

**Scene Duplication to Session**

```json
{
  "type": "scene",
  "id": "2",
  "count": 2,
  "destination": "session",
  "newScenes": [
    {
      "id": "350",
      "sceneIndex": 5,
      "clips": [
        { "id": "351", "view": "Session", "trackIndex": 0, "sceneIndex": 5 },
        { "id": "352", "view": "Session", "trackIndex": 1, "sceneIndex": 5 }
      ]
    },
    {
      "id": "360",
      "sceneIndex": 6,
      "clips": [
        { "id": "361", "view": "Session", "trackIndex": 0, "sceneIndex": 6 },
        { "id": "362", "view": "Session", "trackIndex": 1, "sceneIndex": 6 }
      ]
    }
  ]
}
```

## Benefits of Proposed Format

1. **Consistent Structure**: Always use arrays (`newTracks`, `newClips`,
   `newScenes`) regardless of count
2. **Predictable Naming**: Operation type determines array name
3. **Clean Nesting**: Contained clips use simple `clips` array, not
   `duplicatedClips`
4. **No Redundant Wrappers**: Eliminate unnecessary object layers
5. **Type-Safe Parsing**: Response structure is predictable based on operation
   type

## Implementation Priority

**Low Priority** - Current format is functional and understandable. This is a
polish/consistency improvement that can be addressed when convenient.
