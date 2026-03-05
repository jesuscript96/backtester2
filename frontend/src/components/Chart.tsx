"use client";

import { useEffect, useRef, useState } from "react";
import {
  createChart,
  CandlestickSeries,
  LineSeries,
  HistogramSeries,
  type IChartApi,
  type CandlestickData,
  type SeriesMarker,
  type Time,
} from "lightweight-charts";
import { createSeriesMarkers } from "lightweight-charts";
import type { CandleData, TradeRecord, EquityPoint } from "@/lib/api";
import {
  calculateSMA,
  calculateEMA,
  calculateRSI,
  calculateMACD,
  calculateATR,
} from "@/lib/indicators";

interface ChartProps {
  candles: CandleData[];
  trades: TradeRecord[];
  equity: EquityPoint[];
  ticker: string;
  date: string;
}

export default function Chart({ candles, trades, equity, ticker, date }: ChartProps) {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const rsiContainerRef = useRef<HTMLDivElement>(null);
  const macdContainerRef = useRef<HTMLDivElement>(null);
  const atrContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const subChartsRef = useRef<IChartApi[]>([]);

  const [activeIndicators, setActiveIndicators] = useState<Set<string>>(new Set());
  const [smaPeriod, setSmaPeriod] = useState(20);
  const [emaPeriod, setEmaPeriod] = useState(20);
  const [rsiPeriod, setRsiPeriod] = useState(14);
  const [atrPeriod, setAtrPeriod] = useState(14);

  const toggleIndicator = (id: string) => {
    setActiveIndicators((prev: Set<string>) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // Count active oscillators for layout
  const hasRSI = activeIndicators.has("RSI");
  const hasMACD = activeIndicators.has("MACD");
  const hasATR = activeIndicators.has("ATR");

  useEffect(() => {
    if (!chartContainerRef.current || candles.length === 0) return;

    // Cleanup previous charts
    if (chartRef.current) {
      chartRef.current.remove();
      chartRef.current = null;
    }
    for (const sc of subChartsRef.current) {
      try { sc.remove(); } catch { }
    }
    subChartsRef.current = [];

    const sorted = [...candles].sort((a, b) => a.time - b.time);
    const deduped = sorted.filter((c, i) => i === 0 || c.time !== sorted[i - 1].time);

    const candleData: CandlestickData<Time>[] = deduped.map((c) => ({
      time: c.time as Time,
      open: c.open,
      high: c.high,
      low: c.low,
      close: c.close,
    }));

    // ========== MAIN CHART ==========
    const chart = createChart(chartContainerRef.current, {
      width: chartContainerRef.current.clientWidth,
      height: 400,
      layout: {
        background: { color: "#ffffff" },
        textColor: "#333",
      },
      grid: {
        vertLines: { color: "#f0f0f0" },
        horzLines: { color: "#f0f0f0" },
      },
      crosshair: { mode: 0 },
      rightPriceScale: { borderColor: "#e2e8f0" },
      timeScale: {
        borderColor: "#e2e8f0",
        timeVisible: true,
        secondsVisible: false,
      },
    });
    chartRef.current = chart;

    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: "#10b981",
      downColor: "#ef4444",
      borderDownColor: "#ef4444",
      borderUpColor: "#10b981",
      wickDownColor: "#ef4444",
      wickUpColor: "#10b981",
    });
    candleSeries.setData(candleData);

    // Volume
    const volumeSeries = chart.addSeries(HistogramSeries, {
      priceFormat: { type: "volume" },
      priceScaleId: "volume",
    });
    chart.priceScale("volume").applyOptions({
      scaleMargins: { top: 0.85, bottom: 0 },
    });
    volumeSeries.setData(
      deduped.map((c) => ({
        time: c.time as Time,
        value: c.volume,
        color: c.close >= c.open ? "rgba(16,185,129,0.3)" : "rgba(239,68,68,0.3)",
      }))
    );

    // Trade markers — use epoch timestamps for correct placement
    if (trades.length > 0) {
      // Build a lookup: epoch timestamp → candle index in deduped
      const timeToIdx = new Map<number, number>();
      for (let i = 0; i < deduped.length; i++) {
        timeToIdx.set(deduped[i].time as number, i);
      }

      const markers: SeriesMarker<Time>[] = [];
      for (const t of trades) {
        // Find entry candle by timestamp
        const entryEpoch = t.entry_time_epoch;
        if (entryEpoch && timeToIdx.has(entryEpoch)) {
          const isLong = t.direction.toLowerCase().includes("long");
          markers.push({
            time: entryEpoch as unknown as Time,
            position: isLong ? "belowBar" : "aboveBar",
            color: isLong ? "#10b981" : "#ef4444",
            shape: isLong ? "arrowUp" : "arrowDown",
            text: `${isLong ? "L" : "S"} $${t.entry_price.toFixed(2)}`,
          });
        }
        // Find exit candle by timestamp
        const exitEpoch = t.exit_time_epoch;
        if (exitEpoch && timeToIdx.has(exitEpoch) && t.status === "Closed") {
          markers.push({
            time: exitEpoch as unknown as Time,
            position: "aboveBar",
            color: t.pnl >= 0 ? "#10b981" : "#ef4444",
            shape: "circle",
            text: `${t.pnl >= 0 ? "+" : ""}$${t.pnl.toFixed(2)} (${t.exit_reason})`,
          });
        }
      }
      markers.sort((a, b) => (a.time as number) - (b.time as number));
      createSeriesMarkers(candleSeries, markers);
    }

    // --- OVERLAY INDICATORS (SMA, EMA, VWAP) ---
    if (activeIndicators.has("SMA")) {
      const smaData = calculateSMA(candles, smaPeriod);
      if (smaData.length > 0) {
        const series = chart.addSeries(LineSeries, { color: "#f59e0b", lineWidth: 2 });
        series.setData(smaData);
      }
    }
    if (activeIndicators.has("EMA")) {
      const emaData = calculateEMA(candles, emaPeriod);
      if (emaData.length > 0) {
        const series = chart.addSeries(LineSeries, { color: "#a855f7", lineWidth: 2 });
        series.setData(emaData);
      }
    }
    if (activeIndicators.has("VWAP")) {
      // Use backend-computed VWAP (session-aware, matches strategy engine)
      const vwapData = deduped
        .filter((c) => c.vwap != null)
        .map((c) => ({ time: c.time as Time, value: c.vwap as number }));
      if (vwapData.length > 0) {
        const series = chart.addSeries(LineSeries, { color: "#d4a017", lineWidth: 2 });
        series.setData(vwapData);
      }
    }

    chart.timeScale().fitContent();

    // Helper to create a sub-chart for oscillators
    const createSubChart = (
      container: HTMLDivElement,
      height: number = 120
    ): IChartApi => {
      const subChart = createChart(container, {
        width: container.clientWidth,
        height,
        layout: {
          background: { color: "#fafafa" },
          textColor: "#666",
          fontSize: 10,
        },
        grid: {
          vertLines: { color: "#f0f0f0" },
          horzLines: { color: "#eee" },
        },
        crosshair: { mode: 0 },
        rightPriceScale: { borderColor: "#e2e8f0" },
        timeScale: {
          borderColor: "#e2e8f0",
          timeVisible: true,
          secondsVisible: false,
          visible: false, // Hide time axis on sub-charts (main chart shows it)
        },
      });

      // Sync time scales
      chart.timeScale().subscribeVisibleLogicalRangeChange((range) => {
        if (range) subChart.timeScale().setVisibleLogicalRange(range);
      });
      subChart.timeScale().subscribeVisibleLogicalRangeChange((range) => {
        if (range) chart.timeScale().setVisibleLogicalRange(range);
      });

      subChartsRef.current.push(subChart);
      return subChart;
    };

    // ========== RSI SUB-CHART ==========
    if (hasRSI && rsiContainerRef.current) {
      const rsiChart = createSubChart(rsiContainerRef.current);
      const rsiData = calculateRSI(candles, rsiPeriod);
      if (rsiData.length > 0) {
        const rsiSeries = rsiChart.addSeries(LineSeries, {
          color: "#3b82f6",
          lineWidth: 2,
        });
        rsiSeries.setData(rsiData);
        rsiSeries.createPriceLine({ price: 70, color: "#ef4444", lineWidth: 1, lineStyle: 2 });
        rsiSeries.createPriceLine({ price: 30, color: "#10b981", lineWidth: 1, lineStyle: 2 });
      }
      rsiChart.timeScale().fitContent();
    }

    // ========== MACD SUB-CHART ==========
    if (hasMACD && macdContainerRef.current) {
      const macdChart = createSubChart(macdContainerRef.current);
      const macdData = calculateMACD(candles);
      if (macdData.length > 0) {
        const macdSeries = macdChart.addSeries(LineSeries, {
          color: "#2563eb",
          lineWidth: 2,
        });
        macdSeries.setData(macdData.map(d => ({ time: d.time, value: d.macd })));

        const signalSeries = macdChart.addSeries(LineSeries, {
          color: "#f59e0b",
          lineWidth: 1,
        });
        signalSeries.setData(macdData.map(d => ({ time: d.time, value: d.signal })));

        const histSeries = macdChart.addSeries(HistogramSeries, {});
        histSeries.setData(macdData.map(d => ({
          time: d.time,
          value: d.histogram,
          color: d.histogram >= 0 ? "rgba(16,185,129,0.5)" : "rgba(239,68,68,0.5)"
        })));
      }
      macdChart.timeScale().fitContent();
    }

    // ========== ATR SUB-CHART ==========
    if (hasATR && atrContainerRef.current) {
      const atrChart = createSubChart(atrContainerRef.current);
      const atrData = calculateATR(candles, atrPeriod);
      if (atrData.length > 0) {
        const atrSeries = atrChart.addSeries(LineSeries, {
          color: "#8b5cf6",
          lineWidth: 2,
        });
        atrSeries.setData(atrData);
      }
      atrChart.timeScale().fitContent();
    }

    // Resize handler
    const handleResize = () => {
      if (chartContainerRef.current) {
        chart.applyOptions({ width: chartContainerRef.current.clientWidth });
      }
      for (const sc of subChartsRef.current) {
        if (chartContainerRef.current) {
          sc.applyOptions({ width: chartContainerRef.current.clientWidth });
        }
      }
    };
    window.addEventListener("resize", handleResize);

    return () => {
      window.removeEventListener("resize", handleResize);
      for (const sc of subChartsRef.current) {
        try { sc.remove(); } catch { }
      }
      subChartsRef.current = [];
      chart.remove();
      chartRef.current = null;
    };
  }, [candles, trades, equity, activeIndicators, smaPeriod, emaPeriod, rsiPeriod, atrPeriod, hasRSI, hasMACD, hasATR]);

  return (
    <div className="bg-white rounded-lg border border-[var(--border)] overflow-hidden">

      {/* TOOLBAR */}
      <div className="px-4 py-2 border-b border-[var(--border)] flex flex-wrap items-center justify-between gap-3 bg-gray-50">
        <div className="flex items-center gap-3">
          <span className="font-semibold text-sm">{ticker}</span>
          <span className="text-xs text-[var(--muted)]">{date}</span>
          <span className="text-xs px-1.5 py-0.5 bg-gray-200 rounded text-gray-700">1m</span>
        </div>

        <div className="flex items-center gap-2 text-xs">
          {/* SMA */}
          <div className={`flex items-center border rounded overflow-hidden transition-colors ${activeIndicators.has("SMA") ? "border-amber-500 bg-amber-50" : "border-gray-300 bg-white"}`}>
            <button onClick={() => toggleIndicator("SMA")} className={`px-2 py-1 font-medium ${activeIndicators.has("SMA") ? "text-amber-700" : "text-gray-600 hover:bg-gray-100"}`}>
              SMA
            </button>
            {activeIndicators.has("SMA") && (
              <input type="number" value={smaPeriod} onChange={e => setSmaPeriod(Number(e.target.value))} className="w-12 pl-1 pr-0 py-1 border-l border-amber-200 bg-transparent text-amber-900 outline-none" min={1} />
            )}
          </div>

          {/* EMA */}
          <div className={`flex items-center border rounded overflow-hidden transition-colors ${activeIndicators.has("EMA") ? "border-purple-500 bg-purple-50" : "border-gray-300 bg-white"}`}>
            <button onClick={() => toggleIndicator("EMA")} className={`px-2 py-1 font-medium ${activeIndicators.has("EMA") ? "text-purple-700" : "text-gray-600 hover:bg-gray-100"}`}>
              EMA
            </button>
            {activeIndicators.has("EMA") && (
              <input type="number" value={emaPeriod} onChange={e => setEmaPeriod(Number(e.target.value))} className="w-12 pl-1 pr-0 py-1 border-l border-purple-200 bg-transparent text-purple-900 outline-none" min={1} />
            )}
          </div>

          {/* RSI */}
          <div className={`flex items-center border rounded overflow-hidden transition-colors ${activeIndicators.has("RSI") ? "border-blue-500 bg-blue-50" : "border-gray-300 bg-white"}`}>
            <button onClick={() => toggleIndicator("RSI")} className={`px-2 py-1 font-medium ${activeIndicators.has("RSI") ? "text-blue-700" : "text-gray-600 hover:bg-gray-100"}`}>
              RSI
            </button>
            {activeIndicators.has("RSI") && (
              <input type="number" value={rsiPeriod} onChange={e => setRsiPeriod(Number(e.target.value))} className="w-12 pl-1 pr-0 py-1 border-l border-blue-200 bg-transparent text-blue-900 outline-none" min={1} />
            )}
          </div>

          {/* MACD */}
          <button
            onClick={() => toggleIndicator("MACD")}
            className={`px-2 py-1 border rounded font-medium transition-colors ${activeIndicators.has("MACD") ? "border-blue-500 bg-blue-50 text-blue-700" : "border-gray-300 bg-white text-gray-600 hover:bg-gray-100"}`}
          >
            MACD
          </button>

          {/* ATR */}
          <div className={`flex items-center border rounded overflow-hidden transition-colors ${activeIndicators.has("ATR") ? "border-violet-500 bg-violet-50" : "border-gray-300 bg-white"}`}>
            <button onClick={() => toggleIndicator("ATR")} className={`px-2 py-1 font-medium ${activeIndicators.has("ATR") ? "text-violet-700" : "text-gray-600 hover:bg-gray-100"}`}>
              ATR
            </button>
            {activeIndicators.has("ATR") && (
              <input type="number" value={atrPeriod} onChange={e => setAtrPeriod(Number(e.target.value))} className="w-12 pl-1 pr-0 py-1 border-l border-violet-200 bg-transparent text-violet-900 outline-none" min={1} />
            )}
          </div>

          {/* VWAP */}
          <button
            onClick={() => toggleIndicator("VWAP")}
            className={`px-2 py-1 border rounded font-medium transition-colors ${activeIndicators.has("VWAP") ? "border-pink-500 bg-pink-50 text-pink-700" : "border-gray-300 bg-white text-gray-600 hover:bg-gray-100"}`}
          >
            VWAP
          </button>
        </div>
      </div>

      {/* MAIN CHART */}
      <div ref={chartContainerRef} style={{ width: "100%", height: "400px" }} />

      {/* RSI SUB-CHART */}
      {hasRSI && (
        <div className="border-t border-gray-200">
          <div className="px-3 py-0.5 bg-gray-50 text-[10px] font-semibold text-gray-500 uppercase tracking-wider">
            RSI ({rsiPeriod})
          </div>
          <div ref={rsiContainerRef} style={{ width: "100%", height: "120px" }} />
        </div>
      )}

      {/* MACD SUB-CHART */}
      {hasMACD && (
        <div className="border-t border-gray-200">
          <div className="px-3 py-0.5 bg-gray-50 text-[10px] font-semibold text-gray-500 uppercase tracking-wider">
            MACD (12,26,9)
          </div>
          <div ref={macdContainerRef} style={{ width: "100%", height: "120px" }} />
        </div>
      )}

      {/* ATR SUB-CHART */}
      {hasATR && (
        <div className="border-t border-gray-200">
          <div className="px-3 py-0.5 bg-gray-50 text-[10px] font-semibold text-gray-500 uppercase tracking-wider">
            ATR ({atrPeriod})
          </div>
          <div ref={atrContainerRef} style={{ width: "100%", height: "120px" }} />
        </div>
      )}
    </div>
  );
}
