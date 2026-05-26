export default function PlayersPage() {
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Players</h1>
      <p className="text-stone-600">
        Player search — wire to db queries in v1. For now, see the captain
        workspace for a working lineup demo.
      </p>
      <div className="rounded-lg border border-dashed border-stone-300 bg-white p-8 text-center text-stone-500">
        Coming soon: search by name, section, NTRP level. Profile pages with
        rating history charts and match-by-match deltas.
      </div>
    </div>
  );
}
