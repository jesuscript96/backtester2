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
    ReferenceLine
} from "recharts";
import type { TradeRecord } from "@/lib/api";

interface MaeScatterChartProps {
    trades: TradeRecord[];
    isDarkMode?: boolean;
}

// Simple Linear Regression calculation
function calculateRegression(points: { x: number, y: number }[]) {
    const n = points.length;
    if (n < 2) return null;

    let sumX = 0;
    let sumY = 0;
    let sumXY = 0;
    let sumXX = 0;

    for (const p of points) {
        sumX += p.x;
        sumY += p.y;
        sumXY += p.x * p.y;
        sumXX += p.x * p.x;
    }

    const denominator = n * sumXX - sumX * sumX;
    if (denominator === 0) return null;

    const slope = (n * sumXY - sumX * sumY) / denominator;
    const intercept = (sumY - slope * sumX) / n;

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

    const minX = Math.min(...points.map(p => p.x));
    const maxX = Math.max(...points.map(p => p.x));

    return {
        m: slope,
        b: intercept,
        r2: rSquared,
        minX,
        maxX
    };
}

const CustomTooltip = ({ active, payload, isDarkMode }: { active?: boolean, payload?: unknown[], isDarkMode?: boolean }) => {
    if (active && payload && payload.length) {
        // Only show tooltip for dots, not lines
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const data = (payload[0] as any).payload;
        if (!data.trade) return null;

        return (
            <div className={`p-2 shadow-md rounded text-sm ${isDarkMode ? 'bg-slate-800 border-slate-700 text-slate-200' : 'bg-white border-gray-200 text-gray-800'} border`}>
                <p className="font-semibold mb-1">{data.trade.direction} Trade</p>
                <p>Retorno: {data.x.toFixed(2)}%</p>
                <p>MAE: {data.y.toFixed(2)}%</p>
                <p>MFE: {data.trade.mfe !== undefined ? `${data.trade.mfe.toFixed(2)}%` : '-'}</p>
                <p>PnL: ${data.trade.pnl.toFixed(2)}</p>
            </div>
        );
    }
    return null;
};

const CustomDot = (props: { cx?: number, cy?: number, dotColor?: string }) => {
    const { cx, cy, dotColor } = props;
    if (!cx || !cy) return null;
    return <circle cx={cx} cy={cy} r={1.5} stroke={dotColor || "#f97316"} fill="transparent" strokeWidth={1} />;
};

