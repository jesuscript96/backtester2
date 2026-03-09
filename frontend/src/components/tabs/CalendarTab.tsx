"use client";

import { useMemo, useState } from "react";
import type { DayResult, TradeRecord } from "@/lib/api";

interface CalendarTabProps {
  dayResults: DayResult[];
  trades: TradeRecord[];
  isDarkMode?: boolean;
}

const WEEKDAY_LABELS = ["Lun", "Mar", "Mie", "Jue", "Vie", "Sab", "Dom"];

function pnlColor(pnl: number, maxAbs: number): string {
  if (maxAbs === 0) return "transparent";
  const intensity = Math.min(Math.abs(pnl) / maxAbs, 1);
  if (pnl > 0) return `rgba(16,185,129,${0.15 + intensity * 0.5})`;
  if (pnl < 0) return `rgba(239,68,68,${0.15 + intensity * 0.5})`;
  return "rgba(148,163,184,0.1)";
}

export default function CalendarTab({ dayResults, trades, isDarkMode = false }: CalendarTabProps) {
  const pnlByDate = useMemo(() => {
    const map = new Map<string, number>();
    for (const t of trades) {
      if (!t.date) continue;
      map.set(t.date, (map.get(t.date) || 0) + t.pnl);
    }
    return map;
  }, [trades]);

  const months = useMemo(() => {
    const set = new Set<string>();
    for (const dr of dayResults) {
      set.add(dr.date.slice(0, 7));
    }
    return Array.from(set).sort();
  }, [dayResults]);

  const maxAbsPnl = useMemo(() => {
    const values = Array.from(pnlByDate.values());
    return values.length ? Math.max(...values.map(Math.abs), 1) : 1;
  }, [pnlByDate]);

  if (!dayResults.length) {
    return <p className="text-sm text-[var(--muted)]">Sin resultados</p>;
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
      {months.map((monthStr) => {
        const [year, month] = monthStr.split("-").map(Number);
        const firstDay = new Date(year, month - 1, 1);
        const lastDay = new Date(year, month, 0);
        const startWeekday = (firstDay.getDay() + 6) % 7;

        const monthName = new Date(year, month - 1, 1).toLocaleString("es-ES", { month: "long", year: "numeric" });

        const days: (null | { date: string; pnl: number | null })[] = [];
        for (let i = 0; i < startWeekday; i++) days.push(null);
        for (let d = 1; d <= lastDay.getDate(); d++) {
          const dateStr = `${year}-${String(month).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
          const pnl = pnlByDate.get(dateStr) ?? null;
          days.push({ date: dateStr, pnl });
        }

        return (
          <div key={monthStr} className="bg-[var(--card-bg)] rounded-lg border border-[var(--border)] p-3 shadow-sm transition-colors">
            <h4 className="text-[11px] font-bold text-[var(--foreground)] mb-2 uppercase tracking-tight text-center border-b border-[var(--border)] pb-1">
              {monthName}
            </h4>
            <div className="grid grid-cols-7 gap-1">
              {["L", "M", "X", "J", "V", "S", "D"].map((l) => (
                <div key={l} className="text-[9px] font-bold text-[var(--muted)] text-center mb-1">
                  {l}
                </div>
              ))}
              {days.map((day, i) => {
                if (!day) return <div key={`empty-${i}`} className="aspect-square" />;
                const dayNum = parseInt(day.date.split("-")[2]);
                const hasPnl = day.pnl !== null;

                return (
                  <div
                    key={day.date}
                    className="aspect-square rounded-[3px] flex items-center justify-center text-[8px] border border-[var(--border)] flex-col leading-none transition-colors"
                    title={hasPnl ? `${day.date}: $${day.pnl?.toFixed(2)}` : day.date}
                    style={{
                      backgroundColor: hasPnl ? pnlColor(day.pnl!, maxAbsPnl) : "transparent",
                    }}
                  >
                    <span className={`font-bold ${hasPnl ? "text-[var(--foreground)]" : "text-[var(--muted)] opacity-30"}`}>
                      {dayNum}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
