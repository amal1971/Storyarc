export const PROMPTS = [
  { id: 'plan-fell-apart', emoji: '🫠', text: 'A time a plan completely fell apart' },
  { id: 'small-win', emoji: '🏆', text: 'A small win nobody noticed' },
  { id: 'stranger', emoji: '👋', text: 'A stranger who surprised you' },
  { id: 'nervous', emoji: '😬', text: 'The most nervous you’ve been in the past year' },
  { id: 'changed-mind', emoji: '🔄', text: 'Something you changed your mind about' },
]

export const OWN_STORY = { id: 'own-story', emoji: '✨', text: 'Tell your own story' }

// Sample shown in the start screen's "Peek at a sample" modal.
// This is REAL saved output from the live pipeline (generated 2026-10-12 with
// the prompts noted in `provenance`), not hand-written copy: the transcript
// went through analyze-fillers and analyze-structure, and the modal rebuilds
// the highlights and counts in code exactly as FeedbackScreen does. The story
// deliberately stops mid-scramble so the feedback has one clear thing to say.
// To refresh it, re-run the stories through the endpoints and paste the
// outputs verbatim — never edit the model's wording by hand.
export const SAMPLE = {
  title: 'Sample: “A time a plan completely fell apart”',
  transcript:
    "So, um, last December my sister and I planned a surprise party for our dad's sixtieth. We'd booked this rooftop place in Indiranagar, ordered the cake, and, like, forty relatives were coming. And then, uh, at four in the afternoon the restaurant calls and says the rooftop is closed because of the rain, and they have no indoor space. I mean, the party was at seven. So I'm calling every place I know, my sister is basically texting forty people, and my dad keeps asking why we're both acting so weird. We were sort of running around the house trying to figure out where to move everyone.",
  // Tier-B (model-judged) fillers; Tier A and repetitions are recomputed in code.
  tierB: [
    {
      "token": "like",
      "category": "discourse_filler",
      "context": "ordered the cake, and, like, forty relatives were coming."
    }
  ],
  structure: {
    situation_present: true,
    complication_present: true,
    outcome_present: false,
    outcome_connected: false,
    flagged_element: "outcome",
    feedback_line:
      "You build great tension with the rain closing the Indiranagar rooftop at 4 PM, but the story cuts off while you and your sister are still frantically texting guests and dodging your dad's questions.",
    evidence: "trying to figure out where to move everyone",
    suggested_fix:
      "Tell us where you ended up moving the forty guests for the party that night.",
  },
  provenance: {
    generated: '2026-10-12',
    structure: { prompt_version: "structure-2026-07-24", model: "gemini-3.6-flash" },
    fillers: { prompt_version: "fillers-2026-09-04", model: "gemini-3.6-flash" },
  },
}
