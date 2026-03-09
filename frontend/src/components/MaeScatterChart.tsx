"use client";

import { useMemo } from "react";
import {
    ScatterChart,
    Scatter,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
    ReferenceLine,
    Cell
} from "recharts";
import type { TradeRecord } from "@/lib/api";

interface MaeScatterChartProps {
    trades: TradeRecord[];
    isDarkMode?: boolean;
}

// Simple Linear Regression calculation
function calculateRegression(points: { x: number, y: number }[]) {
    const n = points.length;
    if (n < 2) return null; // Need at least 2 points for a line

    let sumX = 0;
    let sumY = 0;
    let sumXY = 0;
    let sumXX = 0;
    let sumYY = 0;

    for (const p of points) {
        sumX += p.x;
        sumY += p.y;
        sumXY += p.x * p.y;
        sumXX += p.x * p.x;
        sumYY += p.y * p.y;
    }

    const denominator = n * sumXX - sumX * sumX;
    if (denominator === 0) return null;

    const slope = (n * sumXY - sumX * sumY) / denominator;
    const intercept = (sumY - slope * sumX) / n;

    // R-squared
    let rSquared = 0;
    const meanY = sumY / n;
    let ssTot = 0;
    let ssRes = 0;
    for (const p of points) {
        const predictedY = slope * p.x + intercept;
        ssTot += Math.pow(p.y - meanY, 2);
        ssRes += Math.pow(p.y - predictedY, 2);
    }
    if (ssTot > 0) {
        rSquared = 1 - (ssRes / ssTot);
    }

    // Calculate start and end points
    const minX = Math.min(...points.map(p => p.x));
    const maxX = Math.max(...points.map(p => p.x));

    return {
        m: slope,
        b: intercept,
        r2: rSquared,
        start: { x: minX, y: slope * minX + intercept },
        end: { x: maxX, y: slope * maxX + intercept }
    };
}

export default function MaeScatterChart({ trades, isDarkMode }: MaeScatterChartProps) {
    const processed = useMemo(() => {
        const winners: { x: number, y: number, trade: TradeRecord }[] = [];
        const losers: { x: number, y: number, trade: TradeRecord }[] = [];

        for (const t of trades) {
            let maeVal = t.mae !== undefined && t.mae !== null ? t.mae : 0;
            maeVal = Math.abs(maeVal); // Positive scale as requested

            const p = { x: t.return_pct || 0, y: maeVal, trade: t };
            if (t.pnl > 0) winners.push(p);
            else losers.push(p);
        }

        return {
            winners,
            losers,
            winLine: calculateRegression(winners),
            lossLine: calculateRegression(losers)
        };
    }, [trades]);

    if (!trades.length) {
        return <div className="p-4 text-center text-[var(--muted)] text-sm">Sin datos para gráfico</div>;
    }

    const winColor = "#f97316";
    const lossColor = "#3b82f6";

    const CustomTooltip = ({ active, payload }: any) => {
        if (active && payload && payload.length) {
            const data = payload[0].payload;
            return (
                <div className={`p-2 shadow-md rounded text-sm ${isDarkMode ? 'bg-slate-800 border-slate-700 text-slate-200' : 'bg-white border-gray-200 text-gray-800'} border`}>
                    <p className="font-semibold mb-1">{data.trade.direction} Trade</p>
                    <p>Retorno: {data.x.toFixed(2)}%</p>
                    <p>MAE: {data.y.toFixed(2)}%</p>
                    <p>PnL: ${data.trade.pnl.toFixed(2)}</p>
                </div>
            );
        }
        return null;
    };

    return (
        <div className="bg-[var(--card-bg)] rounded border border-[var(--border)] shadow-sm overflow-hidden flex flex-col h-full transition-colors">
            <div className="bg-[var(--sidebar-bg)] border-b border-[var(--border)] px-3 py-1.5 flex items-center justify-between">
                <span className="text-[11px] font-semibold text-[var(--foreground)] tracking-wide uppercase">
                    MAE % vs RESULTADO %
                </span>
                <div className="flex gap-4 text-[10px] text-[var(--muted)]">
                    {processed.lossLine && <span>Perdedoras R² = {(processed.lossLine.r2 * 100).toFixed(1)}%</span>}
                    {processed.winLine && <span>Ganadoras R² = {(processed.winLine.r2 * 100).toFixed(1)}%</span>}
                </div>
            </div>
            <div className="flex-1 p-2 min-h-[140px]">
                <ResponsiveContainer width="100%" height="100%">
                    <ScatterChart margin={{ top: 10, right: 10, bottom: 5, left: -20 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke={isDarkMode ? "#1e293b" : "#f0f0f0"} />
                        <XAxis
                            type="number"
                            dataKey="x"
                            name="Retorno"
                            unit="%"
                            tick={{ fontSize: 10, fill: isDarkMode ? "#94a3b8" : "#999" }}
                            tickFormatter={(v: number) => `${v.toFixed(0)}%`}
                            axisLine={false}
                        />
                        <YAxis
                            type="number"
                            dataKey="y"
                            name="MAE"
                            unit="%"
                            tick={{ fontSize: 10, fill: isDarkMode ? "#94a3b8" : "#999" }}
                            tickFormatter={(v: number) => `${v.toFixed(0)}%`}
                            axisLine={false}
                            tickLine={false}
                        />
                        <Tooltip cursor={{ strokeDasharray: '3 3' }} content={<CustomTooltip />} />

                        <Scatter name="Perdedoras" data={processed.losers} fill={lossColor}>
                            {processed.losers.map((entry, index) => (
                                <Cell key={`cell-loss-${index}`} fill={lossColor} fillOpacity={0.8} />
                            ))}
                        </Scatter>

                        <Scatter name="Ganadoras" data={processed.winners} fill={winColor}>
                            {processed.winners.map((entry, index) => (
                                <Cell key={`cell-win-${index}`} fill={winColor} fillOpacity={0.8} />
                            ))}
                        </Scatter>

                        {processed.lossLine && (
                            <ReferenceLine
                                segment={[processed.lossLine.start, processed.lossLine.end]}
                                stroke="#ef4444" // dark red
                                strokeDasharray="3 3"
                                strokeWidth={2}
                            />
                        )}
                        {processed.winLine && (
                            <ReferenceLine
                                segment={[processed.winLine.start, processed.winLine.end]}
                                stroke="#ef4444"
                                strokeDasharray="3 3"
                                strokeWidth={2}
                            />
                        )}
                    </ScatterChart>
                </ResponsiveContainer>
            </div>
            <div className="flex justify-center gap-6 pb-2 text-[11px] text-[var(--muted)]">
                <div className="flex items-center gap-1.5">
                    <div className="w-2 h-2 rounded-full" style={{ backgroundColor: lossColor }}></div>
                    <span>Perdedoras</span>
                </div>
                <div className="flex items-center gap-1.5">
                    <div className="w-2 h-2 rounded-full" style={{ backgroundColor: winColor }}></div>
                    <span>Ganadoras</span>
                </div>
                <div className="flex items-center gap-1.5">
                    <div className="w-4 border-b-2 border-dashed border-[#ef4444]"></div>
                    <span>Lineal</span>
                </div>
            </div>
        </div>
    );
}
