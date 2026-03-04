"use client";

import type { AggregateMetrics } from "@/lib/api";

interface MetricsCardProps {
  metrics: AggregateMetrics;
  vertical?: boolean;
}

export default function MetricsCard({ metrics, vertical = false }: MetricsCardProps) {
  const rows = [
    { label: "Días", value: String(metrics.total_days ?? 0) },
    { label: "Trades", value: String(metrics.total_trades ?? 0) },
    { label: "Win Rate", value: `${(metrics.win_rate_pct ?? 0).toFixed(1)}%` },
    { label: "Profit Factor", value: (metrics.avg_profit_factor ?? 0).toFixed(3) },
    { label: "Total Return", value: `${(metrics.total_return_pct ?? 0).toFixed(2)}%` },
    { label: "Avg MAE", value: `$${(metrics.avg_mae ?? 0).toFixed(2)}` },
    { label: "Avg Return/Día", value: `${(metrics.avg_return_per_day_pct ?? 0).toFixed(3)}%` },
    { label: "Avg R/Día", value: `${(metrics.avg_r_per_day ?? 0).toFixed(3)}R` },
    { label: "Sharpe", value: (metrics.avg_sharpe ?? 0).toFixed(3) },
    { label: "Sortino", value: (metrics.sortino_ratio ?? 0).toFixed(3) },
    { label: "Calmar", value: (metrics.calmar_ratio ?? 0).toFixed(3) },
    { label: "R²", value: (metrics.r_squared ?? 0).toFixed(4) },
    { label: "DD/Return", value: (metrics.dd_return_ratio ?? 0).toFixed(3) },
    { label: "Max DD", value: `${(metrics.avg_max_dd_pct ?? 0).toFixed(2)}%` },
    { label: "Max Consec. Wins", value: String(metrics.max_consecutive_wins ?? 0) },
    { label: "Max Consec. Losses", value: String(metrics.max_consecutive_losses ?? 0) },
  ];

  if (vertical) {
    return (
      <div className="bg-white rounded border border-gray-300 shadow-sm overflow-hidden">
        <div className="bg-gray-50 border-b border-gray-300 px-3 py-1.5">
          <h2 className="text-[11px] font-bold uppercase tracking-wider text-gray-600">
            Resultados Agregados
          </h2>
        </div>
        <div className="grid grid-cols-2 divide-x divide-y divide-gray-200">
          {rows.map((row, idx) => (
            <div key={idx} className="flex flex-col justify-center px-2.5 py-1.5 bg-white hover:bg-gray-50 transition-colors">
              <span className="text-[8px] font-semibold text-gray-400 uppercase tracking-tighter leading-tight">
                {row.label}
              </span>
              <span className="text-[12px] font-bold font-mono text-gray-800">
                {row.value}
              </span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded border border-gray-300 shadow-sm overflow-hidden">
      <div className="bg-gray-50 border-b border-gray-300 px-3 py-1.5">
        <h2 className="text-[11px] font-bold uppercase tracking-wider text-gray-600">
          Resultados Agregados
        </h2>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 divide-x divide-y divide-gray-200 border-b border-gray-200">
        {rows.map((row, idx) => (
          <div key={idx} className="flex flex-col p-2 bg-white hover:bg-gray-50 transition-colors">
            <span className="text-[9px] font-semibold text-gray-400 uppercase tracking-tighter mb-0.5">
              {row.label}
            </span>
            <span className="text-xs font-bold font-mono text-gray-800">
              {row.value}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
