# Producer Pal
# Copyright (C) 2026 Adam Murray
# AI assistance: Claude (Anthropic)
# SPDX-License-Identifier: MIT

"""`update_display` loops and sleeps while the server is busy, and not when idle.

Run: PYTHONDONTWRITEBYTECODE=1 python3 -m unittest discover -s remote-script/tests
"""

import os
import queue
import sys
import types
import unittest
from unittest import mock

# Keep __pycache__ out of the checkout.
sys.dont_write_bytecode = True
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
# Only Live's own Python has this module; the package imports it on load.
sys.modules.setdefault("Live", types.ModuleType("Live"))

from Producer_Pal import bridge  # noqa: E402


class FakeClock:
    """Stands in for `time`: a sleep moves the clock and is recorded."""

    def __init__(self, step=0.0):
        self.now = 0.0
        self.step = step
        self.sleeps = []
        # Runs after each sleep, as the HTTP threads do while we wait.
        self.on_sleep = None

    def monotonic(self):
        return self.now

    def sleep(self, seconds):
        self.sleeps.append(seconds)
        self.now += seconds + self.step
        if self.on_sleep:
            self.on_sleep(len(self.sleeps))


class FakeServer:
    """`busy()` answers from a script, then False."""

    def __init__(self, script):
        self.script = list(script)
        self.checks = 0

    def busy(self):
        self.checks += 1
        return self.script.pop(0) if self.script else False


class FakeJob:
    def __init__(self, ran):
        self.ran = ran

    def run(self):
        self.ran.append(self)


class UpdateDisplayTest(unittest.TestCase):
    def setUp(self):
        self.clock = FakeClock()
        patch = mock.patch.object(bridge, "time", self.clock)
        patch.start()
        self.addCleanup(patch.stop)
        self.ran = []

    def surface(self, server):
        surface = object.__new__(bridge.ProducerPalBridge)
        surface._jobs = queue.Queue()
        surface._server = server
        return surface

    def test_an_idle_tick_checks_once_and_does_not_sleep(self):
        server = FakeServer([False])

        self.surface(server).update_display()

        self.assertEqual(server.checks, 1)
        self.assertEqual(self.clock.sleeps, [])

    def test_an_idle_tick_still_runs_queued_jobs(self):
        # Whatever busy() says, queued jobs run.
        surface = self.surface(FakeServer([]))
        surface._jobs.put(FakeJob(self.ran))

        surface.update_display()

        self.assertEqual(len(self.ran), 1)

    def test_lingers_three_quiet_checks_after_being_busy(self):
        server = FakeServer([True, True])

        self.surface(server).update_display()

        # Two busy checks, then three quiet ones; the last check ends it
        # without a sleep.
        self.assertEqual(server.checks, 5)
        self.assertEqual(self.clock.sleeps, [bridge.YIELD_SLEEP] * 4)

    def test_busy_again_during_the_linger_restarts_it(self):
        server = FakeServer([True, False, False, True])

        self.surface(server).update_display()

        self.assertEqual(server.checks, 7)

    def test_stops_when_the_budget_is_spent(self):
        server = FakeServer([True] * 1000)
        self.clock.step = bridge.YIELD_BUDGET / 4

        self.surface(server).update_display()

        # Each round is one check and one sleep, except the last, which stops
        # before sleeping.
        self.assertEqual(server.checks, len(self.clock.sleeps) + 1)
        self.assertLess(server.checks, 10)
        self.assertGreaterEqual(self.clock.now, bridge.YIELD_BUDGET)

    def test_a_long_job_is_not_interrupted_and_ends_the_loop(self):
        job = FakeJob(self.ran)
        job.run = lambda: (self.ran.append(job), self.clock.sleep(1.0))
        surface = self.surface(FakeServer([True] * 1000))
        surface._jobs.put(job)

        surface.update_display()

        self.assertEqual(self.ran, [job])
        # Only the job's own long sleep; the loop didn't sleep again.
        self.assertEqual(self.clock.sleeps, [1.0])

    def test_jobs_queued_during_a_sleep_run_in_the_same_call(self):
        # The 3rd sleep is the last: the loop ends right after it.
        for sleep_number in (1, 3):
            with self.subTest(sleep_number=sleep_number):
                self.clock.sleeps.clear()
                self.ran.clear()
                surface = self.surface(FakeServer([True]))
                job = FakeJob(self.ran)

                def queue_job(count, job=job, number=sleep_number, surface=surface):
                    if count == number:
                        surface._jobs.put(job)

                self.clock.on_sleep = queue_job

                surface.update_display()

                self.assertEqual(self.ran, [job])
                self.assertTrue(surface._jobs.empty())


if __name__ == "__main__":
    unittest.main()
