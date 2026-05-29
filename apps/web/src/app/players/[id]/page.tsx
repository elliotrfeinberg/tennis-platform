import { notFound } from "next/navigation";
import { Profile, type ProfileData, type ProfileLogRow } from "@/components/mm/screens/Profile";
import { findPlayer, confidenceFromMatches } from "@/lib/players";
import type { Named } from "@/lib/demo";
import type { ChartPoint } from "@/components/mm/RatingChart";

const SECTION = "USTA / NorCal";
const isoDate = (d: Date | null): string =>
  d ? new Date(d).toISOString().slice(0, 10) : "";

export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const p = await findPlayer(id);
  if (!p) notFound();

  const band = p.latestNtrp;
  // Band window for the chart: the published band, else a window around perf.
  const ceil =
    band ?? (p.perf != null ? Math.ceil(p.perf * 2) / 2 : 3.5);
  const bandLow = ceil - 0.5;
  const bandHigh = ceil;
  const midpoint = ceil - 0.25;

  const log: ProfileLogRow[] = p.matchLog.map((m) => ({
    date: isoDate(m.playedOn),
    cat: m.category,
    kind: m.kind,
    line: m.line,
    opp: m.opponents.map((o) => [o.name, o.rating ?? 0] as Named),
    oppTeam: m.opponentTeam,
    partner: m.partners[0]
      ? ([m.partners[0].name, m.partners[0].rating ?? 0] as Named)
      : undefined,
    won: m.won,
    sets: m.sets.map((s) => [s.player, s.opponent] as [number, number]),
    perf: m.perf,
    post: m.postRating,
  }));

  const series: ChartPoint[] = p.matchLog
    .filter((m) => m.affectsRating && m.postRating != null && m.playedOn)
    .map((m) => ({
      date: isoDate(m.playedOn),
      post: m.postRating!,
      won: m.won,
      kind: m.kind,
      line: m.line,
      opp: m.opponents.map((o) => [o.name, o.rating ?? 0] as Named),
      partner: m.partners[0]
        ? ([m.partners[0].name, m.partners[0].rating ?? 0] as Named)
        : undefined,
      sets: m.sets.map((s) => [s.player, s.opponent] as [number, number]),
    }));

  // Record (courts won) across the full match log.
  const w = p.matchLog.filter((m) => m.won).length;
  const l = p.matchLog.length - w;

  // 30-day trend from the rating series: latest post vs the post ~30 days prior.
  let trend30: number | null = null;
  if (series.length >= 2) {
    const last = series[series.length - 1]!;
    const lastT = new Date(last.date).getTime();
    const cutoff = lastT - 30 * 24 * 3600 * 1000;
    const prior = [...series].reverse().find((s) => new Date(s.date).getTime() <= cutoff);
    const base = prior ?? series[0]!;
    trend30 = Math.round((last.post - base.post) * 100) / 100;
  }

  const matches =
    (p.perfFull?.adultMatches ?? 0) +
    (p.perfFull?.mixedMatches ?? 0) +
    (p.perfFull?.otherMatches ?? 0);

  const data: ProfileData = {
    name: p.name,
    gender: p.gender,
    memberId: p.memberId,
    section: SECTION,
    homeTeam: p.matchLog.length ? `${p.matchLog.length} courts logged` : "—",
    band,
    bandLow,
    bandHigh,
    midpoint,
    perf: p.perfFull?.display ?? p.perf,
    adult: p.perfFull?.adult ?? null,
    mixed: p.perfFull?.mixed ?? null,
    adultMatches: p.perfFull?.adultMatches ?? 0,
    mixedMatches: p.perfFull?.mixedMatches ?? 0,
    record: { w, l },
    trend30,
    confidence: confidenceFromMatches(matches),
    rankLabel: "—",
    series,
    log,
    bands: p.bands.map((b) => ({ year: b.year, ntrp: b.ntrp, type: b.ratingType })),
  };

  return <Profile data={data} />;
}
