"use client";

import { useMemo } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
  ReferenceLine,
} from "recharts";
import type { TradeRecord } from "@/lib/api";
import RollingEVChart from "@/components/RollingEVChart";

interface ChartsTabProps {
  trades: TradeRecord[];
  riskR?: number;
  isDarkMode?: boolean;
}

const WEEKDAY_NAMES = ["Lun", "Mar", "Mie", "Jue", "Vie"];

export default function ChartsTab({ trades, riskR = 100, isDarkMode = false }: ChartsTabProps) {
  const rHistogram = useMemo(() => {
    const rValues = trades
      .map((t) => t.r_multiple)
      .filter((r): r is number => r !== null);
    if (!rValues.length) return [];

    const bucketSize = 0.5;
    const min = Math.floor(Math.min(...rValues) / bucketSize) * bucketSize;
    const max = Math.ceil(Math.max(...rValues) / bucketSize) * bucketSize;
    const buckets = new Map<number, number>();

    for (let b = min; b <= max; b += bucketSize) {
      buckets.set(parseFloat(b.toFixed(1)), 0);
    }

    for (const r of rValues) {
      const bucket = parseFloat(
        (Math.floor(r / bucketSize) * bucketSize).toFixed(1)
      );
      buckets.set(bucket, (buckets.get(bucket) || 0) + 1);
    }

    return Array.from(buckets.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([r, count]) => ({ r: `${r}R`, value: count, rNum: r }));
  }, [trades]);

  const pnlDistribution = useMemo(() => {
    const pnlPctCoords = trades.map(t => t.return_pct).filter((v): v is number => v !== undefined && v !== null);
    if (!pnlPctCoords.length) return { data: [], stats: null };

    const minPnl = Math.min(...pnlPctCoords);
    const maxPnl = Math.max(...pnlPctCoords);
    const range = Math.max(0.1, maxPnl - minPnl);

    const roughBucket = range / 20;
    const steps = [0.1, 0.25, 0.5, 1, 2, 5, 10, 20, 50, 100];
    let bucketSize = steps[0];
    for (const s of steps) {
      if (roughBucket <= s) {
        bucketSize = s;
        break;
      }
    }
    if (roughBucket > steps[steps.length - 1]) bucketSize = steps[steps.length - 1];

    const minBucket = Math.floor(minPnl / bucketSize) * bucketSize;
    const maxBucket = Math.ceil(maxPnl / bucketSize) * bucketSize;

    const buckets = new Map<number, number>();
    for (let b = minBucket; b <= maxBucket + bucketSize / 2; b += bucketSize) {
      buckets.set(parseFloat(b.toFixed(2)), 0);
    }

    for (const p of pnlPctCoords) {
      const bucket = parseFloat((Math.floor(p / bucketSize) * bucketSize).toFixed(2));
      if (buckets.has(bucket)) {
        buckets.set(bucket, buckets.get(bucket)! + 1);
      }
    }

    const data = Array.from(buckets.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([val, count]) => ({
        label: `${val > 0 ? '+' : ''}${val}%`,
        value: count,
        num: val
      }));

    const n = pnlPctCoords.length;
    const mean = pnlPctCoords.reduce((s, v) => s + v, 0) / n;
    const variance = pnlPctCoords.reduce((s, v) => s + Math.pow(v - mean, 2), 0) / n;
    const stdDev = Math.sqrt(variance);

    return { data, stats: { mean, stdDev, n } };
  }, [trades]);

  const evByHour = useMemo(() => {
    const hourMap = new Map<number, { total: number; count: number }>();
    for (const t of trades) {
      const h = t.entry_hour;
      if (!hourMap.has(h)) hourMap.set(h, { total: 0, count: 0 });
      const m = hourMap.get(h)!;
      m.total += t.pnl;
      m.count++;
    }
    return Array.from(hourMap.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([hour, data]) => ({
        hour: `${hour}:00`,
        ev: data.count > 0 ? data.total / data.count : 0,
        count: data.count,
      }));
  }, [trades]);

  const evByDay = useMemo(() => {
    const dayMap = new Map<number, { total: number; count: number }>();
    for (const t of trades) {
      const d = t.entry_weekday;
      if (d > 4) continue;
      if (!dayMap.has(d)) dayMap.set(d, { total: 0, count: 0 });
      const m = dayMap.get(d)!;
      m.total += t.pnl;
      m.count++;
    }
    return [0, 1, 2, 3, 4].map((d) => {
      const data = dayMap.get(d) || { total: 0, count: 0 };
      return {
        day: WEEKDAY_NAMES[d],
        ev: data.count > 0 ? data.total / data.count : 0,
        count: data.count,
      };
    });
  }, [trades]);

  if (!trades.length) {
    return <p className="text-sm text-[var(--muted)]">Sin trades para analizar</p>;
  }

  return (
    <div className="space-y-8">

      {/* 1. Rolling EV Chart (Moved from Main Page) */}
      <div className="h-64">
        <RollingEVChart trades={trades} riskR={riskR} isDarkMode={isDarkMode} />
      </div>

      {/* 2. PnL Gaussian Distribution */}
      {pnlDistribution.data.length > 0 && pnlDistribution.stats && (
        <div className="bg-[var(--card-bg)] rounded border border-[var(--border)] p-4 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-[var(--muted)] uppercase tracking-wide">
              Distribución de Resultados PnL (%)
            </h3>
            <div className="flex gap-4 text-xs">
              <span className="text-[var(--foreground)]"><span className="text-[var(--muted)]">Media:</span> {pnlDistribution.stats.mean.toFixed(2)}%</span>
              <span className="text-[var(--foreground)]"><span className="text-[var(--muted)]">Desv Std (σ):</span> {pnlDistribution.stats.stdDev.toFixed(2)}%</span>
              <span className="text-[var(--foreground)]"><span className="text-[var(--muted)]">N:</span> {pnlDistribution.stats.n} trades</span>
            </div>
          </div>
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={pnlDistribution.data} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={isDarkMode ? "#1e293b" : "#f0f0f0"} />
              <XAxis dataKey="label" tick={{ fontSize: 11, fill: isDarkMode ? "#94a3b8" : "#999" }} />
              <YAxis tick={{ fontSize: 11, fill: isDarkMode ? "#94a3b8" : "#999" }} allowDecimals={false} />
              <Tooltip
                formatter={(value) => [`${value} trades`, "Frecuencia"]}
                contentStyle={{
                  fontSize: 12,
                  backgroundColor: isDarkMode ? '#1e293b' : '#fff',
                  borderColor: isDarkMode ? '#334155' : '#e2e8f0',
                  color: isDarkMode ? '#f8fafc' : '#334155'
                }}
              />
              <ReferenceLine x="0%" stroke="#94a3b8" strokeDasharray="3 3" />
              <Bar dataKey="value" radius={[2, 2, 0, 0]}>
                {pnlDistribution.data.map((entry, idx) => (
                  <Cell
                    key={idx}
                    fill={entry.num >= 0 ? "#10b981" : "#ef4444"}
                    fillOpacity={0.8}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {rHistogram.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-[var(--muted)] uppercase tracking-wide mb-3">
            Distribucion R-Multiple
          </h3>
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={rHistogram} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="r" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
              <Tooltip
                formatter={(value) => [`${value} trades`, "Frecuencia"]}
                contentStyle={{ fontSize: 12 }}
              />
              <ReferenceLine x="0R" stroke="#94a3b8" strokeDasharray="3 3" />
              <Bar dataKey="value" radius={[2, 2, 0, 0]}>
                {rHistogram.map((entry, idx) => (
                  <Cell
                    key={idx}
                    fill={entry.rNum >= 0 ? "#10b981" : "#ef4444"}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      <div>
        <h3 className="text-sm font-semibold text-[var(--muted)] uppercase tracking-wide mb-3">
          EV por Hora de Entrada
        </h3>
        <ResponsiveContainer width="100%" height={250}>
          <BarChart data={evByHour} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
            <XAxis dataKey="hour" tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 11 }} tickFormatter={(v: number) => `$${v.toFixed(0)}`} />
            <Tooltip
              formatter={(value, _name, props) => {
                const v = Number(value);
                const count = (props?.payload as { count?: number })?.count ?? 0;
                return [`$${v.toFixed(2)} (${count} trades)`, "Avg PnL"];
              }}
              contentStyle={{ fontSize: 12 }}
            />
            <ReferenceLine y={0} stroke="#94a3b8" />
            <Bar dataKey="ev" radius={[2, 2, 0, 0]}>
              {evByHour.map((entry, idx) => (
                <Cell
                  key={idx}
                  fill={entry.ev >= 0 ? "#10b981" : "#ef4444"}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div>
        <h3 className="text-sm font-semibold text-[var(--muted)] uppercase tracking-wide mb-3">
          EV por Dia de la Semana
        </h3>
        <ResponsiveContainer width="100%" height={250}>
          <BarChart data={evByDay} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
            <XAxis dataKey="day" tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 11 }} tickFormatter={(v: number) => `$${v.toFixed(0)}`} />
            <Tooltip
              formatter={(value, _name, props) => {
                const v = Number(value);
                const count = (props?.payload as { count?: number })?.count ?? 0;
                return [`$${v.toFixed(2)} (${count} trades)`, "Avg PnL"];
              }}
              contentStyle={{ fontSize: 12 }}
            />
            <ReferenceLine y={0} stroke="#94a3b8" />
            <Bar dataKey="ev" radius={[2, 2, 0, 0]}>
              {evByDay.map((entry, idx) => (
                <Cell
                  key={idx}
                  fill={entry.ev >= 0 ? "#10b981" : "#ef4444"}
                  fillOpacity={0.8}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
