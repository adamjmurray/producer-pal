# Producer Pal
# Copyright (C) 2026 Adam Murray
# AI assistance: Claude (Anthropic)
# SPDX-License-Identifier: MIT

"""Closing Live's pending undo step. Live merges everything changed since the
last step into one, so Producer Pal calls this after each write tool call to
make that call one step. Main thread only."""


def end(bridge, params):
    """Close the pending undo step. Harmless when nothing is pending."""
    bridge.song.end_undo_step()
    return {"ok": True}


ROUTES = {"/undo/end": end}
