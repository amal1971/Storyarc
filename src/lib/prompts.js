export const PROMPTS = [
  { id: 'plan-fell-apart', emoji: '🫠', text: 'A time a plan completely fell apart' },
  { id: 'small-win', emoji: '🏆', text: 'A small win nobody noticed' },
  { id: 'stranger', emoji: '👋', text: 'A stranger who surprised you' },
  { id: 'nervous', emoji: '😬', text: 'The most nervous you’ve been in the past year' },
  { id: 'changed-mind', emoji: '🔄', text: 'Something you changed your mind about' },
]

export const OWN_STORY = { id: 'own-story', emoji: '✨', text: 'Tell your own story' }

// Canned, pre-analyzed sample shown on the start screen (cold-start value).
export const SAMPLE = {
  title: 'Sample: “A time a plan completely fell apart”',
  transcript:
    'So, um, last spring we planned this big product launch for a Tuesday morning. I mean, we had the emails scheduled, the demo ready, basically everything lined up. Then, uh, an hour before go-live the payment sandbox just died. You know, completely dead, no error message, nothing. We were sort of staring at each other in the standup call. So we split up — I rewrote the demo to skip checkout while my teammate, um, called the vendor. We shipped forty minutes late, but the demo actually landed better without the checkout part, and we kept that version for good.',
  fillerTokens: ['um', 'i mean', 'basically', 'uh', 'you know', 'sort of'],
  fillerEvents: 7,
  wordCount: 107,
  fillerRate: 6.5,
  feedbackLine:
    'You set the scene fast and the dead sandbox is real trouble — and because you told us what happened after (shipped late, kept the better demo), the story actually lands.',
  suggestedFix:
    'Try naming the stakes in one line up front — what would have happened if the launch slipped a whole day?',
}
