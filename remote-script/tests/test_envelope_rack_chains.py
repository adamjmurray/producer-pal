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


def mixer(sends=0):
    return types.SimpleNamespace(
        volume=FakeParam("Volume"),
        panning=FakeParam("Pan"),
        sends=[FakeParam("Send %d" % i) for i in range(sends)],
    )


def chain(devices, sends=0):
    return types.SimpleNamespace(devices=devices, mixer_device=mixer(sends))


def device(*names, chains=None, return_chains=None):
    fake = types.SimpleNamespace(
        parameters=[FakeParam(n) for n in names], can_have_chains=chains is not None
    )
    if chains is not None:
        # A chain has a send per return chain of its rack.
        fake.chains = [chain(c, len(return_chains or [])) for c in chains]
    if return_chains is not None:
        fake.return_chains = [chain(c) for c in return_chains]
    return fake


class World:
    """t0 holds a Drum Rack: a synth in chain 0, a reverb in return chain 0."""

    def __init__(self):
        self.synth = device("Cutoff")
        self.reverb = device("Dry/Wet", "Decay")
        self.rack = device("Macro 1", chains=[[self.synth]], return_chains=[[self.reverb]])
        self.effect_rack = device("Macro 1", chains=[[device("Gain")]])
        self.clip = FakeClip(self.synth.parameters[0], self.reverb.parameters[1])
        slot = types.SimpleNamespace(has_clip=True, clip=self.clip)
        track = types.SimpleNamespace(
            clip_slots=[slot], devices=[self.rack, self.effect_rack], mixer_device=mixer()
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


class ChainMixerEnvelopeTest(unittest.TestCase):
    """A chain has a volume, pan and sends of its own, named like the track's."""

    def setUp(self):
        self.world = World()
        chain_mixer = self.world.rack.chains[0].mixer_device
        return_mixer = self.world.rack.return_chains[0].mixer_device
        self.world.clip.params = (
            chain_mixer.volume,
            chain_mixer.sends[0],
            return_mixer.panning,
        )

    def test_list_names_a_chains_own_mixer_envelopes(self):
        listed = self.world.call("list")["envelopes"]
        self.assertEqual(
            [(e["device"], e["parameter_name"]) for e in listed],
            [("d0/c0", "volume"), ("d0/c0", "send0"), ("d0/rc0", "pan")],
        )

    def test_read_takes_the_address_list_gave(self):
        read = self.world.call("read", device="d0/c0", parameter="send0")
        self.assertIs(read["exists"], True)
        self.assertEqual(read["parameter"]["name"], "Send 0")

    def test_a_chain_takes_only_mixer_names(self):
        with self.assertRaises(RouteError) as caught:
            self.world.call("read", device="d0/c0", parameter=0)
        self.assertEqual(caught.exception.status, 400)

    def test_a_send_the_chain_lacks_is_refused(self):
        with self.assertRaises(RouteError) as caught:
            self.world.call("read", device="d1/c0", parameter="send0")
        self.assertEqual(caught.exception.status, 400)


if __name__ == "__main__":
    unittest.main()
