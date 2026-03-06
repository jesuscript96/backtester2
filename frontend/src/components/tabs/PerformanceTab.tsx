"use client";

import { useMemo, useState, useRef, useEffect } from "react";
import {
  createChart,
  LineSeries,
  HistogramSeries,
  type IChartApi,
  type Time,
} from "lightweight-charts";
import type { DayResult, TradeRecord } from "@/lib/api";

interface PerformanceTabProps {
  dayResults: DayResult[];
  trades: TradeRecord[];
  initCash: number;
  riskR: number;
  isDarkMode?: boolean;
}

const MONTHS = ["01", "02", "03", "04", "05", "06", "07", "08", "09", "10", "11", "12"];
const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
type GridMetric = "PnL %" | "PnL $" | "PnL R" | "Win Rate" | "Trades" | "Profit Factor";

interface CellData {
  pnl: number;
  trades: number;
  wins: number;
  grossProfit: number;
  grossLoss: number;
  dailyReturns: number[];
}

function emptyCell(): CellData {
  return { pnl: 0, trades: 0, wins: 0, grossProfit: 0, grossLoss: 0, dailyReturns: [] };
}

// Helper: Get ISO week string 'YYYY-Www'
function getFormatWeek(dateStr: string) {
  const d = new Date(dateStr);
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${weekNo.toString().padStart(2, "0")}`;
}

export default function PerformanceTab({ dayResults, trades, initCash, riskR, isDarkMode = false }: PerformanceTabProps) {
  const [metric, setMetric] = useState<GridMetric>("PnL %");
  const [rollingWindow, setRollingWindow] = useState(30); // days
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);

  // --- 1. Data Processing for Grid ---
  // We need data structured by Year -> Month
  const gridData = useMemo(() => {
    const yearsMap = new Map<string, Map<string, CellData>>();
    let startYear = 9999;
    let endYear = 0;

    // Initialize all years/months found in trades or dayResults
    const allDates = [...trades.map(t => t.exit_time), ...dayResults.map(d => d.date)];
    for (const d of allDates) {
      if (!d) continue;
      const y = parseInt(d.substring(0, 4));
      if (y < startYear) startYear = y;
      if (y > endYear) endYear = y;
    }

    if (startYear <= endYear) {
      for (let y = startYear; y <= endYear; y++) {
        const mMap = new Map<string, CellData>();
        for (const m of MONTHS) {
          mMap.set(m, emptyCell());
        }
        mMap.set("YTD", emptyCell()); // The total for the year
        yearsMap.set(y.toString(), mMap);
      }
    }

    // Accumulate Daily Returns
    for (const dr of dayResults) {
      const y = dr.date.substring(0, 4);
      const m = dr.date.substring(5, 7);
      if (yearsMap.has(y)) {
        const mMap = yearsMap.get(y)!;
        mMap.get(m)!.dailyReturns.push(dr.total_return_pct || 0);
        mMap.get("YTD")!.dailyReturns.push(dr.total_return_pct || 0);
      }
    }

    // Accumulate Trades (PnL, wins, gross profit/loss)
    for (const t of trades) {
      const d = t.exit_time || t.entry_time;
      if (!d) continue;
      const y = d.substring(0, 4);
      const m = d.substring(5, 7);
      if (yearsMap.has(y)) {
        const mMap = yearsMap.get(y)!;
        const cell = mMap.get(m)!;
        const ytd = mMap.get("YTD")!;

        const isWin = t.pnl > 0;

        cell.trades++;
        ytd.trades++;

        cell.pnl += t.pnl;
        ytd.pnl += t.pnl;

        if (isWin) {
          cell.wins++;
          ytd.wins++;
          cell.grossProfit += t.pnl;
          ytd.grossProfit += t.pnl;
        } else {
          cell.grossLoss += Math.abs(t.pnl);
          ytd.grossLoss += Math.abs(t.pnl);
        }
      }
    }

    return yearsMap;
  }, [dayResults, trades]);

  // Render a specific cell based on the selected metric
  const renderCell = (cell: CellData) => {
    if (cell.dailyReturns.length === 0 && cell.trades === 0) return { text: "-", color: "transparent", tColor: "var(--muted)" };

    let val = 0;
    let text = "";

    switch (metric) {
      case "PnL %":
        val = cell.dailyReturns.reduce((acc, r) => acc * (1 + r / 100), 1) * 100 - 100;
        text = `${val > 0 ? "+" : ""}${val.toFixed(2)}%`;
        break;
      case "PnL $":
        val = cell.pnl;
        text = `${val >= 0 ? "+" : ""}$${val.toFixed(2)}`;
        break;
      case "PnL R":
        val = riskR > 0 ? cell.pnl / riskR : 0;
        text = `${val >= 0 ? "+" : ""}${val.toFixed(2)}R`;
        break;
      case "Win Rate":
        val = cell.trades > 0 ? (cell.wins / cell.trades) * 100 : 0;
        text = `${val.toFixed(1)}%`;
        break;
      case "Trades":
        val = cell.trades;
        text = val.toString();
        break;
      case "Profit Factor":
        val = cell.grossLoss > 0 ? cell.grossProfit / cell.grossLoss : (cell.grossProfit > 0 ? 99 : 0);
        text = val.toFixed(2);
        // Custom coloring for PF: > 1.5 is green, < 1 is red
        let pfColor = "transparent";
        let pfText = "text-gray-800";
        if (cell.trades > 0) {
          if (val >= 1.5) { pfColor = "rgba(16,185,129,0.2)"; pfText = "text-[var(--success)]"; }
          else if (val >= 1.0) { pfColor = "rgba(16,185,129,0.05)"; pfText = "text-[var(--success)]"; }
          else { pfColor = "rgba(239,68,68,0.1)"; pfText = "text-[var(--danger)]"; }
        }
        return { text, color: pfColor, tColor: pfText };
    }

    // Default coloring for PnL/WinRate
    let bgColor = "transparent";
    let tColor = "text-gray-800";

    if (metric.startsWith("PnL")) {
      if (val > 0) {
        bgColor = `rgba(16,185,129,${Math.min(val / (metric === "PnL %" ? 10 : 1000), 0.5)})`;
        tColor = "text-[var(--success)]";
      } else if (val < 0) {
        bgColor = `rgba(239,68,68,${Math.min(Math.abs(val) / (metric === "PnL %" ? 10 : 1000), 0.5)})`;
        tColor = "text-[var(--danger)]";
      }
    } else if (metric === "Win Rate") {
      if (cell.trades > 0) {
        if (val >= 50) {
          bgColor = `rgba(16,185,129,${Math.min((val - 50) / 50, 0.5)})`;
          tColor = "text-[var(--success)]";
        } else {
          bgColor = `rgba(239,68,68,${Math.min((50 - val) / 50, 0.5)})`;
          tColor = "text-[var(--danger)]";
        }
      }
    }

    return { text, color: bgColor, tColor };
  };

  // --- 2. Data Processing for Chart (Rolling Window) ---
  const chartData = useMemo(() => {
    if (!trades.length) return { wrData: [], pfData: [], trData: [] };

    // Sort trades by exit time
    const sortedTrades = [...trades]
      .filter(t => t.exit_time)
      .sort((a, b) => a.exit_time!.localeCompare(b.exit_time!));

    if (!sortedTrades.length) return { wrData: [], pfData: [], trData: [] };

    const wrData: { time: Time, value: number }[] = [];
    const pfData: { time: Time, value: number }[] = [];
    const trData: { time: Time, value: number, color: string }[] = [];

    // Get all unique exit dates
    const uniqueDates = Array.from(new Set(sortedTrades.map(t => t.exit_time!.substring(0, 10)))).sort();

    const windowMs = rollingWindow * 24 * 60 * 60 * 1000;

    for (const dateStr of uniqueDates) {
      const currentDate = new Date(dateStr);
      const startTime = currentDate.getTime() - windowMs;

      // Filter trades in window
      const windowTrades = sortedTrades.filter(t => {
        const tTime = new Date(t.exit_time!).getTime();
        return tTime > startTime && tTime <= currentDate.getTime();
      });

      if (windowTrades.length === 0) continue;

      let wins = 0;
      let gp = 0;
      let gl = 0;
      for (const t of windowTrades) {
        if (t.pnl > 0) {
          wins++;
          gp += t.pnl;
        } else {
          gl += Math.abs(t.pnl);
        }
      }

      const wr = (wins / windowTrades.length) * 100;
      const pf = gl > 0 ? gp / gl : (gp > 0 ? 5 : 0);
      const time = (dateStr) as Time;

      wrData.push({ time, value: wr });
      pfData.push({ time, value: pf });
      // For trades histogram, we'll show actual count of trades on that specific day
      const dayTradesCount = sortedTrades.filter(t => t.exit_time!.startsWith(dateStr)).length;
      if (dayTradesCount > 0) {
        trData.push({ time, value: dayTradesCount, color: "rgba(59, 130, 246, 0.3)" });
      }
    }

    return { wrData, pfData, trData };
  }, [trades, rollingWindow]);

  // --- 3. Chart Initialization ---
  useEffect(() => {
    if (!chartContainerRef.current) return;

    const chart = createChart(chartContainerRef.current, {
      width: chartContainerRef.current.clientWidth,
      height: 300,
      layout: {
        background: { color: isDarkMode ? "#0f172a" : "#ffffff" },
        textColor: isDarkMode ? "#f8fafc" : "#333"
      },
      grid: {
        vertLines: { color: isDarkMode ? "#1e293b" : "#f0f0f0" },
        horzLines: { color: isDarkMode ? "#1e293b" : "#f0f0f0" }
      },
      rightPriceScale: {
        borderColor: isDarkMode ? "#334155" : "#e2e8f0",
        visible: true,
        scaleMargins: { top: 0.1, bottom: 0.1 }
      },
      leftPriceScale: {
        borderColor: isDarkMode ? "#334155" : "#e2e8f0",
        visible: true,
        scaleMargins: { top: 0.6, bottom: 0 } // Push histogram down
      },
      timeScale: { borderColor: isDarkMode ? "#334155" : "#e2e8f0", timeVisible: true },
    });
    chartRef.current = chart;

    // Series 1: Trades (Left Axis, Histogram)
    const trSeries = chart.addSeries(HistogramSeries, {
      priceScaleId: 'left',
      color: 'rgba(59, 130, 246, 0.4)',
    });
    trSeries.setData(chartData.trData);

    // Series 2: Win Rate (Right Axis, Line)
    const wrSeries = chart.addSeries(LineSeries, {
      priceScaleId: 'right',
      color: '#10b981', // Green
      lineWidth: 2,
    });
    wrSeries.setData(chartData.wrData);

    // Series 3: Profit Factor (Right Axis, Line)
    // We need to scale PF slightly or give it its own axis if ranges differ too much from WR (0-100%).
    // Better: Give PF a separate invisible scale or just map it so it fits perfectly.
    // Wait, lightweight charts allows multiple right scales! Let's just use 'right' for WR and create a new one for PF.
    const pfSeries = chart.addSeries(LineSeries, {
      priceScaleId: 'pfScale',
      color: '#f59e0b', // Amber
      lineWidth: 2,
    });
    chart.priceScale('pfScale').applyOptions({
      visible: false, // Don't clutter the UI with a 3rd axis, just scale it internally
      scaleMargins: { top: 0.1, bottom: 0.1 }
    });
    pfSeries.setData(chartData.pfData);

    chart.timeScale().fitContent();

    const handleResize = () => {
      if (chartContainerRef.current) {
        chart.applyOptions({ width: chartContainerRef.current.clientWidth });
      }
    };
    window.addEventListener("resize", handleResize);

    return () => {
      window.removeEventListener("resize", handleResize);
      chart.remove();
      chartRef.current = null;
    };
  }, [chartData]);


  if (!dayResults.length) {
    return <p className="text-sm text-[var(--muted)]">Sin resultados</p>;
  }

  const years = Array.from(gridData.keys()).sort((a, b) => parseInt(b) - parseInt(a)); // Descending years

  return (
    <div className="space-y-6">

      {/* GRID SECTION */}
      <div className="bg-[var(--card-bg)] rounded-lg border border-[var(--border)] overflow-hidden">
        <div className="bg-gray-100 dark:bg-gray-800 border-b border-[var(--border)] px-4 py-3 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-[var(--foreground)]">Monthly Returns</h3>
          <div className="flex bg-[var(--card-bg)] rounded-md border border-[var(--border)] p-0.5 shadow-sm text-xs">
            {(["PnL %", "PnL $", "PnL R", "Win Rate", "Trades", "Profit Factor"] as GridMetric[]).map((m) => (
              <button
                key={m}
                onClick={() => setMetric(m)}
                className={`px-3 py-1.5 rounded-sm transition-colors ${metric === m ? "bg-[var(--accent)] text-white font-medium" : "text-[var(--muted)] hover:bg-[var(--card-muted-bg)] hover:text-[var(--foreground)]"
                  }`}
              >
                {m}
              </button>
            ))}
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm text-center">
            <thead>
              <tr className="border-b border-[var(--border)] bg-gray-100 dark:bg-gray-800/50">
                <th className="px-2 py-2 font-medium text-[var(--muted)] text-left pl-4">Year</th>
                {MONTH_NAMES.map(m => (
                  <th key={m} className="px-1 py-2 font-medium text-[var(--muted)]">{m}</th>
                ))}
                <th className="px-2 py-2 font-semibold text-[var(--foreground)] border-l border-[var(--border)]">YTD</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border)]">
              {years.map(year => {
                const mMap = gridData.get(year)!;
                const ytdCell = renderCell(mMap.get("YTD")!);
                return (
                  <tr key={year} className="hover:bg-[var(--card-muted-bg)] transition-colors">
                    <td className="px-2 py-3 font-semibold text-[var(--foreground)] text-left pl-4">{year}</td>
                    {MONTHS.map(m => {
                      const c = renderCell(mMap.get(m)!);
                      return (
                        <td key={m} className="px-1 py-2 font-mono" style={{ backgroundColor: c.color }}>
                          <span className={c.tColor}>{c.text}</span>
                        </td>
                      )
                    })}
                    <td className="px-2 py-2 font-mono font-bold border-l border-[var(--border)]" style={{ backgroundColor: ytdCell.color }}>
                      <span className={ytdCell.tColor}>{ytdCell.text}</span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div className="bg-[var(--card-bg)] rounded-lg border border-[var(--border)] p-4 shadow-sm transition-colors">
        <div className="flex items-center justify-between mb-4">
          <div className="flex flex-col gap-1">
            <h3 className="text-sm font-semibold text-[var(--foreground)] flex items-center gap-4">
              Métricas Rolling ({rollingWindow} días)
            </h3>
            <div className="flex items-center gap-3 text-[10px] font-normal normal-case">
              <span className="flex items-center gap-1 text-[var(--muted)]"><div className="w-2 h-2 rounded-full bg-blue-400"></div> Trades/Día</span>
              <span className="flex items-center gap-1 text-[var(--muted)]"><div className="w-2 h-2 rounded-full bg-emerald-500"></div> Win Rate {rollingWindow}d</span>
              <span className="flex items-center gap-1 text-[var(--muted)]"><div className="w-2 h-2 rounded-full bg-amber-500"></div> Profit Factor {rollingWindow}d</span>
            </div>
          </div>

          <div className="flex items-center gap-4 bg-[var(--card-bg)] border border-[var(--border)] px-3 py-1.5 rounded-md">
            <span className="text-xs font-medium text-[var(--muted)]">Ventana:</span>
            <input
              type="range"
              min="7"
              max="90"
              step="1"
              value={rollingWindow}
              onChange={(e) => setRollingWindow(parseInt(e.target.value))}
              className="w-32 accent-[var(--accent)]"
            />
            <span className="text-xs font-bold text-[var(--accent)] min-w-[40px]">{rollingWindow} días</span>
          </div>
        </div>
        <div ref={chartContainerRef} style={{ width: "100%", height: "300px" }} />
      </div>

    </div>
  );
}
