"use client";

import type { AggregateMetrics } from "@/lib/api";

interface MetricsCardProps {
  metrics: AggregateMetrics;
}

function Stat({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="flex flex-col">
      <span className="text-xs text-[var(--muted)] uppercase tracking-wide">{label}</span>
      <span className={`text-lg font-semibold ${color || ""}`}>{value}</span>
    </div>
  );
}

export default function MetricsCard({ metrics }: MetricsCardProps) {
  const pnlColor = (metrics.total_pnl ?? 0) >= 0 ? "text-green-600" : "text-red-600";
  const retColor = (metrics.total_return_pct ?? 0) >= 0 ? "text-green-600" : "text-red-600";

  const rows = [
    { label: "Días", value: String(metrics.total_days ?? 0) },
    { label: "Trades", value: String(metrics.total_trades ?? 0) },
    {
      label: "Win Rate",
      value: `${(metrics.win_rate_pct ?? 0).toFixed(1)}%`,
      color: (metrics.win_rate_pct ?? 0) >= 50 ? "text-green-600" : "text-red-600"
    },
    { label: "Total Return", value: `${(metrics.total_return_pct ?? 0).toFixed(2)}%`, color: retColor },
    { label: "PnL Total", value: `$${(metrics.total_pnl ?? 0).toFixed(2)}`, color: pnlColor },
    { label: "Avg Return/Día", value: `${(metrics.avg_return_per_day_pct ?? 0).toFixed(3)}%` },
    { label: "Avg PnL/Trade", value: `$${(metrics.avg_pnl ?? 0).toFixed(2)}` },
    { label: "Avg Sharpe", value: (metrics.avg_sharpe ?? 0).toFixed(3) },
    { label: "Avg Max DD", value: `${(metrics.avg_max_dd_pct ?? 0).toFixed(2)}%`, color: "text-red-600" },
    { label: "Avg Profit Factor", value: (metrics.avg_profit_factor ?? 0).toFixed(3) },
  ];

  return (
    <div className="bg-white rounded border border-gray-300 shadow-sm overflow-hidden">
      <div className="bg-gray-50 border-b border-gray-300 px-3 py-1.5">
        <h2 className="text-[11px] font-bold uppercase tracking-wider text-gray-600">
          Resultados Agregados
        </h2>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 divide-x divide-y divide-gray-200 border-b border-gray-200">
        {rows.map((row, idx) => (
          <div key={idx} className="flex flex-col p-2 bg-white hover:bg-gray-50 transition-colors">
            <span className="text-[9px] font-semibold text-gray-400 uppercase tracking-tighter mb-0.5">
              {row.label}
            </span>
            <span className={`text-xs font-bold font-mono ${row.color || "text-gray-800"}`}>
              {row.value}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
