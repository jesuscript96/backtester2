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
    if (n < 2) return null;

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

export default function MaeScatterChart({ trades, isDarkMode }: MaeScatterChartProps) {
    const processed = useMemo(() => {
        const winners: { x: number, y: number, trade: TradeRecord }[] = [];
        const losers: { x: number, y: number, trade: TradeRecord }[] = [];

        for (const t of trades) {
            let maeVal = t.mae !== undefined && t.mae !== null ? t.mae : 0;
            maeVal = Math.abs(maeVal);

            const p = { x: t.return_pct || 0, y: maeVal, trade: t };
            if (t.pnl > 0) winners.push(p);
            else losers.push(p);
        }

        const winReg = calculateRegression(winners);
        const lossReg = calculateRegression(losers);

        // Convert regression into 2-point data for Scatter-with-line
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
            lossR2: lossReg?.r2
        };
    }, [trades]);

    if (!trades.length) {
        return <div className="p-4 text-center text-[var(--muted)] text-sm">Sin datos para gráfico</div>;
    }

    const dotColor = "#f97316";

    const CustomTooltip = ({ active, payload }: any) => {
        if (active && payload && payload.length) {
            // Only show tooltip for dots, not lines
            const data = payload[0].payload;
            if (!data.trade) return null;

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

    const CustomDot = (props: any) => {
        const { cx, cy } = props;
        if (!cx || !cy) return null;
        return <circle cx={cx} cy={cy} r={1.5} stroke={dotColor} fill="transparent" strokeWidth={1} />;
    };

    return (
        <div className="bg-[var(--card-bg)] rounded border border-[var(--border)] shadow-sm overflow-hidden flex flex-col h-full transition-colors">
            <div className="bg-[var(--sidebar-bg)] border-b border-[var(--border)] px-3 py-1.5 flex items-center justify-between">
                <span className="text-[11px] font-semibold text-[var(--foreground)] tracking-wide uppercase">
                    MAE/MFE vs Rets
                </span>
                <div className="flex gap-4 text-[10px] text-[var(--muted)]">
                    {processed.lossR2 !== undefined && <span>Perdedoras R² = {(processed.lossR2 * 100).toFixed(1)}%</span>}
                    {processed.winR2 !== undefined && <span>Ganadoras R² = {(processed.winR2 * 100).toFixed(1)}%</span>}
                </div>
            </div>
            <div className="flex-1 p-2 min-h-[140px]">
                <ResponsiveContainer width="100%" height="100%">
                    <ScatterChart margin={{ top: 10, right: 10, bottom: 5, left: -20 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke={isDarkMode ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.05)"} />
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

                        <ReferenceLine y={0} stroke={isDarkMode ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.08)"} strokeWidth={1} />
                        <ReferenceLine x={0} stroke={isDarkMode ? "rgba(255,255,255,0.2)" : "rgba(0,0,0,0.2)"} strokeWidth={1.5} />

                        {/* Render Scatter Points first */}
                        <Scatter name="Perdedoras" data={processed.losers} shape={<CustomDot />} isAnimationActive={false} />
                        <Scatter name="Ganadoras" data={processed.winners} shape={<CustomDot />} isAnimationActive={false} />

                        {/* Use Scatter with line prop to render trendlines ON TOP of points */}
                        {processed.lossLineData && (
                            <Scatter
                                data={processed.lossLineData}
                                line
                                shape={() => null}
                                line={{
                                    stroke: isDarkMode ? "#ffffff" : "#000000",
                                    strokeDasharray: "4 4",
                                    strokeWidth: 2
                                }}
                                toolTipType="none"
                                isAnimationActive={false}
                            />
                        )}
                        {processed.winLineData && (
                            <Scatter
                                data={processed.winLineData}
                                line
                                shape={() => null}
                                line={{
                                    stroke: isDarkMode ? "#ffffff" : "#000000",
                                    strokeDasharray: "4 4",
                                    strokeWidth: 2
                                }}
                                toolTipType="none"
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