export default function MaeScatterChart({ trades, isDarkMode }: MaeScatterChartProps) {
    const processed = useMemo(() => {
        let sumMae = 0;
        let sumMfe = 0;
        let tradeCount = 0;
        const winners: { x: number, y: number, trade: TradeRecord }[] = [];
        const losers: { x: number, y: number, trade: TradeRecord }[] = [];

        for (const t of trades) {
            let maeVal = t.mae !== undefined && t.mae !== null ? t.mae : 0;
            maeVal = Math.abs(maeVal);

            let mfeVal = t.mfe !== undefined && t.mfe !== null ? t.mfe : 0;
            mfeVal = Math.abs(mfeVal);

            sumMae += maeVal;
            sumMfe += mfeVal;
            tradeCount++;

            const p = { x: t.return_pct || 0, y: maeVal, trade: t };
            if (t.pnl > 0) winners.push(p);
            else losers.push(p);
        }

        const winReg = calculateRegression(winners);
        const lossReg = calculateRegression(losers);

        const winLineData = winReg ? [
            { x: 0, y: winReg.m * 0 + winReg.b },
            { x: winReg.maxX, y: winReg.m * winReg.maxX + winReg.b }
        ] : null;

        const lossLineData = lossReg ? [
            { x: lossReg.minX, y: lossReg.m * lossReg.minX + lossReg.b },
            { x: 0, y: lossReg.m * 0 + lossReg.b }
        ] : null;

        return {
            winners,
            losers,
            winLineData,
            lossLineData,
            winR2: winReg?.r2,
            lossR2: lossReg?.r2,
            avgMae: tradeCount > 0 ? sumMae / tradeCount : 0,
            avgMfe: tradeCount > 0 ? sumMfe / tradeCount : 0
        };
    }, [trades]);

    if (!trades.length) {
        return <div className="p-4 text-center text-[var(--muted)] text-sm">Sin datos para gráfico</div>;
    }

    const dotColor = "#f97316";

    return (
        <div className="bg-[var(--card-bg)] rounded border border-[var(--border)] shadow-sm overflow-hidden flex flex-col h-full transition-colors relative">
            <div className="bg-[var(--sidebar-bg)] border-b border-[var(--border)] px-3 py-1.5 flex items-center justify-between">
                <span className="text-[11px] font-semibold text-[var(--foreground)] tracking-wide uppercase">
                    MAE/MFE vs Rets
                </span>
                <div className="flex gap-4 text-[10px] text-[var(--muted)] font-medium">
                    <span>Avg MAE: {processed.avgMae.toFixed(2)}%</span>
                    <span>Avg MFE: {processed.avgMfe.toFixed(2)}%</span>
                </div>
            </div>
            <div className="flex-1 p-2 min-h-[140px] relative">
                <div className="absolute top-4 right-4 text-[10px] text-[var(--muted)] flex flex-col items-end gap-0.5 pointer-events-none z-10 bg-[var(--card-bg)]/80 p-1.5 rounded backdrop-blur border border-[var(--border)]">
                    {processed.winR2 !== undefined && <span>Ganadoras R² = {(processed.winR2 * 100).toFixed(1)}%</span>}
                    {processed.lossR2 !== undefined && <span>Perdedoras R² = {(processed.lossR2 * 100).toFixed(1)}%</span>}
                </div>
                <ResponsiveContainer width="100%" height="100%">
                    <ScatterChart margin={{ top: 10, right: 10, bottom: 5, left: -20 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke={isDarkMode ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.05)"} />
                        <XAxis
                            type="number"
                            dataKey="x"
                            name="Retorno"
                            unit="%"
                            tick={{ fontSize: 10, fill: isDarkMode ? "#94a3b8" : "#999" }}
                            tickFormatter={(v: number) => `${v.toFixed(0)}`}
                            axisLine={false}
                        />
                        <YAxis
                            type="number"
                            dataKey="y"
                            name="MAE"
                            unit="%"
                            tick={{ fontSize: 10, fill: isDarkMode ? "#94a3b8" : "#999" }}
                            tickFormatter={(v: number) => `${v.toFixed(0)}`}
                            axisLine={false}
                            tickLine={false}
                        />
                        <Tooltip cursor={{ strokeDasharray: '3 3' }} content={<CustomTooltip isDarkMode={isDarkMode} />} />

                        <ReferenceLine y={0} stroke={isDarkMode ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.08)"} strokeWidth={1} />
                        <ReferenceLine x={0} stroke={isDarkMode ? "rgba(255,255,255,0.2)" : "rgba(0,0,0,0.2)"} strokeWidth={1.5} />

                        <Scatter name="Perdedoras" data={processed.losers} shape={<CustomDot dotColor={dotColor} />} isAnimationActive={false} />
                        <Scatter name="Ganadoras" data={processed.winners} shape={<CustomDot dotColor={dotColor} />} isAnimationActive={false} />

                        {processed.lossLineData && (
                            <Scatter
                                data={processed.lossLineData}
                                shape={() => null}
                                line={{
                                    stroke: isDarkMode ? "#ffffff" : "#000000",
                                    strokeDasharray: "4 4",
                                    strokeWidth: 2
                                }}
                                tooltipType="none"
                                isAnimationActive={false}
                            />
                        )}
                        {processed.winLineData && (
                            <Scatter
                                data={processed.winLineData}
                                shape={() => null}
                                line={{
                                    stroke: isDarkMode ? "#ffffff" : "#000000",
                                    strokeDasharray: "4 4",
                                    strokeWidth: 2
                                }}
                                tooltipType="none"
                                isAnimationActive={false}
                            />
                        )}
                    </ScatterChart>
                </ResponsiveContainer>
            </div>
            <div className="flex justify-center gap-6 pb-2 text-[11px] text-[var(--muted)]">
                <div className="flex items-center gap-1.5">
                    <div className="w-2 h-2 rounded-full border border-[var(--foreground)]" style={{ borderColor: dotColor }}></div>
                    <span>Operaciones</span>
                </div>
                <div className="flex items-center gap-1.5">
                    <div className="w-4 border-b border-[var(--foreground)] border-dashed" style={{ borderColor: isDarkMode ? '#fff' : '#000' }}></div>
                    <span>Tendencia Lineal</span>
                </div>
            </div>
        </div>
    );
}
