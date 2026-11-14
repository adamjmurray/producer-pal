# Run 37

Run numbers refer to [recorded-runs.md](../recorded-runs.md).

```bash
scripts/eval-report --failures 2026-11-13T18-07-36Z
```

| scenario                       | kind       | qwen3.8-flash-next (37) |
| ------------------------------ | ---------- | ----------------------- |
| `context-onboarding-no-import` | regression | 1/3                     |
| `device-copy-in-place`         | capability | 2/3                     |
| `device-mapped-macros`         | capability | 2/3                     |
| `drum-backbeat-stark`          | capability | 2/3                     |
| `drum-transforms`              | capability | 2/3                     |
| `library-search-fanout`        | capability | 2/3                     |
| `note-ops-split`               | capability | 2/3                     |
| `swing-and-quantize`           | capability | 2/3                     |
| **total**                      |            | 393/402 (134 scenarios) |

- `context-onboarding-no-import`: offered to save preferences it said it
  remembered, though global context was empty; next trial, offered to save an
  unrelated C++ project along with the music notes.
- `device-copy-in-place`: named the copy `Lead Trim 2` instead of keeping the
  original's name.
- `device-mapped-macros`: said the macros were at 100%; the final values
  disagreed.
- `drum-backbeat-stark`: red on purpose (see the eval-findings README); wrote
  `kick: X z X z` while saying four-on-the-floor.
- `drum-transforms`: left the time range out of a selector (`Ab1 2|2.5`).
- `library-search-fanout`: Jev failed the reply on the criteria (0.29).
- `note-ops-split`: wrote `n/1` for one beat; it is a whole note. It noticed but
  left the clip wrong.
- `swing-and-quantize`: never applied `swing()` to the hats in turn 3.
