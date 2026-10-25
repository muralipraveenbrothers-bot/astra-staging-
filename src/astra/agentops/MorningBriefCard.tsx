export function MorningBriefCard({ lines = [] }: { lines?: string[] }) {
  return (
    <section aria-label="Morning Command Brief" className="rounded border border-slate-800 bg-slate-950 p-3 text-slate-100">
      <h2 className="text-sm font-semibold">Morning Command Brief</h2>
      {lines.length ? <ul className="mt-2 text-xs">{lines.map((line) => <li key={line}>{line}</li>)}</ul> : <p className="mt-2 text-xs text-slate-400">none</p>}
    </section>
  );
}
