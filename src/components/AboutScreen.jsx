// "How it's built" — the engineering that is otherwise invisible to a visitor.
// Every claim links to the line of code that makes it true. Plain English,
// aimed at the person deciding whether to have a conversation with the author.

function code(repoUrl, path) {
  return `${repoUrl}/blob/main/${path}`
}

export function AboutScreen({ onBack, repoUrl }) {
  const sections = [
    {
      emoji: '🔒',
      title: 'Nothing the AI says about your words is trusted until code checks it.',
      body:
        'Whenever the model quotes your story back as evidence, that quote must be a verbatim substring of your transcript — at most twelve words — verified in JavaScript after the call returns. If it isn’t, the quote is dropped and never shown. The model is retried once at a stricter setting first. You will not see a fabricated quote from this app.',
      links: [['evidenceIsValid()', 'src/lib/analyze.js'], ['the retry', 'api/analyze-structure.js']],
    },
    {
      emoji: '🧭',
      title: 'Filler detection is two-tier on purpose.',
      body:
        'A deterministic pass catches the unambiguous cases — “um”, “kind of”, back-to-back repetitions like “and we, and we” — instantly, offline, for free. The model is only asked about the contextual ones, where “like” might be a verb or a hedge. When the two disagree about the same span, the deterministic tier wins. Cheap where certainty is possible; the model only where judgment is needed.',
      links: [['fillers.js', 'src/lib/fillers.js'], ['the Tier-B prompt', 'api/analyze-fillers.js']],
    },
    {
      emoji: '🧪',
      title: 'When a service fails, the app tells you — it never fakes a result.',
      body:
        'Every analysis carries a provider tag. If transcription or any model call degrades to built-in sample data (a key is missing, a rate limit hit, the network dropped), a badge says exactly which part. A confident-looking fake result is treated as worse than an honest gap. This is also why the whole app runs with zero API keys.',
      links: [['the mock fallbacks', 'src/lib/analyze.js'], ['the badge', 'src/components/FeedbackScreen.jsx']],
    },
    {
      emoji: '🔁',
      title: 'The coach checks its own homework.',
      body:
        'Your second telling isn’t analysed in isolation. One call reads both tellings side by side together with the exact advice you were given after the first — and must say whether you acted on it, including “no”. It also names what concretely changed, in your words. That’s the difference between two report cards and a coach.',
      links: [['compare-attempts.js', 'api/compare-attempts.js']],
    },
    {
      emoji: '🌡️',
      title: 'Temperature is a design decision, not a default.',
      body:
        'Pure judgments (is there an ending? which word is a filler?) run at temperature 0. Anything that writes prose — the retelling, the comparison — runs higher, because temperature 0 literally selects the most probable, which for writing means the most generic. Honesty comes from the substring checks above, not from a low temperature.',
      links: [['_gemini.js', 'api/_gemini.js']],
    },
    {
      emoji: '🧩',
      title: 'Frameworks are data, not code.',
      body:
        'ABT, SCR and STAR are entries in one registry. The picker, the beat-by-beat verdicts, the retelling renderer, the offline heuristics and the model prompt all generate themselves from that entry. Adding a fourth framework is a content change.',
      links: [['frameworks.js', 'src/lib/frameworks.js']],
    },
  ]

  return (
    <div className="screen">
      <h2 className="screen-title">How it’s built 🔧</h2>
      <p className="screen-sub">
        Six decisions that make the feedback trustworthy rather than merely plausible. Each one links to the code.
      </p>

      <div className="card feedback-card" style={{ maxWidth: 720 }}>
        {sections.map((s) => (
          <div key={s.title} className="about-section">
            <h3>{s.emoji} {s.title}</h3>
            <p>{s.body}</p>
            <p>
              {s.links.map(([label, path], i) => (
                <span key={path}>
                  {i > 0 && ' · '}
                  <a className="link-btn" href={code(repoUrl, path)} target="_blank" rel="noopener noreferrer">{label} ↗</a>
                </span>
              ))}
            </p>
          </div>
        ))}

        <div className="about-section">
          <h3>🧱 Stack</h3>
          <div className="about-stack">
            {['React 18', 'Vite', 'Deepgram Nova-3', 'Gemini', 'Vercel serverless', 'localStorage'].map((t) => (
              <span key={t} className="signal">{t}</span>
            ))}
          </div>
          <p style={{ marginTop: 10 }}>
            Local-first by design: your practice data is never synced or stored on a server. To analyse a telling, the audio is sent to Deepgram for transcription and the text to Google Gemini; StoryArc stores neither, and your transcripts and history stay in your own browser, where you can export or clear them from <em>History</em>. Signing in exists only to meter this public demo — the server keeps your Google account id and the seconds you’ve used, nothing more.
          </p>
        </div>
      </div>

      <div className="cta-row">
        <a className="btn btn-primary" href={repoUrl} target="_blank" rel="noopener noreferrer">View the source on GitHub ↗</a>
        <button className="link-btn" onClick={onBack}>← Back</button>
      </div>
    </div>
  )
}
