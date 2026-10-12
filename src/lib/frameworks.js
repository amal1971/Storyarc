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

// Gym sample shown in the start screen's "Peek at a sample" modal: the story
// itself, then the beat verdicts, feedback line and retelling. REAL saved
// output from api/analyze-framework.js (generated 2026-10-12, see
// `provenance`) for this transcript and situation — not hand-written. The
// story piles three problems into its turn on purpose, so the verdicts have
// one clear lesson (a "But" should be one sharp turn). Refresh by re-running
// the endpoint and pasting the output verbatim.
export const GYM_SAMPLE = {
  frameworkId: 'abt',
  situationId: 'weird-nickname',
  transcript:
    "Okay so the project is called Phoenix, right. So we were building the new onboarding flow, three of us, and we'd been at it for like three weeks, and the demo was on Friday. And um the team was in a really good place honestly. Then on Thursday night someone ran a migration script on staging and it wiped the whole database, and also CI was failing, and our designer was out sick, so it was kind of a mess. We rebuilt everything from a backup that was six hours old, on a call, till about two in the morning. And the demo went fine. And then in standup somebody said we should call it Phoenix because it came back from the ashes, and it just stuck.",
  steps: [
    {
      "key": "and",
      "verdict": "hit",
      "note": "You clearly set the scene, explaining how \"three of us\" were building the onboarding flow before the Friday demo."
    },
    {
      "key": "but",
      "verdict": "partial",
      "note": "Instead of focusing on a single turn, you listed multiple issues like the database wipe, failing CI, and your designer being \"out sick\"."
    },
    {
      "key": "therefore",
      "verdict": "hit",
      "note": "You showed how rebuilding from a backup led to a good demo and inspired the nickname \"Phoenix\" in standup."
    }
  ],
  feedback_line:
    "You told a great origin story for the project name Phoenix, but you piled on several problems at once on Thursday night instead of focusing on one clear turn.",
  retelling: [
    {
      "step": "and",
      "text": "Three of us were building the new onboarding flow, and after three weeks of work, the demo was on Friday with the team in a really good place."
    },
    {
      "step": "but",
      "text": "But on Thursday night, someone ran a migration script on staging and it wiped the whole database."
    },
    {
      "step": "therefore",
      "text": "Therefore, we stayed on a call until about two in the morning and rebuilt everything from a six-hour-old backup. The demo went fine, and in standup somebody said we should call it Phoenix because it came back from the ashes."
    }
  ],
  provenance: { generated: '2026-10-12', prompt_version: "framework-2026-10-11", model: "gemini-3.6-flash" },
}
