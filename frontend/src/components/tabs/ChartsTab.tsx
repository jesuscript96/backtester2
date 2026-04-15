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

/**
 * Enhanced Descriptive Statistics
 */
function calculateEnhancedStats(arr: number[]) {
  if (!arr.length) return { n: 0, mean: 0, median: 0, stdDev: 0, max: 0, min: 0, skewness: 0, kurtosis: 0, q1: 0, q3: 0, range: 0, iqr: 0 };

  const sorted = [...arr].sort((a, b) => a - b);
  const n = arr.length;
  const mean = arr.reduce((a, b) => a + b, 0) / n;

  // Percentiles
  const getPercentile = (p: number) => {
    const pos = (n - 1) * p;
    const base = Math.floor(pos);
    const rest = pos - base;
    if (sorted[base + 1] !== undefined) {
      return sorted[base] + rest * (sorted[base + 1] - sorted[base]);
    } else {
      return sorted[base];
    }
  };

  const median = getPercentile(0.5);
  const q1 = getPercentile(0.25);
  const q3 = getPercentile(0.75);
  const iqr = q3 - q1;
  const max = sorted[n - 1];
  const min = sorted[0];
  const range = max - min;

  // Standard Deviation
  const variance = arr.reduce((s, v) => s + Math.pow(v - mean, 2), 0) / n;
  const stdDev = Math.sqrt(variance);

  // Skewness & Kurtosis
  let skewSum = 0;
  let kurtSum = 0;
  if (stdDev > 0) {
    for (const x of arr) {
      skewSum += Math.pow((x - mean) / stdDev, 3);
      kurtSum += Math.pow((x - mean) / stdDev, 4);
    }
  }
  const skewness = skewSum / n;
  const kurtosis = (kurtSum / n) - 3; // Excess Kurtosis

  return { n, mean, median, stdDev, max, min, skewness, kurtosis, q1, q3, range, iqr };
}

interface StatsTableProps {
  stats: ReturnType<typeof calculateEnhancedStats> | null;
  title: string;
  isPct: boolean;
}

const StatsTable = ({ stats, title, isPct }: StatsTableProps) => {
  if (!stats) return null;
  return (
    <div className="bg-[var(--card-bg)] border border-[var(--border)] rounded p-3 text-[11px] flex-1 text-[var(--foreground)] h-full shadow-sm">
      <h4 className="font-bold border-b border-[var(--border)] pb-1 mb-2 uppercase text-[10px] text-[var(--muted)] tracking-wider">
        {title}
      </h4>
      <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 font-mono">
        <div className="flex justify-between border-b border-[var(--border)] border-dashed pb-0.5"><span className="font-sans text-[var(--muted)]">N:</span><span>{stats.n}</span></div>
        <div className="flex justify-between border-b border-[var(--border)] border-dashed pb-0.5"><span className="font-sans text-[var(--muted)]">Media:</span><span>{stats.mean.toFixed(2)}{isPct ? '%' : ''}</span></div>
        <div className="flex justify-between border-b border-[var(--border)] border-dashed pb-0.5"><span className="font-sans text-[var(--muted)]">Mediana:</span><span>{stats.median.toFixed(2)}{isPct ? '%' : ''}</span></div>
        <div className="flex justify-between border-b border-[var(--border)] border-dashed pb-0.5"><span className="font-sans text-[var(--muted)]">Desv Std:</span><span>{stats.stdDev.toFixed(2)}{isPct ? '%' : ''}</span></div>
        <div className="flex justify-between border-b border-[var(--border)] border-dashed pb-0.5"><span className="font-sans text-[var(--muted)]">Q1 (25%):</span><span>{stats.q1.toFixed(2)}{isPct ? '%' : ''}</span></div>
        <div className="flex justify-between border-b border-[var(--border)] border-dashed pb-0.5"><span className="font-sans text-[var(--muted)]">Q3 (75%):</span><span>{stats.q3.toFixed(2)}{isPct ? '%' : ''}</span></div>
        <div className="flex justify-between border-b border-[var(--border)] border-dashed pb-0.5"><span className="font-sans text-[var(--muted)]">Máximo:</span><span>{stats.max.toFixed(2)}{isPct ? '%' : ''}</span></div>
        <div className="flex justify-between border-b border-[var(--border)] border-dashed pb-0.5"><span className="font-sans text-[var(--muted)]">Mínimo:</span><span>{stats.min.toFixed(2)}{isPct ? '%' : ''}</span></div>
        <div className="flex justify-between border-b border-[var(--border)] border-dashed pb-0.5"><span className="font-sans text-[var(--muted)]">Rango:</span><span>{stats.range.toFixed(2)}{isPct ? '%' : ''}</span></div>
        <div className="flex justify-between border-b border-[var(--border)] border-dashed pb-0.5"><span className="font-sans text-[var(--muted)]">IQR:</span><span>{stats.iqr.toFixed(2)}{isPct ? '%' : ''}</span></div>
        <div className="flex justify-between border-b border-[var(--border)] border-dashed pb-0.5"><span className="font-sans text-[var(--muted)]">Asimetría:</span><span>{stats.skewness.toFixed(3)}</span></div>
        <div className="flex justify-between border-b border-[var(--border)] border-dashed pb-0.5"><span className="font-sans text-[var(--muted)]">Curtosis:</span><span>{stats.kurtosis.toFixed(3)}</span></div>
      </div>
    </div>
  );
};

