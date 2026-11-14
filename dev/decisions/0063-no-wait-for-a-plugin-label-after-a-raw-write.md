# ADR-0063: No wait for a plug-in label after a raw write

- **Status:** Accepted
- **Date logged:** 2026-11-13

## Decision

A param with no readable display range reports its label as `display`. After a
raw write, update-device and create-device read that label back at once, with
`str_for_value`, in the same tick.

Writing random values to every param of six Valhalla VST3s, about 460 writes on
each of Live 12.3 and 12.4.16, never found `str_for_value` behind the write.

## Rejected

- **Polling for a changed label before the read-back** (10 ms steps, 150 ms
  cap). Built, then removed. It covered a lag that wasn't there, made the device
  update and create paths async, and cost the full 150 ms whenever a new value
  showed the same label as the old one.
- **Reading the label from `__str__`.** That text is one write behind, on VST3
  and VST2 alike. An earlier probe that saw a 15-45 ms lag was most likely
  reading it.
- **A wait to catch a linked param.** ValhallaDelay and Supermassive derive
  their delay time in ms from the note value in a synced mode, and can overwrite
  a ms write after the call returns. Our own write changes the label at once, so
  a poll for a changed label stops before the overwrite. When the overwrite
  comes is not predictable, and write order doesn't decide it.
