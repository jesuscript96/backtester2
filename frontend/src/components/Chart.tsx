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

  // Custom hook for local storage persistence
  function useLocalStorage<T>(key: string, initialValue: T) {
    const [storedValue, setStoredValue] = useState<T>(() => {
      if (typeof window === "undefined") return initialValue;
      try {
        const item = window.localStorage.getItem(key);
        return item ? JSON.parse(item) : initialValue;
      } catch (error) {
        console.warn(`Error reading localStorage key "${key}":`, error);
        return initialValue;
      }
    });

    const setValue = (value: T | ((val: T) => T)) => {
      try {
        const valueToStore = value instanceof Function ? value(storedValue) : value;
        setStoredValue(valueToStore);
        if (typeof window !== "undefined") {
          window.localStorage.setItem(key, JSON.stringify(valueToStore));
        }
      } catch (error) {
        console.warn(`Error setting localStorage key "${key}":`, error);
      }
    };

    return [storedValue, setValue] as const;
  }

  // Array-based indicator states
  type IndicatorItem = { id: string; period: number };
  const [smas, setSmas] = useLocalStorage<IndicatorItem[]>("chart_smas", []);
  const [emas, setEmas] = useLocalStorage<IndicatorItem[]>("chart_emas", []);
  const [rsis, setRsis] = useLocalStorage<IndicatorItem[]>("chart_rsis", []);
  const [atrs, setAtrs] = useLocalStorage<IndicatorItem[]>("chart_atrs", []);

  // Non-period indicators
  const [showMACD, setShowMACD] = useLocalStorage<boolean>("chart_macd", false);
  const [showVWAP, setShowVWAP] = useLocalStorage<boolean>("chart_vwap", false);

  // Layout booleans
  const hasRSI = rsis.length > 0;
  const hasMACD = showMACD;
  const hasATR = atrs.length > 0;

  // Generic helpers for arrays
  const addIndicator = (
    setter: React.Dispatch<React.SetStateAction<IndicatorItem[]>>,
    defaultPeriod: number
  ) => {
    setter((prev) => [...prev, { id: Math.random().toString(36).substring(7), period: defaultPeriod }]);
  };

  const removeIndicator = (
    setter: React.Dispatch<React.SetStateAction<IndicatorItem[]>>,
    idToRemove: string
  ) => {
    setter((prev) => prev.filter((i) => i.id !== idToRemove));
  };

  const updateIndicator = (
    setter: React.Dispatch<React.SetStateAction<IndicatorItem[]>>,
    idToUpdate: string,
    newPeriod: number
  ) => {
    setter((prev) =>
      prev.map((i) => (i.id === idToUpdate ? { ...i, period: newPeriod } : i))
    );
  };

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
    const smaColors = ["#f59e0b", "#d97706", "#b45309", "#78350f"];
    smas.forEach((sma, idx) => {
      const smaData = calculateSMA(candles, sma.period);
      if (smaData.length > 0) {
        const series = chart.addSeries(LineSeries, { color: smaColors[idx % smaColors.length], lineWidth: 2 });
        series.setData(smaData);
      }
    });

    const emaColors = ["#a855f7", "#9333ea", "#7e22ce", "#581c87"];
    emas.forEach((ema, idx) => {
      const emaData = calculateEMA(candles, ema.period);
      if (emaData.length > 0) {
        const series = chart.addSeries(LineSeries, { color: emaColors[idx % emaColors.length], lineWidth: 2 });
        series.setData(emaData);
      }
    });

    if (showVWAP) {
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
      const rsiColors = ["#3b82f6", "#2563eb", "#1d4ed8", "#1e3a8a"];

      let boundsCreated = false;
      rsis.forEach((rsi, idx) => {
        const rsiData = calculateRSI(candles, rsi.period);
        if (rsiData.length > 0) {
          const rsiSeries = rsiChart.addSeries(LineSeries, {
            color: rsiColors[idx % rsiColors.length],
            lineWidth: 2,
          });
          rsiSeries.setData(rsiData);
          if (!boundsCreated) {
            rsiSeries.createPriceLine({ price: 70, color: "#ef4444", lineWidth: 1, lineStyle: 2 });
            rsiSeries.createPriceLine({ price: 30, color: "#10b981", lineWidth: 1, lineStyle: 2 });
            boundsCreated = true;
          }
        }
      });
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
      const atrColors = ["#8b5cf6", "#7c3aed", "#6d28d9", "#4c1d95"];

      atrs.forEach((atr, idx) => {
        const atrData = calculateATR(candles, atr.period);
        if (atrData.length > 0) {
          const atrSeries = atrChart.addSeries(LineSeries, {
            color: atrColors[idx % atrColors.length],
            lineWidth: 2,
          });
          atrSeries.setData(atrData);
        }
      });
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
  }, [candles, trades, equity, smas, emas, rsis, atrs, showMACD, showVWAP, hasRSI, hasMACD, hasATR]);

  return (
    <div className="bg-white rounded-lg border border-[var(--border)] overflow-hidden">

      {/* TOOLBAR */}
      <div className="px-4 py-2 border-b border-[var(--border)] flex flex-wrap items-center justify-between gap-3 bg-gray-50">
        <div className="flex items-center gap-3">
          <span className="font-semibold text-sm">{ticker}</span>
          <span className="text-xs text-[var(--muted)]">{date}</span>
          <span className="text-xs px-1.5 py-0.5 bg-gray-200 rounded text-gray-700">1m</span>
        </div>

        <div className="flex flex-wrap items-center gap-2 text-xs">
          {/* SMA */}
          <div className="flex items-center gap-1 bg-white border border-gray-300 rounded overflow-hidden">
            <button
              onClick={() => (smas.length === 0 ? addIndicator(setSmas, 20) : setSmas([]))}
              className={`px-2 py-1 font-medium transition-colors ${smas.length > 0 ? "bg-amber-100 text-amber-800" : "text-gray-600 hover:bg-gray-100"}`}
            >
              SMA
            </button>
            {smas.map((sma) => (
              <div key={sma.id} className="flex items-center bg-amber-50 pl-1">
                <input
                  type="number"
                  value={sma.period}
                  onChange={(e) => updateIndicator(setSmas, sma.id, Number(e.target.value))}
                  className="w-10 bg-transparent text-amber-900 outline-none"
                  min={1}
                />
                <button onClick={() => removeIndicator(setSmas, sma.id)} className="px-1 text-amber-500 hover:text-amber-700">×</button>
              </div>
            ))}
            {smas.length > 0 && (
              <button onClick={() => addIndicator(setSmas, 50)} className="px-1.5 py-1 text-amber-600 hover:bg-amber-100 border-l border-gray-200">+</button>
            )}
          </div>

          {/* EMA */}
          <div className="flex items-center gap-1 bg-white border border-gray-300 rounded overflow-hidden">
            <button
              onClick={() => (emas.length === 0 ? addIndicator(setEmas, 20) : setEmas([]))}
              className={`px-2 py-1 font-medium transition-colors ${emas.length > 0 ? "bg-purple-100 text-purple-800" : "text-gray-600 hover:bg-gray-100"}`}
            >
              EMA
            </button>
            {emas.map((ema) => (
              <div key={ema.id} className="flex items-center bg-purple-50 pl-1">
                <input
                  type="number"
                  value={ema.period}
                  onChange={(e) => updateIndicator(setEmas, ema.id, Number(e.target.value))}
                  className="w-10 bg-transparent text-purple-900 outline-none"
                  min={1}
                />
                <button onClick={() => removeIndicator(setEmas, ema.id)} className="px-1 text-purple-500 hover:text-purple-700">×</button>
              </div>
            ))}
            {emas.length > 0 && (
              <button onClick={() => addIndicator(setEmas, 50)} className="px-1.5 py-1 text-purple-600 hover:bg-purple-100 border-l border-gray-200">+</button>
            )}
          </div>

          {/* RSI */}
          <div className="flex items-center gap-1 bg-white border border-gray-300 rounded overflow-hidden">
            <button
              onClick={() => (rsis.length === 0 ? addIndicator(setRsis, 14) : setRsis([]))}
              className={`px-2 py-1 font-medium transition-colors ${rsis.length > 0 ? "bg-blue-100 text-blue-800" : "text-gray-600 hover:bg-gray-100"}`}
            >
              RSI
            </button>
            {rsis.map((rsi) => (
              <div key={rsi.id} className="flex items-center bg-blue-50 pl-1">
                <input
                  type="number"
                  value={rsi.period}
                  onChange={(e) => updateIndicator(setRsis, rsi.id, Number(e.target.value))}
                  className="w-10 bg-transparent text-blue-900 outline-none"
                  min={1}
                />
                <button onClick={() => removeIndicator(setRsis, rsi.id)} className="px-1 text-blue-500 hover:text-blue-700">×</button>
              </div>
            ))}
            {rsis.length > 0 && (
              <button onClick={() => addIndicator(setRsis, 14)} className="px-1.5 py-1 text-blue-600 hover:bg-blue-100 border-l border-gray-200">+</button>
            )}
          </div>

          {/* MACD */}
          <button
            onClick={() => setShowMACD(!showMACD)}
            className={`px-2 py-1 border rounded font-medium transition-colors ${showMACD ? "border-blue-500 bg-blue-50 text-blue-700" : "border-gray-300 bg-white text-gray-600 hover:bg-gray-100"}`}
          >
            MACD
          </button>

          {/* ATR */}
          <div className="flex items-center gap-1 bg-white border border-gray-300 rounded overflow-hidden">
            <button
              onClick={() => (atrs.length === 0 ? addIndicator(setAtrs, 14) : setAtrs([]))}
              className={`px-2 py-1 font-medium transition-colors ${atrs.length > 0 ? "bg-violet-100 text-violet-800" : "text-gray-600 hover:bg-gray-100"}`}
            >
              ATR
            </button>
            {atrs.map((atr) => (
              <div key={atr.id} className="flex items-center bg-violet-50 pl-1">
                <input
                  type="number"
                  value={atr.period}
                  onChange={(e) => updateIndicator(setAtrs, atr.id, Number(e.target.value))}
                  className="w-10 bg-transparent text-violet-900 outline-none"
                  min={1}
                />
                <button onClick={() => removeIndicator(setAtrs, atr.id)} className="px-1 text-violet-500 hover:text-violet-700">×</button>
              </div>
            ))}
            {atrs.length > 0 && (
              <button onClick={() => addIndicator(setAtrs, 14)} className="px-1.5 py-1 text-violet-600 hover:bg-violet-100 border-l border-gray-200">+</button>
            )}
          </div>

          {/* VWAP */}
          <button
            onClick={() => setShowVWAP(!showVWAP)}
            className={`px-2 py-1 border rounded font-medium transition-colors ${showVWAP ? "border-pink-500 bg-pink-50 text-pink-700" : "border-gray-300 bg-white text-gray-600 hover:bg-gray-100"}`}
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
          <div className="px-3 py-0.5 bg-gray-50 text-[10px] font-semibold text-gray-500 tracking-wider flex items-center gap-1">
            RSI {rsis.map(r => <span key={r.id} className="bg-blue-100 text-blue-700 px-1 rounded">{r.period}</span>)}
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
          <div className="px-3 py-0.5 bg-gray-50 text-[10px] font-semibold text-gray-500 tracking-wider flex items-center gap-1">
            ATR {atrs.map(a => <span key={a.id} className="bg-violet-100 text-violet-700 px-1 rounded">{a.period}</span>)}
          </div>
          <div ref={atrContainerRef} style={{ width: "100%", height: "120px" }} />
        </div>
      )}
    </div>
  );
}
