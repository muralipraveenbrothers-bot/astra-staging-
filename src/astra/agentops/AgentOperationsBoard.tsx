import { boardColumns, emptyBoardCopy, type BoardCard } from "./viewModel";

export function AgentOperationsBoard({ tasks = [] }: { tasks?: BoardCard[] }) {
  const empty = emptyBoardCopy(tasks);
  const columns = boardColumns(tasks);
  return (
    <section aria-label="Agent Operations Board" className="rounded border border-slate-800 bg-slate-950 p-3 text-slate-100">
      <h2 className="text-sm font-semibold">Agent Operations</h2>
      {empty ? <p className="mt-2 text-xs text-slate-400">{empty}</p> : (
        <div className="mt-2 grid gap-2 md:grid-cols-5">
          {columns.map((column) => (
            <div key={column.status}>
              <h3 className="text-[10px] uppercase tracking-wide text-slate-400">{column.status}</h3>
              {column.cards.map((card) => (
                <article key={card.taskId} className="mt-1 rounded border border-slate-800 p-2 text-xs">
                  <p className="font-semibold">{card.title}</p>
                  <p>{card.initiator} · {card.module}</p>
                </article>
              ))}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
