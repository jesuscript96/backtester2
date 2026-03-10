import axios from "axios";

const api = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api",
  timeout: 300000,
});

export interface Dataset {
  id: string;
  name: string;
  pair_count: number;
  created_at: string;
  min_date?: string;
  max_date?: string;
}

export interface Strategy {
  id: string;
  name: string;
  description: string;
  definition: Record<string, unknown>;
}

export interface TradeRecord {
  ticker: string;
  date: string;
  entry_time: string;
  exit_time: string;
  entry_idx: number;
  exit_idx: number;
  entry_time_epoch: number;
  exit_time_epoch: number;
  entry_price: number;
  exit_price: number;
  pnl: number;
  return_pct: number;
  direction: string;
  status: string;
  size: number;
  mae: number;
  mfe?: number;
  r_multiple: number | null;
  entry_hour: number;
  entry_weekday: number;
}

export interface CandleData {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  vwap?: number | null;
}

export interface EquityPoint {
  time: number;
  value: number;
}

export interface DayCandles {
  ticker: string;
  date: string;
  candles: CandleData[];
}

export interface DayEquity {
  ticker: string;
  date: string;
  equity: EquityPoint[];
}

export interface DayResult {
  ticker: string;
  date: string;
  total_return_pct: number | null;
  max_drawdown_pct: number | null;
  win_rate_pct: number | null;
  total_trades: number;
  profit_factor: number | null;
  sharpe_ratio: number | null;
  sortino_ratio: number | null;
  expectancy: number | null;
  best_trade_pct: number | null;
  worst_trade_pct: number | null;
  init_value: number | null;
  end_value: number | null;
}

export interface AggregateMetrics {
  total_days: number;
  total_trades: number;
  win_rate_pct: number;
  avg_return_per_day_pct: number;
  total_return_pct: number;
  avg_sharpe: number;
  max_drawdown_pct: number;
  avg_profit_factor: number;
  avg_pnl: number;
  total_pnl: number;
  sortino_ratio: number;
  calmar_ratio: number;
  dd_return_ratio: number;
  r_squared: number;
  max_mae: number;
  max_profit_pct: number;
  avg_win: number;
  avg_loss: number;
  max_consecutive_wins: number;
  max_consecutive_losses: number;
  expectancy: number;
  payoff_ratio: number;
  avg_r_per_day: number;
}

export interface GlobalEquityPoint {
  time: number;
  value: number;
}

export interface DrawdownPoint {
  time: number;
  value: number;
}

export interface BacktestResult {
  aggregate_metrics: AggregateMetrics;
  day_results: DayResult[];
  trades: TradeRecord[];
  equity_curves: DayEquity[];
  global_equity: GlobalEquityPoint[];
  global_drawdown: DrawdownPoint[];
}

export interface MonteCarloPercentileCurve {
  time: number;
  value: number;
}

export interface MonteCarloResult {
  percentiles: Record<string, MonteCarloPercentileCurve[]>;
  ruin_probability: number;
  worst_drawdown: number;
  median_drawdown: number;
  final_balance_percentiles: Record<string, number>;
}

export async function runMonteCarlo(params: {
  pnls: number[];
  init_cash: number;
  simulations?: number;
}): Promise<MonteCarloResult> {
  const { data } = await api.post("/montecarlo", params);
  return data;
}

export async function fetchDatasets(): Promise<Dataset[]> {
  const { data } = await api.get("/datasets");
  return data;
}

export async function fetchStrategies(): Promise<Strategy[]> {
  const { data } = await api.get("/strategies");
  return data;
}

export async function runBacktest(params: {
  dataset_id: string;
  strategy_id: string;
  init_cash: number;
  risk_r: number;
  risk_type?: string;     // "FIXED" or "PERCENT"
  size_by_sl?: boolean;   // true if sizing by stop loss distance
  fees: number;
  slippage: number;
  start_date?: string;
  end_date?: string;
  market_sessions?: string[];
  custom_start_time?: string;
  custom_end_time?: string;
  locates_cost?: number;
  look_ahead_prevention?: boolean;
}): Promise<BacktestResult> {
  const { data } = await api.post("/backtest", params);
  return data;
}

export async function fetchDayCandles(
  dataset_id: string,
  ticker: string,
  date: string
): Promise<DayCandles> {
  const { data } = await api.get("/candles", {
    params: { dataset_id, ticker, date },
  });
  return data;
}
