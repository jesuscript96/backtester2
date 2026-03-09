"use client";

import { useState } from "react";
import type { BacktestResult, DayCandles, TradeRecord, EquityPoint } from "@/lib/api";
import PerformanceTab from "@/components/tabs/PerformanceTab";
import CalendarTab from "@/components/tabs/CalendarTab";
import TradesTab from "@/components/tabs/TradesTab";
import ChartsTab from "@/components/tabs/ChartsTab";
import PortfolioTab from "@/components/tabs/PortfolioTab";
import Chart from "@/components/Chart";

const TABS = [
  { id: "performance", label: "Performance" },
  { id: "calendar", label: "Calendar" },
  { id: "trades", label: "Trades" },
  { id: "analysis", label: "Análisis por trade" },
  { id: "charts", label: "Charts" },
  { id: "portfolio", label: "Portfolio" },
] as const;

type TabId = (typeof TABS)[number]["id"];

interface ResultsTabsProps {
  result: BacktestResult;
  initCash: number;
  riskR: number;
  dayCandles: DayCandles | null;
  candlesLoading: boolean;
  currentTrades: TradeRecord[];
  currentEquity: EquityPoint[];
  isDarkMode?: boolean;
}

export default function ResultsTabs({
  result,
  initCash,
  riskR,
  dayCandles,
  candlesLoading,
  currentTrades,
  currentEquity,
  isDarkMode = false,
}: ResultsTabsProps) {
  const [activeTab, setActiveTab] = useState<TabId>("performance");

  return (
    <div className="bg-[var(--card-bg)] rounded-lg border border-[var(--border)] overflow-hidden transition-colors">
      <div className="border-b border-[var(--border)] overflow-x-auto">
        <nav className="flex min-w-max">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-2.5 text-sm font-medium whitespace-nowrap transition-colors
                ${activeTab === tab.id
                  ? "text-[var(--accent)] border-b-2 border-[var(--accent)]"
                  : "text-[var(--muted)] hover:text-[var(--foreground)]"
                }`}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      <div className="p-4">
        {activeTab === "performance" && (
          <PerformanceTab
            dayResults={result.day_results}
            trades={result.trades}
            initCash={initCash}
            riskR={riskR}
            isDarkMode={isDarkMode}
          />
        )}
        {activeTab === "calendar" && (
          <CalendarTab dayResults={result.day_results} trades={result.trades} isDarkMode={isDarkMode} />
        )}
        {activeTab === "trades" && <TradesTab trades={result.trades} />}
        {activeTab === "analysis" && (
          <div>
            {candlesLoading && (
              <div className="flex items-center justify-center p-8">
                <div className="text-center space-y-2">
                  <svg className="animate-spin h-6 w-6 text-[var(--accent)] mx-auto" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  <p className="text-xs text-[var(--muted)]">Cargando chart...</p>
                </div>
              </div>
            )}
            {!candlesLoading && dayCandles && dayCandles.candles.length > 0 && (
              <Chart
                candles={dayCandles.candles}
                trades={currentTrades}
                equity={currentEquity}
                ticker={dayCandles.ticker}
                date={dayCandles.date}
              />
            )}
            {!candlesLoading && (!dayCandles || dayCandles.candles.length === 0) && (
              <p className="text-sm text-[var(--muted)] text-center py-8">
                Selecciona un día en el panel lateral para ver el análisis del trade.
              </p>
            )}
          </div>
        )}
        {activeTab === "charts" && <ChartsTab trades={result.trades} />}
        {activeTab === "portfolio" && (
          <PortfolioTab trades={result.trades} initCash={initCash} />
        )}
      </div>
    </div>
  );
}
