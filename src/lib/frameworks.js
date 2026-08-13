// Framework registry — the single source of truth for practice frameworks.
// Adding a new framework = adding one entry here. The gym UI, the mock
// analyzer, and the Gemini prompt in api/analyze-framework.js all render
// themselves from this shape; no other code changes needed.

export const FRAMEWORKS = [
  {
    id: 'abt',
    name: 'ABT',
    fullName: 'And · But · Therefore',
    emoji: '🎢',
    tagline: 'The narrative spine — setup, turn, consequence.',
    steps: [
      {
        key: 'and',
        label: 'And',
        hint: 'Set the scene calmly — the world as it is, facts joined with “and”.',
      },
      {
        key: 'but',
        label: 'But',
        hint: 'One thing breaks the calm. A single clear turn, not a pile of problems.',
      },
      {
        key: 'therefore',
        label: 'Therefore',
        hint: 'What you did because of the turn — and how it actually ended.',
      },
    ],
    analysisGuidance:
      'Judge whether the telling has a calm setup (And), a single clear turn (But), and a consequence-driven resolution (Therefore). A story that chains events with "and then, and then" without a turn has a missed But. A resolution that does not follow from the turn is a partial Therefore.',
    retellGuidance:
      'Retell with a calm two-fact setup, one sharp turn introduced with "But", and a resolution that begins with the consequence of that turn.',
  },
  {
    id: 'scr',
    name: 'SCR',
    fullName: 'Situation · Complication · Resolution',
    emoji: '🏔️',
    tagline: 'The consulting classic — context, tension, answer.',
    steps: [
      {
        key: 'situation',
        label: 'Situation',
        hint: 'Ground the listener: who, where, when — in one or two lines.',
      },
      {
        key: 'complication',
        label: 'Complication',
        hint: 'The specific thing that went wrong or changed. Concrete beats generic.',
      },
      {
        key: 'resolution',
        label: 'Resolution',
        hint: 'How it was handled and where it landed — state the outcome plainly.',
      },
    ],
    analysisGuidance:
      'Judge whether the listener can place the scene (Situation), whether the trouble is specific rather than generic (Complication), and whether a stated outcome resolves that trouble (Resolution). "It was stressful" alone is not a complication; "it worked out" alone is a partial resolution.',
    retellGuidance:
      'Retell with a crisp one-to-two line situation, a concrete complication, and a resolution that explicitly closes the loop on the complication.',
  },
]

export function getFramework(id) {
  return FRAMEWORKS.find((f) => f.id === id) || null
}

// Gym situations — the user is GIVEN one of these and asked to answer it
// using the chosen framework.
export const SITUATIONS = [
  {
    id: 'interview-wrong',
    emoji: '💼',
    text: 'Job interview. They lean in: “Tell me about a time something went wrong.”',
  },
  {
    id: 'why-left',
    emoji: '🚪',
    text: 'A friend asks over coffee: “So why did you actually leave?”',
  },
  {
    id: 'meeting-recap',
    emoji: '📣',
    text: 'Your team wants the story: “How did the big meeting actually go?”',
  },
  {
    id: 'trip-moment',
    emoji: '🧳',
    text: 'At dinner: “How was your trip?” — tell one moment, not the itinerary.',
  },
  {
    id: 'weird-nickname',
    emoji: '🐙',
    text: 'A new teammate asks how the project got its weird nickname.',
  },
]

export function randomSituation(excludeId) {
  const pool = SITUATIONS.filter((s) => s.id !== excludeId)
  return pool[Math.floor(Math.random() * pool.length)]
}

// Canned, pre-analyzed Gym result shown in the start-screen sample modal —
// mirrors the shape GymFeedbackScreen expects, so users can preview Gym
// before committing, the same way SAMPLE previews Lab.
export const GYM_SAMPLE = {
  frameworkId: 'abt',
  situationId: 'weird-nickname',
  steps: [
    {
      key: 'and',
      verdict: 'hit',
      note: 'You grounded us fast — we know the project and the team before anything moves.',
    },
    {
      key: 'but',
      verdict: 'partial',
      note: 'Something breaks the calm here, but it arrives as a few things going wrong at once rather than one clean turn.',
    },
    {
      key: 'therefore',
      verdict: 'hit',
      note: 'The ending follows from the trouble and lands somewhere definite — and it explains the nickname.',
    },
  ],
  feedback_line:
    'Two beats land cleanly — one sharper turn of the screw and the ABT spine clicks all the way into place.',
  retelling: [
    {
      step: 'and',
      text: 'We were three weeks into building the new onboarding flow, and the whole team was heads-down trying to hit the demo date.',
    },
    {
      step: 'but',
      text: 'But the staging database got wiped by a bad migration script the night before — and nobody noticed until standup.',
    },
    {
      step: 'therefore',
      text: 'Therefore we rebuilt it from a six-hour-old backup live on a call, and someone joked we should ship a "phoenix" badge — the name stuck.',
    },
  ],
}
