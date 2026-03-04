"use client";

import { useEffect, useRef, useState, useMemo } from "react";
import {
    createChart,
    BaselineSeries,
    type IChartApi,
    type Time,
} from "lightweight-charts";
import type { TradeRecord } from "@/lib/api";

interface RollingEVChartProps {
    trades: TradeRecord[];
    riskR: number;
}

export default function RollingEVChart({ trades, riskR }: RollingEVChartProps) {
    const containerRef = useRef<HTMLDivElement>(null);
    const chartRef = useRef<IChartApi | null>(null);
    const [rollingWindow, setRollingWindow] = useState(50);
    type RollingBasis = "trades" | "days";
    const [basis, setBasis] = useState<RollingBasis>("days");

    const evData = useMemo(() => {
        if (!trades.length) return [];
        const r = riskR > 0 ? riskR : 1;

        if (basis === "days") {
            // Group trades by day, compute daily EV, then rolling avg over days
            const dayTrades = new Map<string, TradeRecord[]>();
            for (const t of trades) {
                const d = new Date(t.exit_time);
                const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
                if (!dayTrades.has(dateStr)) dayTrades.set(dateStr, []);
                dayTrades.get(dateStr)!.push(t);
            }

            const dailyEV: { date: string; ev: number }[] = [];
            for (const [date, dayT] of dayTrades) {
                const wins = dayT.filter((t) => t.pnl > 0);
                const losses = dayT.filter((t) => t.pnl <= 0);
                const pWin = wins.length / dayT.length;
                const pLoss = losses.length / dayT.length;
                const avgWin = wins.length > 0 ? wins.reduce((s, t) => s + t.pnl / r, 0) / wins.length : 0;
                const avgLoss = losses.length > 0 ? Math.abs(losses.reduce((s, t) => s + t.pnl / r, 0) / losses.length) : 0;
                dailyEV.push({ date, ev: pWin * avgWin - pLoss * avgLoss });
            }
            dailyEV.sort((a, b) => a.date.localeCompare(b.date));

            const result: { time: Time; value: number }[] = [];
            for (let i = 0; i < dailyEV.length; i++) {
                const start = Math.max(0, i - rollingWindow + 1);
                const slice = dailyEV.slice(start, i + 1);
                const avg = slice.reduce((s, d) => s + d.ev, 0) / slice.length;
                result.push({ time: dailyEV[i].date as unknown as Time, value: avg });
            }
            return result;
        } else {
            // Rolling over individual trades
            const sorted = [...trades].sort(
                (a, b) => new Date(a.entry_time).getTime() - new Date(b.entry_time).getTime()
            );
            const raw: { date: string; value: number }[] = [];
            for (let i = 0; i < sorted.length; i++) {
                const start = Math.max(0, i - rollingWindow + 1);
                const slice = sorted.slice(start, i + 1);
                const wins = slice.filter((t) => t.pnl > 0);
                const losses = slice.filter((t) => t.pnl <= 0);
                const pWin = wins.length / slice.length;
                const pLoss = losses.length / slice.length;
                const avgWin = wins.length > 0 ? wins.reduce((s, t) => s + t.pnl / r, 0) / wins.length : 0;
                const avgLoss = losses.length > 0 ? Math.abs(losses.reduce((s, t) => s + t.pnl / r, 0) / losses.length) : 0;
                const ev = pWin * avgWin - pLoss * avgLoss;
                const d = new Date(sorted[i].exit_time);
                const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
                raw.push({ date: dateStr, value: ev });
            }
            // Keep last per day, sorted
            const dayMap = new Map<string, number>();
            for (const p of raw) dayMap.set(p.date, p.value);
            return Array.from(dayMap.entries())
                .sort((a, b) => a[0].localeCompare(b[0]))
                .map(([date, value]) => ({ time: date as unknown as Time, value }));
        }
    }, [trades, rollingWindow, riskR, basis]);



    useEffect(() => {
        if (!containerRef.current || !evData.length) return;

        const chart = createChart(containerRef.current, {
            width: containerRef.current.clientWidth,
            height: containerRef.current.clientHeight || 120,
            layout: { background: { color: "#ffffff" }, textColor: "#999" },
            grid: {
                vertLines: { color: "#f5f5f5" },
                horzLines: { color: "#f5f5f5" },
            },
            rightPriceScale: { borderColor: "#e2e8f0" },
            timeScale: { borderColor: "#e2e8f0", timeVisible: true },
            crosshair: { mode: 0 },
        });
        chartRef.current = chart;

        // BaselineSeries with gradient fill above/below zero — like equity/drawdown
        const series = chart.addSeries(BaselineSeries, {
            baseValue: { type: "price", price: 0 },
            topLineColor: "#e67e22",
            topFillColor1: "rgba(230,126,34,0.3)",
            topFillColor2: "rgba(230,126,34,0.02)",
            bottomLineColor: "#e67e22",
            bottomFillColor1: "rgba(230,126,34,0.02)",
            bottomFillColor2: "rgba(230,126,34,0.3)",
            lineWidth: 2,
        });
        series.setData(evData);

        // Ensure the full history is visible
        chart.timeScale().fitContent();

        const el = containerRef.current;
        const handleResize = () => {
            if (el) {
                chart.applyOptions({
                    width: el.clientWidth,
                    height: el.clientHeight || 120,
                });
                chart.timeScale().fitContent();
            }
        };
        globalThis.addEventListener("resize", handleResize);
        const resizeObserver = new ResizeObserver(handleResize);
        resizeObserver.observe(el);

        return () => {
            resizeObserver.disconnect();
            globalThis.removeEventListener("resize", handleResize);
            chart.remove();
            chartRef.current = null;
        };
    }, [evData]);

    return (
        <div className="bg-white rounded border border-gray-300 shadow-sm overflow-hidden flex flex-col h-full">
            <div className="bg-gray-50 border-b border-gray-300 px-3 py-1.5 flex items-center justify-between">
                <h2 className="text-[11px] font-bold uppercase tracking-wider text-gray-600">
                    Rolling EV
                </h2>
                <div className="flex items-center gap-3">
                    <div className="flex bg-gray-100 rounded text-[10px] border border-gray-200">
                        {([["trades", "Trades"], ["days", "Días"]] as const).map(([val, label]) => (
                            <button
                                key={val}
                                onClick={() => setBasis(val)}
                                className={`px-2 py-0.5 rounded transition-colors font-medium ${basis === val
                                    ? "bg-white text-gray-900 shadow-sm"
                                    : "text-gray-400 hover:text-gray-600"
                                    }`}
                            >
                                {label}
                            </button>
                        ))}
                    </div>
                    <div className="flex items-center gap-1.5">
                        <span className="text-[9px] text-gray-400 uppercase">Window</span>
                        <input
                            type="number"
                            min={5}
                            max={500}
                            value={rollingWindow}
                            onChange={(e) => setRollingWindow(Math.max(5, Math.min(500, parseInt(e.target.value) || 50)))}
                            className="w-12 text-xs border border-gray-200 rounded px-1.5 py-0.5 text-center font-mono bg-white"
                        />
                    </div>
                </div>
            </div>
            <div ref={containerRef} className="flex-1" style={{ minHeight: 100 }} />
        </div>
    );
}
