// "How it's built" — the engineering that is otherwise invisible to a visitor,
// written for someone who has never written code. Every claim still links to
// the code that makes it true, for readers who want to check.

function code(repoUrl, path) {
  return `${repoUrl}/blob/main/${path}`
}

export function AboutScreen({ onBack, repoUrl }) {
  const sections = [
    {
      emoji: '🔒',
      title: 'It never puts words in your mouth.',
      body:
        'When StoryArc quotes your story back to you, a simple check confirms those exact words really are in what you said. If they aren’t, the quote is thrown away before you see it. The AI gets one second try first, but either way you will never see a made-up quote.',
      links: [['the quote check', 'src/lib/analyze.js'], ['the second try', 'api/analyze-structure.js']],
    },
    {
      emoji: '🧭',
      title: 'Simple rules first. AI only where it takes judgement.',
      body:
        'Obvious filler words like “um” or “kind of”, and stumbles like “we, we”, are caught by plain rules — instantly and for free. The AI is only asked about words that depend on context: “I like it” is fine, but “it was, like, huge” is a filler. If the two ever disagree, the simple rules win.',
      links: [['the filler rules', 'src/lib/fillers.js'], ['the AI’s instructions', 'api/analyze-fillers.js']],
    },
    {
      emoji: '🧪',
      title: 'If something breaks, it tells you — it never fakes it.',
      body:
        'If the transcription service or the AI is down, out of credit or busy, you get a clear “try again” message — never feedback that was made up to fill the gap. Built-in sample data only appears in demo mode, when no AI is connected at all, and it is labelled as a sample.',
      links: [['how failures are handled', 'src/lib/analyze.js'], ['the error screens', 'src/components/ProcessingScreen.jsx']],
    },
    {
      emoji: '🔁',
      title: 'It checks whether its own advice worked.',
      body:
        'Your second telling isn’t judged on its own. The AI reads both tellings side by side, together with the exact tip it gave you after the first one, and says plainly whether you used it — including “not this round”. Then it points to what actually changed, in your own words.',
      links: [['the comparison', 'api/compare-attempts.js']],
    },
    {
      emoji: '🎚️',
      title: 'Strict when judging, natural when writing.',
      body:
        'The filler check runs with the AI’s creativity turned all the way down, so the same story always gets the same answer. Parts that also write sentences for you — the feedback, the retelling, the comparison — get a little more freedom, so they read like a person rather than a form letter. What keeps them honest is the quote check above, not the setting.',
      links: [['the AI settings', 'api/_gemini.js']],
    },
    {
      emoji: '🧩',
      title: 'Each storytelling shape is one recipe card.',
      body:
        'And–But–Therefore, Situation–Complication–Resolution and STAR are each written down once, as a short description of their beats. The picker, the beat-by-beat verdicts, the retelling and the AI’s instructions are all built from that description — so adding a new shape is like adding a recipe, not rebuilding the kitchen.',
      links: [['the shapes', 'src/lib/frameworks.js']],
    },
  ]

  return (
    <div className="screen">
      <h2 className="screen-title">How it’s built 🔧</h2>
      <p className="screen-sub">
        What happens behind the scenes, in plain English — and the six choices that make the feedback something you can trust. Each one links to the actual code, if you’re curious.
      </p>

      <div className="card feedback-card" style={{ maxWidth: 720 }}>
        <div className="about-section">
          <h3>🎙️ What happens when you tell a story</h3>
          <ol className="about-steps">
            <li><strong>Your voice becomes text.</strong> A speech-to-text service writes down exactly what you said — including the “um”s, which most services quietly delete.</li>
            <li><strong>The text gets read twice.</strong> Simple rules spot the obvious filler words. An AI judges the tricky ones, and whether your story sets a scene, hits a problem and lands an ending.</li>
            <li><strong>Everything is checked before you see it.</strong> Any quote the AI uses must really be in your words, or it’s dropped.</li>
            <li><strong>You tell it again, and it compares.</strong> The second telling is read next to the first, to show what changed.</li>
          </ol>
        </div>

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
          <h3>🧱 What it’s made of</h3>
          <div className="about-stack">
            {['React 18', 'Vite', 'Deepgram Nova-3', 'Gemini', 'Vercel serverless', 'localStorage'].map((t) => (
              <span key={t} className="signal">{t}</span>
            ))}
          </div>
          <p style={{ marginTop: 10 }}>
            Your practice history stays in your own browser — StoryArc has no database of your stories. To analyse a telling, the recording goes to Deepgram (speech-to-text) and the text to Google’s Gemini AI; StoryArc keeps neither. You can download or delete your history any time from <em>History</em>. Signing in only exists to give everyone a fair share of time on this free demo: we store your email address, your Google account ID and how many seconds and analyses you’ve used, nothing else.
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
