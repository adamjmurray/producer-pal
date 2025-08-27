# Producer Pal Manual QA Plan

How to manually confirm most Producer Pal functionality is working as intended.

TODO: WORK IN PROGRESS for Producer Pal 1.0.0

## Scenario 1: Blank Canvas

**Setup:** Completely empty Live set with Producer Pal device on any track

**Conversation starter:**

> "I want to make some music but I'm not sure where to start. Can you help me
> get going?"

**Expected flow:**

- AI should read the current state and see it's empty
- Should suggest creating some tracks and basic elements
- Might ask about genre preferences or mood
- Should generate some initial musical content (drums, chords, or bass)

**Follow-ups to test:**

- "That's good, but make it more energetic"
- "Add a bassline that goes with this"
- "Switch to a different key"

---

## Scenario 2: Seed Expansion

**Setup:**

- Create one track with a simple 2-4 bar MIDI clip (basic chord progression or
  simple melody)
- Name the track appropriately ("Chords" or "Lead")

**Conversation starter:**

> "I have this basic idea going. Can you help me expand it into something
> fuller?"

**Expected flow:**

- AI should analyze existing content
- Suggest complementary elements (drums if you have chords, bass if you have
  melody, etc.)
- Build around the existing material rather than replacing it

**Follow-ups to test:**

- "Add some variation to what we have"
- "Create a B section that contrasts with this"
- "Make the drums more complex"

---

## Scenario 3: Rhythm-First

**Setup:** Empty set or set with just a Drum Rack loaded on one track

**Conversation starter:**

> "I want to start with a killer drum pattern. Something that really drives the
> track forward."

**Expected flow:**

- AI should create or work with drum track
- Focus on rhythm patterns, fills, variations
- Should suggest tempo and time signature considerations

**Follow-ups to test:**

- "Make the kick pattern more interesting"
- "Add some hi-hat variations"
- "What would work well over this rhythm?"
- "Create a breakdown version of this beat"

---

## Scenario 4: Harmony-First

**Setup:** Empty set or set with piano/synth loaded on one track

**Conversation starter:**

> "I want to build around a chord progression. Something in a minor key that
> feels emotional."

**Expected flow:**

- AI should create chord progressions
- Discuss harmonic concepts and voice leading
- Suggest complementary elements that support the harmony

**Follow-ups to test:**

- "Try a different inversion of that last chord"
- "What scale would work for a melody over this?"
- "Add some rhythmic interest to these chords"
- "Transpose this to a different key"

---

## Scenario 5: Bass-Driven

**Setup:** Empty set or set with bass instrument loaded

**Conversation starter:**

> "I want the bass to be the star of this track. Something groovy that
> everything else revolves around."

**Expected flow:**

- AI should create prominent basslines
- Focus on groove, rhythm, and melodic bass patterns
- Build other elements that complement rather than compete

**Follow-ups to test:**

- "Make the bass more syncopated"
- "Add some slides and bends to make it more expressive"
- "What drums would lock in with this bass?"
- "Create a simpler version for the verses"

---

## Scenario 6: Melodic Focus

**Setup:** Empty set or set with lead instrument loaded

**Conversation starter:**

> "I need a catchy melody that will stick in people's heads. Something
> memorable."

**Expected flow:**

- AI should create strong melodic content
- Focus on phrasing, memorable intervals, and song structure
- Consider how melody relates to underlying harmony

**Follow-ups to test:**

- "Make that melody more repetitive and catchy"
- "Add some ornaments and embellishments"
- "Create a harmony line that doubles this melody"
- "What chords would support this melody?"

---

## Scenario 7: Creative Block

**Setup:**

- Set with 2-3 tracks that have some content but feel incomplete or stuck
- Mix of different elements (maybe drums + chords, or bass + melody)

**Conversation starter:**

> "I've been working on this for a while but I'm stuck. It feels like it's
> missing something or going nowhere."

**Expected flow:**

- AI should analyze existing content
- Identify what might be missing or problematic
- Suggest specific improvements or new directions
- Offer multiple options to try

**Follow-ups to test:**

- "That helps, but it still feels repetitive"
- "Can you suggest a completely different direction?"
- "What if we changed the tempo?"
- "How can I make this more interesting?"

---

## Scenario 8: Loop to Song

**Setup:**

- Set with several 4-8 bar loops that work well together
- Multiple tracks with good content but no arrangement

**Conversation starter:**

> "I have these loops that sound great together, but I don't know how to turn
> them into an actual song structure."

**Expected flow:**

- AI should suggest arrangement strategies
- Help create intro/outro, verse/chorus distinctions
- Use arrangement view to lay out full song structure
- Create variations and transitions

**Follow-ups to test:**

- "Create a breakdown section"
- "Make an intro that builds up to the main section"
- "Add some transition elements between sections"
- "How long should each section be?"

---

## Scenario 9: Rapid Prototyping

**Setup:** Empty set, but approach with time pressure mindset

**Conversation starter:**

> "I have 15 minutes to get a rough demo together. Help me move fast and get
> something that sounds decent quickly."

**Expected flow:**

- AI should prioritize speed over perfection
- Make quick decisions about key, tempo, style
- Generate multiple elements rapidly
- Focus on "good enough" rather than detailed crafting

**Follow-ups to test:**

- "That's good, but I need it to hit harder"
- "Make this sound more professional quickly"
- "Add one more element and we're done"

---

## Scenario 10: Music Theory Learning

**Setup:** Empty set, approach as learning exercise

**Conversation starter:**

> "I want to learn about [jazz harmony/modal scales/polyrhythms/etc.] by
> actually making music. Can you teach me while we create something?"

**Expected flow:**

- AI should explain concepts while demonstrating
- Create musical examples that illustrate theory points
- Encourage experimentation with theoretical concepts
- Connect abstract theory to practical application

**Follow-ups to test:**

- "Show me how that chord progression uses voice leading"
- "What makes this sound 'jazzy'?"
- "Can you demonstrate the difference between these two scales?"
- "How would I use this concept in other genres?"

---

## General Testing Notes

**Things to watch for across all scenarios:**

- Does the AI understand context and build appropriately?
- Are the musical suggestions actually good and usable?
- Does conversation flow feel natural and helpful?
- Can you accomplish your musical goals efficiently?
- Are error messages clear when things go wrong?
- Does the tool enhance creativity or get in the way?

**Technical validation:**

- Do all generated clips play correctly?
- Are timing and quantization handled properly?
- Do changes persist when you close/reopen the project?
- Does the tool work consistently across different tempos and time signatures?
