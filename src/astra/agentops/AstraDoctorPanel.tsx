export function AstraDoctorPanel({ reportReady = false }: { reportReady?: boolean }) {
  return (
    <section aria-label="Astra Doctor" className="rounded border border-slate-800 bg-slate-950 p-3 text-slate-100">
      <h2 className="text-sm font-semibold">Astra Doctor</h2>
      <p className="mt-2 text-xs text-slate-400">{reportReady ? "Health report loaded." : "No health report yet"}</p>
    </section>
  );
}
