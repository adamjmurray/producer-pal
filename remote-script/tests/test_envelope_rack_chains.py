# Producer Pal
# Copyright (C) 2026 Adam Murray
# AI assistance: Claude (Anthropic)
# SPDX-License-Identifier: MIT

"""The envelope routes reach devices in a rack's chains and return chains.

A clip copied to another track loses its device envelopes, and the copy names
them from /envelope/list. One on a Drum Rack return chain's device was never
listed, so it was lost without a word.

Run: PYTHONDONTWRITEBYTECODE=1 python3 -m unittest discover -s remote-script/tests
"""

import os
import sys
import types
import unittest

# Keep __pycache__ out of the checkout.
sys.dont_write_bytecode = True
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
# Only Live's own Python has this module; the package imports it on load.
sys.modules.setdefault("Live", types.ModuleType("Live"))

from Producer_Pal import routes  # noqa: E402
from Producer_Pal.errors import RouteError  # noqa: E402


class FakeParam:
    min = 0.0
    max = 1.0
    value = 0.5
    is_quantized = False
    is_enabled = True
    automation_state = 0

    def __init__(self, name):
        self.name = name

    def str_for_value(self, value):
        return "%s" % value


class FakeEnvelope:
    def events_in_range(self, start, end):
        return []


class FakeClip:
    def __init__(self, *params):
        self.params = params
        self.has_envelopes = True

    def automation_envelope(self, param):
        return FakeEnvelope() if any(param is p for p in self.params) else None


def device(*names, chains=None, return_chains=None):
    fake = types.SimpleNamespace(
        parameters=[FakeParam(n) for n in names], can_have_chains=chains is not None
    )
    if chains is not None:
        fake.chains = [types.SimpleNamespace(devices=c) for c in chains]
    if return_chains is not None:
        fake.return_chains = [types.SimpleNamespace(devices=c) for c in return_chains]
    return fake


class World:
    """t0 holds a Drum Rack: a synth in chain 0, a reverb in return chain 0."""

    def __init__(self):
        self.synth = device("Cutoff")
        self.reverb = device("Dry/Wet", "Decay")
        self.rack = device("Macro 1", chains=[[self.synth]], return_chains=[[self.reverb]])
        self.effect_rack = device("Macro 1", chains=[[device("Gain")]])
        self.clip = FakeClip(self.synth.parameters[0], self.reverb.parameters[1])
        mixer = types.SimpleNamespace(volume=FakeParam("Volume"), panning=FakeParam("Pan"), sends=[])
        slot = types.SimpleNamespace(has_clip=True, clip=self.clip)
        track = types.SimpleNamespace(
            clip_slots=[slot], devices=[self.rack, self.effect_rack], mixer_device=mixer
        )
        self.bridge = types.SimpleNamespace(
            song=types.SimpleNamespace(tracks=[track], return_tracks=[])
        )

    def call(self, route, **params):
        return routes.ROUTES["/envelope/" + route](self.bridge, dict(params, track="t0", slot=0))


class RackChainEnvelopeTest(unittest.TestCase):
    def setUp(self):
        self.world = World()

    def test_list_names_envelopes_in_chains_and_return_chains(self):
        listed = self.world.call("list")["envelopes"]
        self.assertEqual(
            [(e["device"], e["parameter"]["name"]) for e in listed],
            [("d0/c0/d0", "Cutoff"), ("d0/rc0/d0", "Decay")],
        )

    def test_read_walks_the_path_list_gave(self):
        read = self.world.call("read", device="d0/rc0/d0", parameter=1)
        self.assertIs(read["exists"], True)
        self.assertEqual(read["parameter"]["name"], "Decay")

    def test_a_return_chain_on_a_rack_without_any_is_a_404(self):
        with self.assertRaises(RouteError) as caught:
            self.world.call("read", device="d1/rc0/d0", parameter=0)
        self.assertEqual(caught.exception.status, 404)


if __name__ == "__main__":
    unittest.main()