export default function ChartsTab({ trades, riskR = 100, isDarkMode = false }: ChartsTabProps) {

  const pnlDistribution = useMemo(() => {
    const pnlPctCoords = trades.map(t => t.return_pct).filter((v): v is number => v !== undefined && v !== null);
    if (!pnlPctCoords.length) return { data: [], stats: null };

    const minPnl = Math.min(...pnlPctCoords);
    const maxPnl = Math.max(...pnlPctCoords);
    const range = Math.max(0.1, maxPnl - minPnl);

    let bucketSize = 0.05;
    if (range > 100) bucketSize = 5;
    else if (range > 50) bucketSize = 2;
    else if (range > 20) bucketSize = 1;
    else if (range > 10) bucketSize = 0.5;
    else if (range > 5) bucketSize = 0.25;
    else if (range > 2) bucketSize = 0.1;

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
        label: `${val > 0 ? '+' : ''}${val.toFixed(2)}%`,
        value: count,
        num: val
      }))
      .filter(d => Math.abs(d.num) <= 100);

    const stats = calculateEnhancedStats(pnlPctCoords);
    return { data, stats };
  }, [trades]);

  const consecutiveRuns = useMemo(() => {
    let currentRun = 0;
    let isWinning: boolean | null = null;
    const winRuns: number[] = [];
    const lossRuns: number[] = [];

    for (const t of trades) {
      if (t.pnl > 0) {
        if (isWinning === true) currentRun++;
        else {
          if (isWinning === false && currentRun > 0) lossRuns.push(currentRun);
          isWinning = true;
          currentRun = 1;
        }
      } else if (t.pnl < 0) {
        if (isWinning === false) currentRun++;
        else {
          if (isWinning === true && currentRun > 0) winRuns.push(currentRun);
          isWinning = false;
          currentRun = 1;
        }
      }
    }
    if (isWinning === true && currentRun > 0) winRuns.push(currentRun);
    if (isWinning === false && currentRun > 0) lossRuns.push(currentRun);

    const winFreq = new Map<number, number>();
    const lossFreq = new Map<number, number>();
    for (const r of winRuns) winFreq.set(r, (winFreq.get(r) || 0) + 1);
    for (const r of lossRuns) lossFreq.set(r, (lossFreq.get(r) || 0) + 1);

    const maxRun = Math.max(...winRuns, ...lossRuns, 0);
    const data = [];
    const displayMax = Math.min(12, maxRun);
    for (let i = 1; i <= displayMax; i++) {
      data.push({
        length: i.toString(),
        winRuns: winFreq.get(i) || 0,
        lossRuns: lossFreq.get(i) || 0,
        num: i
      });
    }

    return {
      data,
      winStats: calculateEnhancedStats(winRuns),
      lossStats: calculateEnhancedStats(lossRuns)
    };
  }, [trades]);

  const evByTime30Min = useMemo(() => {
    // Hour slots + 30 min slots
    // entry_time example: "2024-01-01 09:30:00"
    const timeMap = new Map<string, { total: number; count: number }>();

    for (const t of trades) {
      const d = new Date(t.entry_time);
      const h = d.getHours();
      const m = d.getMinutes();
      const halfHour = m < 30 ? "00" : "30";
      const key = `${String(h).padStart(2, '0')}:${halfHour}`;

      if (!timeMap.has(key)) timeMap.set(key, { total: 0, count: 0 });
      const entry = timeMap.get(key)!;
      entry.total += t.pnl;
      entry.count++;
    }

    return Array.from(timeMap.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([time, data]) => ({
        time,
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
    <div className="space-y-6">

      {/* 1. Header Grid: Rolling EV left, EV Analysis right */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 h-[250px] lg:h-[320px]">

        {/* Rolling EV Column */}
        <div className="flex-1 lg:col-span-1 border border-[var(--border)] rounded overflow-hidden shadow-sm h-full">
          <RollingEVChart trades={trades} riskR={riskR} isDarkMode={isDarkMode} />
        </div>

        {/* 30-min Time EV */}
        <div className="lg:col-span-1 bg-[var(--card-bg)] rounded border border-[var(--border)] shadow-sm overflow-hidden flex flex-col transition-colors h-full">
          <div className="bg-[var(--sidebar-bg)] border-b border-[var(--border)] px-3 py-1 flex items-center">
            <h2 className="text-[10px] font-bold uppercase tracking-wider text-[var(--foreground)]">EV por Tiempo (Intervalos 30m)</h2>
          </div>
          <div className="flex-1 p-2 min-h-0">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={evByTime30Min} margin={{ top: 5, right: 10, bottom: 0, left: -25 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={isDarkMode ? "#1e293b" : "#f0f0f0"} vertical={false} />
                <XAxis dataKey="time" tick={{ fontSize: 9, fill: isDarkMode ? "#94a3b8" : "#999" }} />
                <YAxis tick={{ fontSize: 9, fill: isDarkMode ? "#94a3b8" : "#999" }} tickFormatter={(v: number) => `$${v.toFixed(2)}`} />
                <Tooltip contentStyle={{ fontSize: '10px', backgroundColor: isDarkMode ? '#1e293b' : '#fff', borderColor: 'var(--border)' }} formatter={(value: number) => [`$${value.toFixed(2)}`, 'EV']} />
                <ReferenceLine y={0} stroke="#94a3b8" />
                <Bar dataKey="ev" radius={[2, 2, 0, 0]}>
                  {evByTime30Min.map((entry, idx) => <Cell key={idx} fill={entry.ev >= 0 ? "#10b981" : "#ef4444"} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Day EV */}
        <div className="lg:col-span-1 bg-[var(--card-bg)] rounded border border-[var(--border)] shadow-sm overflow-hidden flex flex-col transition-colors h-full">
          <div className="bg-[var(--sidebar-bg)] border-b border-[var(--border)] px-3 py-1 flex items-center">
            <h2 className="text-[10px] font-bold uppercase tracking-wider text-[var(--foreground)]">EV por Día</h2>
          </div>
          <div className="flex-1 p-2 min-h-0">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={evByDay} margin={{ top: 5, right: 10, bottom: 0, left: -25 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={isDarkMode ? "#1e293b" : "#f0f0f0"} vertical={false} />
                <XAxis dataKey="day" tick={{ fontSize: 9, fill: isDarkMode ? "#94a3b8" : "#999" }} />
                <YAxis tick={{ fontSize: 9, fill: isDarkMode ? "#94a3b8" : "#999" }} tickFormatter={(v: number) => `$${v.toFixed(2)}`} />
                <Tooltip contentStyle={{ fontSize: '10px', backgroundColor: isDarkMode ? '#1e293b' : '#fff', borderColor: 'var(--border)' }} formatter={(value: number) => [`$${value.toFixed(2)}`, 'EV']} />
                <ReferenceLine y={0} stroke="#94a3b8" />
                <Bar dataKey="ev" radius={[2, 2, 0, 0]}>
                  {evByDay.map((entry, idx) => <Cell key={idx} fill={entry.ev >= 0 ? "#10b981" : "#ef4444"} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* 2. Distributions Parallel */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* PnL Distribution */}
        <div className="bg-[var(--card-bg)] rounded border border-[var(--border)] overflow-hidden flex flex-col shadow-sm transition-colors h-[300px]">
          <div className="bg-[var(--sidebar-bg)] border-b border-[var(--border)] px-3 py-1.5">
            <span className="text-[11px] font-semibold text-[var(--foreground)] tracking-wide uppercase">
              Distribución de Retornos (PnL %)
            </span>
          </div>
          <div className="flex-1 p-3">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={pnlDistribution.data} margin={{ top: 10, right: 10, left: -25, bottom: 10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={isDarkMode ? "#1e293b" : "#f0f0f0"} vertical={false} />
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 8, fill: isDarkMode ? "#94a3b8" : "#999" }}
                  axisLine={true}
                  tickLine={false}
                  interval="preserveStartEnd"
                />
                <YAxis
                  tick={{ fontSize: 8, fill: isDarkMode ? "#94a3b8" : "#999" }}
                  axisLine={false}
                  tickLine={false}
                  allowDecimals={false}
                />
                <Tooltip
                  contentStyle={{ backgroundColor: isDarkMode ? "#1e293b" : "#fff", fontSize: '10px', borderColor: 'var(--border)' }}
                  cursor={{ fill: "rgba(0,0,0,0.05)" }}
                />
                <ReferenceLine x="0.00%" stroke="#94a3b8" strokeDasharray="3 3" />
                <Bar dataKey="value" radius={[1, 1, 0, 0]}>
                  {pnlDistribution.data.map((entry, index) => (
                    <Cell key={index} fill={entry.num > 0 ? "#10b981" : entry.num < 0 ? "#ef4444" : "#94a3b8"} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Consecutive Runs */}
        <div className="bg-[var(--card-bg)] rounded border border-[var(--border)] overflow-hidden flex flex-col shadow-sm transition-colors h-[300px]">
          <div className="bg-[var(--sidebar-bg)] border-b border-[var(--border)] px-3 py-1.5 flex justify-between items-center">
            <span className="text-[11px] font-semibold text-[var(--foreground)] tracking-wide uppercase">
              Consecutive Runs Distribution
            </span>
            <div className="flex gap-2 text-[8px] text-[var(--muted)]">
              <div className="flex items-center gap-1"><div className="w-2 h-2 bg-[#10b981]"></div> W</div>
              <div className="flex items-center gap-1"><div className="w-2 h-2 bg-[#ef4444]"></div> L</div>
            </div>
          </div>
          <div className="flex-1 p-3">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={consecutiveRuns.data} margin={{ top: 10, right: 10, left: -25, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={isDarkMode ? "#1e293b" : "#f0f0f0"} vertical={false} />
                <XAxis
                  dataKey="length"
                  tick={{ fontSize: 10, fill: isDarkMode ? "#94a3b8" : "#999" }}
                  axisLine={true}
                />
                <YAxis
                  tick={{ fontSize: 9, fill: isDarkMode ? "#94a3b8" : "#999" }}
                  axisLine={false}
                  allowDecimals={false}
                />
                <Tooltip contentStyle={{ backgroundColor: isDarkMode ? "#1e293b" : "#fff", fontSize: '10px', borderColor: 'var(--border)' }} />
                <Bar dataKey="winRuns" name="Wins" fill="#10b981" radius={[2, 2, 0, 0]} />
                <Bar dataKey="lossRuns" name="Losses" fill="#ef4444" radius={[2, 2, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* 3. Combined Stats Below */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <StatsTable stats={pnlDistribution.stats} title="Estadística Descriptiva PnL" isPct={true} />
        <StatsTable stats={consecutiveRuns.winStats} title="Descriptiva Rachas (W)" isPct={false} />
        <StatsTable stats={consecutiveRuns.lossStats} title="Descriptiva Rachas (L)" isPct={false} />
      </div>

    </div>
  );
}
