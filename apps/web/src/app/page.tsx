import Link from "next/link";

export default function Home() {
  return (
    <div className="space-y-12">
      <section className="space-y-4 py-8">
        <h1 className="text-4xl font-bold tracking-tight">
          Your tennis rating. Updated daily.
        </h1>
        <p className="max-w-2xl text-lg text-stone-600">
          Estimated dynamic NTRP ratings, refreshed every day from USTA
          tennislink match data. Plus captain tools: lineup optimization and
          per-court win probability — see exactly why a lineup is favored
          before you submit it.
        </p>
        <div className="flex gap-3 pt-2">
          <Link
            href="/players"
            className="rounded-lg bg-court-700 px-5 py-2.5 font-medium text-white hover:bg-court-900"
          >
            Find a player
          </Link>
          <Link
            href="/captain"
            className="rounded-lg border border-stone-300 px-5 py-2.5 font-medium hover:bg-stone-100"
          >
            Captain tools →
          </Link>
        </div>
      </section>

      <section className="grid gap-6 md:grid-cols-3">
        <FeatureCard
          title="Daily updates"
          body="Match scores hit tennislink within hours; we refresh ratings every night, not once a month. See how today's match moved your number."
        />
        <FeatureCard
          title="Lineup optimizer"
          body="Drop in your roster, the opponent's roster, and we'll find the lineup that maximizes your team's win probability — not just sum of court odds."
        />
        <FeatureCard
          title="Confidence intervals"
          body="Glicko-2 rating deviation means new and inactive players show as 'low confidence'. No more single-number lies."
        />
      </section>

      <section className="rounded-lg border border-stone-200 bg-white p-6">
        <h2 className="text-xl font-semibold">How accurate is this?</h2>
        <p className="mt-3 text-stone-600">
          The USTA's algorithm is proprietary and we don't have access to it.
          Our model is a Glicko-2 rating, fit per-set, calibrated against
          published year-end NTRP levels using 2-3 years of historical
          tennislink data. We agree with USTA's year-end up/down/same
          decision roughly 85% of the time on backtests — about the same as
          other estimators in the wild.
        </p>
      </section>
    </div>
  );
}

function FeatureCard({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-lg border border-stone-200 bg-white p-5">
      <h3 className="font-semibold">{title}</h3>
      <p className="mt-2 text-sm text-stone-600">{body}</p>
    </div>
  );
}
