// Nurse Scheduling — weekly shift roster grid (nurses × days), click-to-cycle
// shifts, per-nurse ward assignment, clash detection (back-to-back Night→Morning,
// duplicate nurse rows), today's on-duty list, and Attendance cross-check
// (on-duty but not clocked-in → flag).

import { useMemo, useState } from "react";
import { AlertTriangle, CalendarClock, CheckCircle2, ClipboardList, Moon, RefreshCw, Sun, Sunset } from "lucide-react";
import { toast } from "sonner";
import { Badge, GlassCard, SectionTitle } from "@/components/ui";
import { useStore } from "@/lib/store";
import { cn } from "@/lib/utils";
import type { ShiftCode } from "@/lib/types";

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const CYCLE: ShiftCode[] = ["M", "E", "N", "Off"];
const SHIFT_STYLE: Record<ShiftCode, string> = {
  M: "bg-cyan-400/15 text-cyan-300 border-cyan-400/40",
  E: "bg-violet-400/15 text-violet-300 border-violet-400/40",
  N: "bg-indigo-400/15 text-indigo-300 border-indigo-400/40",
  Off: "bg-white/[0.03] text-slate-600 border-white/10",
};
const SHIFT_LABEL: Record<ShiftCode, string> = { M: "Morning 7–3", E: "Evening 3–11", N: "Night 11–7", Off: "Off" };
const WARDS = ["General Ward", "Semi-private", "ICU step-down"];

const todayIdx = () => (new Date().getDay() + 6) % 7; // 0 = Monday

