# Producer Pal
# Copyright (C) 2026 Adam Murray
# AI assistance: Claude (Anthropic)
# SPDX-License-Identifier: GPL-3.0-or-later

"""Producer Pal - a prototype Ableton Live remote script with an HTTP port."""

from .bridge import ProducerPalBridge


def create_instance(c_instance):
    """Live calls this once when the control surface is selected in Preferences."""
    return ProducerPalBridge(c_instance)
