# New eval scenario: jambalaya-sampler-plate

Hey Adam! I'm Taylor, I'm a musician and engineer and Ableton user. I've been
digging into Producer Pal and I'm really excited about it!!

I put together an eval scenario called jambalaya-sampler-plate. I got excited
about the idea that you could handpick a collection of samples, throw them in a
folder, then have Producer Pal help arrange and organize samples from the folder
in musically informed ways. Matching keys across multiple samples, transposing
when necessary, and creating scenes of several semi-random combinations.

It chains together ppal-context, ppal-create-track, ppal-create-clip,
ppal-create-scene, and ppal-update-clip. The assertions check that the right
tools get called with reasonable counts, and there's an LLM judge rubric that
evaluates the musical decisions. Anchor key selection, staying within 6
semitones, not transposing drums, mixing dense and sparse arrangements, that
kind of thing.

I also built a Claude skill version of the same workflow so I can use it in my
own sessions. It's been fun to just point it at a folder and see what it comes
up with.

I saw that LLM evaluations are on your list in DEVELOPERS.md. Would you be open
to a PR for this?