export function Nursing() {
  const { shifts, setShifts, attendance, logAudit } = useStore();
  const nurses = useMemo(() => [...new Set(shifts.map((s) => s.nurseName))], [shifts]);
  const [swapMode, setSwapMode] = useState(false);
  const [swapPick, setSwapPick] = useState<{ nurse: string; day: number } | null>(null);

  const cell = (nurse: string, day: number) => shifts.find((s) => s.nurseName === nurse && s.day === day);

  const setCell = (nurse: string, day: number, patch: Partial<{ shift: ShiftCode; ward: string }>) =>
    setShifts(shifts.map((s) => (s.nurseName === nurse && s.day === day ? { ...s, ...patch } : s)));

  const cycleShift = (nurse: string, day: number) => {
    if (swapMode) {
      if (!swapPick) {
        setSwapPick({ nurse, day });
        toast.info("Swap source picked — now click the target cell");
        return;
      }
      if (swapPick.nurse === nurse && swapPick.day === day) {
        setSwapPick(null);
        return;
      }
      const a = cell(swapPick.nurse, swapPick.day);
      const b = cell(nurse, day);
      if (a && b) {
        setShifts(
          shifts.map((s) => {
            if (s.id === a.id) return { ...s, shift: b.shift, ward: b.ward };
            if (s.id === b.id) return { ...s, shift: a.shift, ward: a.ward };
            return s;
          })
        );
        logAudit("Shift swap", `${swapPick.nurse} ${DAYS[swapPick.day]} ⇄ ${nurse} ${DAYS[day]}`, "Roster Desk");
        toast.success("Shifts swapped", { description: `${swapPick.nurse} (${DAYS[swapPick.day]}) ⇄ ${nurse} (${DAYS[day]})` });
      }
      setSwapPick(null);
      setSwapMode(false);
      return;
    }
    const c = cell(nurse, day);
    if (!c) return;
    const next = CYCLE[(CYCLE.indexOf(c.shift) + 1) % CYCLE.length];
    setCell(nurse, day, { shift: next });
  };

  const setWardAllWeek = (nurse: string, ward: string) => {
    setShifts(shifts.map((s) => (s.nurseName === nurse ? { ...s, ward } : s)));
  };

  /* clash detection */
  const clashes = useMemo(() => {
    const out: string[] = [];
    const counts = nurses.map((n) => ({ n, c: shifts.filter((s) => s.nurseName === n).length }));
    counts.filter((x) => x.c > 7).forEach((x) => out.push(`${x.n} appears on more than one roster row — double-booked`));
    nurses.forEach((n) => {
      for (let d = 1; d < 7; d++) {
        const prev = cell(n, d - 1)?.shift;
        const cur = cell(n, d)?.shift;
        if (prev === "N" && cur === "M") out.push(`${n}: Night→Morning back-to-back (${DAYS[d - 1]}→${DAYS[d]}) — fatigue risk`);
      }
    });
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shifts, nurses]);

  /* today's on-duty + attendance cross-check */
  const ti = todayIdx();
  const onDuty = nurses
    .map((n) => ({ nurse: n, cell: cell(n, ti) }))
    .filter((x) => x.cell && x.cell.shift !== "Off") as { nurse: string; cell: NonNullable<ReturnType<typeof cell>> }[];
  const clockedIn = new Set(attendance.map((a) => a.staffName));
  const missing = onDuty.filter((x) => !clockedIn.has(x.nurse));

  return (
    <div className="space-y-4">
      {/* today's duty */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <GlassCard className="xl:col-span-2">
          <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
            <SectionTitle title={`On Duty Today (${DAYS[ti]})`} subtitle="Feeds the Ward module duty context" />
            <Badge tone="cyan" className="!text-[9px]"><CalendarClock size={10} className="mr-1" /> {onDuty.length} nurses</Badge>
          </div>
          <div className="flex gap-2 flex-wrap">
            {onDuty.map(({ nurse, cell: c }) => (
              <div key={nurse} className={cn("rounded-lg border px-3 py-2 text-xs", SHIFT_STYLE[c.shift])}>
                <p className="font-semibold">{nurse}</p>
                <p className="text-[10px] opacity-80">{SHIFT_LABEL[c.shift]} · {c.ward}</p>
              </div>
            ))}
            {onDuty.length === 0 && <p className="text-xs text-slate-500">Nobody rostered today — check the grid below.</p>}
          </div>
          {missing.length > 0 && (
            <div className="rounded-lg border border-amber-400/40 bg-amber-400/10 px-3 py-2.5 mt-3 flex items-start gap-2.5">
              <AlertTriangle size={15} className="text-amber-300 shrink-0 mt-0.5" />
              <p className="text-[11px] text-amber-200">
                <span className="font-semibold">Roster vs Attendance:</span> {missing.map((m) => m.nurse).join(", ")} — on-duty but not
                clocked-in yet. See Attendance tab.
              </p>
            </div>
          )}
        </GlassCard>

        <GlassCard>
          <SectionTitle title="Clash Detection" subtitle="Auto-scanned on every change" />
          {clashes.length === 0 ? (
            <p className="text-xs text-emerald-300 flex items-center gap-1.5"><CheckCircle2 size={13} /> No clashes — roster is clean.</p>
          ) : (
            <div className="space-y-1.5">
              {clashes.map((c, i) => (
                <p key={i} className="text-[11px] text-red-300 flex items-start gap-1.5"><AlertTriangle size={12} className="shrink-0 mt-0.5" /> {c}</p>
              ))}
            </div>
          )}
          <button
            className={cn("btn-ghost !text-[11px] w-full mt-3", swapMode && "!border-cyan-400/60 !text-cyan-300")}
            onClick={() => { setSwapMode((s) => !s); setSwapPick(null); }}
          >
            <RefreshCw size={12} /> {swapMode ? "Swap mode ON — click two cells" : "Enable swap mode"}
          </button>
        </GlassCard>
      </div>

      {/* roster grid */}
      <GlassCard>
        <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
          <SectionTitle title="Weekly Roster" subtitle="Click a cell to cycle Morning → Evening → Night → Off" />
          <div className="flex items-center gap-2 text-[10px] text-slate-500">
            <span className="flex items-center gap-1"><Sun size={10} className="text-cyan-300" /> M</span>
            <span className="flex items-center gap-1"><Sunset size={10} className="text-violet-300" /> E</span>
            <span className="flex items-center gap-1"><Moon size={10} className="text-indigo-300" /> N</span>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs min-w-[760px]">
            <thead>
              <tr className="text-left text-slate-500 border-b border-white/10">
                <th className="pb-2 font-medium w-40">Nurse</th>
                <th className="pb-2 font-medium w-44">Ward (all week)</th>
                {DAYS.map((d, i) => (
                  <th key={d} className={cn("pb-2 font-medium text-center", i === ti && "text-yellow-300")}>{d}{i === ti ? " •" : ""}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {nurses.map((n) => (
                <tr key={n} className="border-b border-white/5">
                  <td className="py-2 pr-2 text-white font-medium flex items-center gap-1.5">
                    <ClipboardList size={12} className="text-slate-500" /> {n}
                  </td>
                  <td className="py-2 pr-2">
                    <select className="input-dark !py-1 !text-[10px] !w-full" value={cell(n, 0)?.ward ?? WARDS[0]} onChange={(e) => setWardAllWeek(n, e.target.value)}>
                      {WARDS.map((w) => <option key={w}>{w}</option>)}
                    </select>
                  </td>
                  {DAYS.map((_, d) => {
                    const c = cell(n, d);
                    const picked = swapPick?.nurse === n && swapPick?.day === d;
                    return (
                      <td key={d} className="py-2 px-0.5 text-center">
                        <button
                          onClick={() => cycleShift(n, d)}
                          className={cn(
                            "w-full rounded-md border px-1 py-1.5 text-[10px] font-bold transition-all",
                            SHIFT_STYLE[c?.shift ?? "Off"],
                            d === ti && "ring-1 ring-yellow-400/40",
                            picked && "ring-2 ring-cyan-400 scale-105"
                          )}
                          title={c ? `${SHIFT_LABEL[c.shift]} · ${c.ward}` : "—"}
                        >
                          {c?.shift ?? "—"}
                        </button>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-[10px] text-slate-600 mt-3">
          Roster persists locally. Swap mode exchanges two cells (shift + ward). On-duty-but-not-clocked-in flags come from the Attendance ledger.
        </p>
      </GlassCard>
    </div>
  );
}
