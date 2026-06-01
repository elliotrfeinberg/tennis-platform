"use client";
// Collapsible "how these odds work" note, shared by the desktop + mobile
// Captain screens. Explains the calibrated win-probability model in plain terms.

export function OddsExplainer() {
  return (
    <details className="mm-card" style={{ padding: "12px 16px", fontSize: 13, color: "var(--ink-2)" }}>
      <summary style={{ cursor: "pointer", fontWeight: 700, color: "var(--ink)", listStyle: "none", display: "flex", alignItems: "center", gap: 7 }}>
        <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 17, height: 17, borderRadius: "50%", background: "var(--court)", color: "#fff", fontSize: 11, fontWeight: 800 }}>i</span>
        How these odds work
      </summary>
      <div style={{ marginTop: 10, lineHeight: 1.6, display: "flex", flexDirection: "column", gap: 7 }}>
        <p style={{ margin: 0 }}>
          Each court&apos;s win chance comes from the <strong>rating gap</strong> between the two
          sides, run through a logistic curve <em>calibrated on 68,000 past
          NorCal matches</em> — not a guess. A <strong>+0.5</strong> rating edge wins about{" "}
          <strong>89%</strong> in singles and <strong>93%</strong> in doubles.
        </p>
        <p style={{ margin: 0 }}>
          Singles courts use each player&apos;s <strong>singles</strong> rating and doubles courts
          their <strong>doubles</strong> rating (tracked separately — many players are far
          better at one). A player with only a few matches in that discipline is
          pulled toward a coin flip until their rating settles.
        </p>
        <p style={{ margin: 0 }}>
          The <strong>team win probability</strong> is the chance of winning enough court{" "}
          <strong>points</strong> to clinch — courts worth 2 points (e.g. 40 &amp; Over D1) count
          double, so the math reflects the league&apos;s real scoring, not just a court count.
        </p>
      </div>
    </details>
  );
}
