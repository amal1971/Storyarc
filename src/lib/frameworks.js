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
  {
    id: 'star',
    name: 'STAR',
    fullName: 'Situation · Task · Action · Result',
    emoji: '⭐',
    tagline: 'The interview classic — context, your job, what you did, what came of it.',
    steps: [
      {
        key: 'situation',
        label: 'Situation',
        hint: 'Set the scene in one or two lines — where, when, who was involved.',
      },
      {
        key: 'task',
        label: 'Task',
        hint: 'What was YOUR specific responsibility or goal in it? Not the team’s — yours.',
      },
      {
        key: 'action',
        label: 'Action',
        hint: 'What you actually did — concrete verbs, your decisions, in order.',
      },
      {
        key: 'result',
        label: 'Result',
        hint: 'What happened — ideally with a number — and what changed because of it.',
      },
    ],
    analysisGuidance:
      'Judge whether the listener can place the scene (Situation), whether the speaker names their OWN responsibility rather than the group\'s (Task — "we had to" without "I was responsible for" is partial), whether the actions are concrete first-person verbs rather than generalities (Action), and whether a stated outcome closes the loop, ideally with a measurable (Result). A result that is only "it went well" is partial.',
    retellGuidance:
      'Retell with a one-to-two line situation, a clearly owned first-person task, two or three concrete actions in sequence, and a result that states what happened and what changed — keep any number the speaker gave.',
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
  {
    id: 'disagreed-manager',
    emoji: '🤝',
    text: 'Interview: “Tell me about a time you disagreed with your manager.”',
  },
  {
    id: 'tight-deadline',
    emoji: '⏰',
    text: 'Interview: “Walk me through a time you had to deliver under a brutal deadline.”',
  },
  {
    id: 'proud-of',
    emoji: '🏅',
    text: 'Interview: “What’s a piece of work you’re genuinely proud of, and why?”',
  },
  {
    id: 'mistake-owned',
    emoji: '🧯',
    text: 'Interview: “Tell me about a mistake you made and what you did next.”',
  },
  {
    id: 'convinced-someone',
    emoji: '🎯',
    text: 'A colleague asks: “How did you get them to say yes to that?”',
  },
  {
    id: 'first-week',
    emoji: '🌱',
    text: 'At a reunion: “What was your first week at that job actually like?”',
  },
  {
    id: 'thing-broke-live',
    emoji: '🔥',
    text: 'Your team wants the story: “What happened when it broke in front of everyone?”',
  },
]

// `exclude` may be a single id or any iterable of ids (e.g. everything seen this
// session). If that empties the pool, fall back to "anything but the last one".
export function randomSituation(exclude) {
  const excluded = new Set(typeof exclude === 'string' ? [exclude] : exclude || [])
  let pool = SITUATIONS.filter((s) => !excluded.has(s.id))
  if (pool.length === 0) {
    const last = [...excluded].pop()
    pool = SITUATIONS.filter((s) => s.id !== last)
  }
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
