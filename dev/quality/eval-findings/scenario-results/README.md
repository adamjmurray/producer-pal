# Scenario results by run

Which scenarios failed in which run, and what moved between runs. Run numbers
refer to [recorded-runs.md](../recorded-runs.md).

**Recording a run means recording every failure,** not just what moved: each
scenario that failed a trial, its tally per model, and a one-line cause. The
result files are gitignored, so a failure left out here can never be compared
against a later run. Generate the table, then add the causes by hand:

```bash
scripts/eval-report --failures <runId> [<runId> ...]
```

Several run IDs stitch a run that was finished by re-runs: for each scenario and
model the newest directory wins, and refused or errored trials never count.

| File                           | Runs                                                        |
| ------------------------------ | ----------------------------------------------------------- |
| [runs-02-13.md](runs-02-13.md) | Failures in runs 2-9, what moved through run 10, qwen 11-13 |
| [runs-14-23.md](runs-14-23.md) | What moved, luna and haiku (no full failure lists)          |
| [runs-24-25.md](runs-24-25.md) | Sonnet 5.5 and GPT-6.1 Terra, every failure                 |
