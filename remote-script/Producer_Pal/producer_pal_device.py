# Producer Pal
# Copyright (C) 2026 Adam Murray
# AI assistance: Claude (Anthropic)
# SPDX-License-Identifier: GPL-3.0-or-later

"""Recognizing the Producer Pal device. A Live Set can only have one."""

PRODUCER_PAL_NAME = "producer_pal"


def is_producer_pal(name):
    """True for the Producer Pal device, any case, with or without .amxd."""
    text = str(name or "").strip().lower()
    if text.endswith(".amxd"):
        text = text[: -len(".amxd")]
    return text == PRODUCER_PAL_NAME
