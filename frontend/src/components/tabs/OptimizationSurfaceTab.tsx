"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import dynamic from "next/dynamic";
import {
  fetchOptimizationParams,
  runOptimizationSurface,
  fetchOptimizationProgress,
  type OptimizationParam,
  type OptimizationResult,
  type OptimizationParamConfig,
} from "@/lib/api";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const Plot = dynamic(
  async () => {
    // @ts-ignore
    const Plotly = await import("plotly.js-dist-min");
    // @ts-ignore
    const factory = await import("react-plotly.js/factory");
    const createPlotComponent = (factory as any).default;
    return { default: createPlotComponent(Plotly) };
  },
  { ssr: false }
) as any;

const METRIC_OPTIONS = [
  { value: "sharpe", label: "Sharpe Ratio" },
  { value: "total_return", label: "Total Return %" },
  { value: "max_drawdown", label: "Max Drawdown" },
  { value: "profit_factor", label: "Profit Factor" },
  { value: "win_rate", label: "Win Rate %" },
  { value: "expectancy", label: "Esperanza (EV)" },
  { value: "calmar", label: "Calmar Ratio" },
  { value: "sortino", label: "Sortino Ratio" },
  { value: "dd_return", label: "DD / Return" },
];

interface OptimizationSurfaceTabProps {
  strategyId: string;
  datasetId: string;
  isDarkMode?: boolean;
  backtestParams?: Record<string, unknown>;
}

export default function OptimizationSurfaceTab({
  strategyId,
  datasetId,
  isDarkMode = false,
  backtestParams = {},
}: OptimizationSurfaceTabProps) {
  const [params, setParams] = useState<OptimizationParam[]>([]);
  const [strategyName, setStrategyName] = useState("");
  const [loading, setLoading] = useState(false);
  const [loadingParams, setLoadingParams] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<OptimizationResult | null>(null);
  const [progress, setProgress] = useState<number>(0);

  // Config state
  const [mode, setMode] = useState<"2D" | "3D">("2D");
  const [metric, setMetric] = useState("sharpe");
  const [paramX, setParamX] = useState("");
  const [paramY, setParamY] = useState("");
  const [gridSteps, setGridSteps] = useState(10);

  // Range state per axis
  const [rangeX, setRangeX] = useState<[number, number]>([0, 20]);
  const [rangeY, setRangeY] = useState<[number, number]>([0, 20]);

  // Load parameters when strategy changes
  useEffect(() => {
    if (!strategyId) return;
    setLoadingParams(true);
    setError(null);
    fetchOptimizationParams(strategyId)
      .then((res) => {
        setParams(res.parameters);
        setStrategyName(res.strategy_name);
        if (res.parameters.length >= 2) {
          setParamX(res.parameters[0].id);
          setParamY(res.parameters[1].id);
          setRangeX([res.parameters[0].min, res.parameters[0].max]);
          setRangeY([res.parameters[1].min, res.parameters[1].max]);
        }
      })
      .catch(() => setError("Error loading strategy parameters"))
      .finally(() => setLoadingParams(false));
  }, [strategyId]);

  // Update ranges when param selection changes
  const getParamById = useCallback(
    (id: string) => params.find((p) => p.id === id),
    [params]
  );

  useEffect(() => {
    const p = getParamById(paramX);
    if (p) setRangeX([p.min, p.max]);
  }, [paramX, getParamById]);

  useEffect(() => {
    const p = getParamById(paramY);
    if (p) setRangeY([p.min, p.max]);
  }, [paramY, getParamById]);

  const handleRun = async () => {
    if (!paramX || !paramY) return;
    setLoading(true);
    setError(null);
    setResult(null);
    setProgress(0);

    const taskId = `opt_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

    const pX = getParamById(paramX);
    const pY = getParamById(paramY);
    if (!pX || !pY) {
      setLoading(false);
      return;
    }

    const configs: OptimizationParamConfig[] = [
      { id: pX.id, label: pX.label, path: pX.path, min: rangeX[0], max: rangeX[1], steps: gridSteps },
      { id: pY.id, label: pY.label, path: pY.path, min: rangeY[0], max: rangeY[1], steps: gridSteps },
    ];

    // Start polling progress
    const pollInterval = setInterval(async () => {
      try {
        const p = await fetchOptimizationProgress(taskId);
        setProgress(p);
      } catch (e) {
        console.warn("Error polling progress:", e);
      }
    }, 500);

    try {
      const data = await runOptimizationSurface({
        strategy_id: strategyId,
        dataset_id: datasetId,
        metric,
        param_configs: configs,
        task_id: taskId,
        ...backtestParams,
      });
      setResult(data);
    } catch (err: unknown) {
      const msg =
        err && typeof err === "object" && "message" in err
          ? (err as { message: string }).message
          : "Error en la optimización";
      setError(msg);
    } finally {
      clearInterval(pollInterval);
      setLoading(false);
    }
  };

  // Plotly data
  const plotData = useMemo(() => {
    if (!result) return null;
    const p = result.params;
    const metricLabel = METRIC_OPTIONS.find((m) => m.value === result.metric)?.label || result.metric;

    const bg = isDarkMode ? "#0f172a" : "#ffffff";
    const fg = isDarkMode ? "#e2e8f0" : "#1e293b";
    const gridColor = isDarkMode ? "#1e293b" : "#e2e8f0";

    if (mode === "2D" && p.length === 2) {
      const z = result.grid;
      const x = p[0].values;
      const y = p[1].values;

      return {
        data: [
          {
            z,
            x,
            y,
            type: "contour" as const,
            colorscale: "Viridis",
            contours: { coloring: "heatmap" as const, showlabels: true },
            colorbar: {
              title: { text: metricLabel, font: { color: fg, size: 11 } },
              tickfont: { color: fg, size: 10 },
            },
            hovertemplate:
              `${p[0].label}: %{x:.2f}<br>${p[1].label}: %{y:.2f}<br>${metricLabel}: %{z:.4f}<extra></extra>`,
          },
        ],
        layout: {
          paper_bgcolor: bg,
          plot_bgcolor: bg,
          font: { color: fg, family: "Inter, system-ui, sans-serif" },
          xaxis: { title: { text: p[0].label }, gridcolor: gridColor, color: fg },
          yaxis: { title: { text: p[1].label }, gridcolor: gridColor, color: fg },
          margin: { l: 60, r: 20, t: 30, b: 60 },
          autosize: true,
        },
      };
    }

    if (mode === "3D" && p.length === 2) {
      // 3D surface
      // For 3D surface, replace nulls to avoid WebGL crashes (uniformMatrix4fv error)
      const rawZ = result.grid as (number | null)[][];
      const validVals = rawZ.flat().filter((v): v is number => v !== null && !isNaN(v));
      const minVal = validVals.length > 0 ? Math.min(...validVals) : 0;
      const z = rawZ.map((row) => row.map((v) => (v === null ? minVal : v)));

      const x = p[0].values;
      const y = p[1].values;

      return {
        data: [
          {
            z,
            x,
            y,
            type: "surface" as const,
            colorscale: "Viridis",
            colorbar: {
              title: { text: metricLabel, font: { color: fg, size: 11 } },
              tickfont: { color: fg, size: 10 },
            },
            hovertemplate:
              `${p[0].label}: %{x:.2f}<br>${p[1].label}: %{y:.2f}<br>${metricLabel}: %{z:.4f}<extra></extra>`,
            lighting: { ambient: 0.6, diffuse: 0.5, specular: 0.3, roughness: 0.8 },
          },
        ],
        layout: {
          paper_bgcolor: bg,
          plot_bgcolor: bg,
          font: { color: fg, family: "Inter, system-ui, sans-serif" },
          scene: {
            xaxis: { title: { text: p[0].label }, gridcolor: gridColor, color: fg, backgroundcolor: bg },
            yaxis: { title: { text: p[1].label }, gridcolor: gridColor, color: fg, backgroundcolor: bg },
            zaxis: { title: { text: metricLabel }, gridcolor: gridColor, color: fg, backgroundcolor: bg },
            bgcolor: bg,
          },
          margin: { l: 0, r: 0, t: 30, b: 0 },
          autosize: true,
        },
      };
    }

    return null;
  }, [result, mode, isDarkMode]);

  const pa = result?.plateau_analysis;

  if (!strategyId || !datasetId) {
    return (
      <div className="flex items-center justify-center h-40">
        <p className="text-sm text-[var(--muted)]">
          Ejecuta un backtest para acceder a la Optimization Surface
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-[var(--foreground)]">
            Optimization Surface
          </h3>
          {strategyName && (
            <p className="text-xs text-[var(--muted)]">Estrategia: {strategyName}</p>
          )}
        </div>
      </div>

      {/* Configuration */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3 p-3 rounded-lg border border-[var(--border)] bg-[var(--sidebar-bg)]">
        {/* Mode toggle */}
        <div>
          <label className="text-xs text-[var(--muted)] block mb-1">Modo</label>
          <div className="flex rounded-md overflow-hidden border border-[var(--border)]">
            {(["2D", "3D"] as const).map((m) => (
              <button
                key={m}
                onClick={() => setMode(m)}
                className={`flex-1 px-3 py-1.5 text-xs font-medium transition-colors ${
                  mode === m
                    ? "bg-[var(--accent)] text-white"
                    : "bg-[var(--card-bg)] text-[var(--muted)] hover:text-[var(--foreground)]"
                }`}
              >
                {m}
              </button>
            ))}
          </div>
        </div>

        {/* Metric */}
        <div>
          <label className="text-xs text-[var(--muted)] block mb-1">Métrica objetivo</label>
          <select
            value={metric}
            onChange={(e) => setMetric(e.target.value)}
            className="w-full px-2 py-1.5 text-xs border border-[var(--border)] rounded-md bg-[var(--card-bg)] text-[var(--foreground)] focus:outline-none focus:ring-1 focus:ring-[var(--accent)]"
          >
            {METRIC_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>

        {/* Param X */}
        <div>
          <label className="text-xs text-[var(--muted)] block mb-1">Eje X</label>
          <select
            value={paramX}
            onChange={(e) => setParamX(e.target.value)}
            className="w-full px-2 py-1.5 text-xs border border-[var(--border)] rounded-md bg-[var(--card-bg)] text-[var(--foreground)] focus:outline-none focus:ring-1 focus:ring-[var(--accent)]"
          >
            {params.filter((p) => p.id !== paramY).map((p) => (
              <option key={p.id} value={p.id}>{p.label}</option>
            ))}
          </select>
        </div>

        {/* Param Y */}
        <div>
          <label className="text-xs text-[var(--muted)] block mb-1">Eje Y</label>
          <select
            value={paramY}
            onChange={(e) => setParamY(e.target.value)}
            className="w-full px-2 py-1.5 text-xs border border-[var(--border)] rounded-md bg-[var(--card-bg)] text-[var(--foreground)] focus:outline-none focus:ring-1 focus:ring-[var(--accent)]"
          >
            {params.filter((p) => p.id !== paramX).map((p) => (
              <option key={p.id} value={p.id}>{p.label}</option>
            ))}
          </select>
        </div>

        {/* Grid steps */}
        <div>
          <label className="text-xs text-[var(--muted)] block mb-1">Resolución</label>
          <select
            value={gridSteps}
            onChange={(e) => setGridSteps(Number(e.target.value))}
            className="w-full px-2 py-1.5 text-xs border border-[var(--border)] rounded-md bg-[var(--card-bg)] text-[var(--foreground)] focus:outline-none focus:ring-1 focus:ring-[var(--accent)]"
          >
            {[5, 8, 10, 12, 15, 20].map((n) => (
              <option key={n} value={n}>{n}×{n} ({n*n} pts)</option>
            ))}
          </select>
        </div>

        {/* Run button */}
        <div className="flex items-end">
          <button
            onClick={handleRun}
            disabled={loading || !paramX || !paramY}
            className="w-full px-4 py-1.5 text-xs font-medium rounded-md bg-[var(--accent)] text-white hover:bg-[var(--accent-hover)] disabled:opacity-50 transition-colors"
          >
            {loading ? "Calculando..." : "Ejecutar"}
          </button>
        </div>
      </div>

      {/* Range sliders */}
      {(paramX || paramY) && (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 p-3 rounded-lg border border-[var(--border)] bg-[var(--sidebar-bg)]">
          {paramX && (
            <RangeSlider
              label={getParamById(paramX)?.label || "X"}
              value={rangeX}
              onChange={setRangeX}
              param={getParamById(paramX)}
            />
          )}
          {paramY && (
            <RangeSlider
              label={getParamById(paramY)?.label || "Y"}
              value={rangeY}
              onChange={setRangeY}
              param={getParamById(paramY)}
            />
          )}
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900 rounded-md p-3">
          <p className="text-sm text-red-700 dark:text-red-400">{error}</p>
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center h-64 border border-[var(--border)] rounded-lg bg-[var(--card-bg)] shadow-sm">
          <div className="text-center space-y-4 w-full max-w-xs px-6">
            <svg className="animate-spin h-8 w-8 text-[var(--accent)] mx-auto" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            <div className="space-y-3">
              <div className="flex justify-between items-end mb-1">
                <p className="text-sm font-semibold text-[var(--foreground)]">
                  Ejecutando optimización
                </p>
                <span className="text-xs font-mono text-[var(--accent)] font-bold">
                  {progress}%
                </span>
              </div>
              <div className="h-2 w-full bg-[var(--sidebar-bg)] rounded-full overflow-hidden border border-[var(--border)]">
                <div 
                  className="h-full bg-[var(--accent)] transition-all duration-300 ease-out shadow-[0_0_10px_var(--accent)]"
                  style={{ width: `${progress}%` }}
                />
              </div>
              <p className="text-[10px] text-[var(--muted)] uppercase tracking-wider">
                Procesando {gridSteps * gridSteps} backtests...
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Results */}
      {result && plotData && !loading && (
        <div className="flex gap-4 flex-col lg:flex-row">
          {/* Chart */}
          <div className="lg:w-2/3 min-h-[500px] flex flex-col border border-[var(--border)] rounded-lg overflow-hidden bg-[var(--card-bg)]">
            <Plot
              data={plotData.data}
              layout={{
                ...plotData.layout,
                autosize: true,
              }}
              config={{
                responsive: true,
                displayModeBar: true,
                displaylogo: false,
                modeBarButtonsToRemove: ["sendDataToCloud", "lasso2d", "select2d"],
              }}
              useResizeHandler
              style={{ width: "100%", flex: 1, minHeight: "500px" }}
            />
          </div>

          {/* Analysis panel */}
          <div className="lg:w-1/3 space-y-3">
            {/* Elapsed */}
            <div className="text-xs text-[var(--muted)] text-right">
              ⏱ {result.elapsed_seconds}s ({result.shape.reduce((a: number, b: number) => a * b, 1)} backtests)
            </div>

            {/* Peak */}
            {pa?.peak && (
              <AnalysisCard
                title="📈 Pico Máximo"
                isDarkMode={isDarkMode}
                items={[
                  { label: "Valor", value: fmt(pa.peak.value) },
                  ...Object.entries(pa.peak.coordinates).map(([k, v]) => ({
                    label: k,
                    value: fmt(v),
                  })),
                ]}
              />
            )}

            {/* Robust Plateau */}
            {pa?.robust_plateau && (
              <AnalysisCard
                title="🏔️ Robust Plateau"
                subtitle="Región de menor sensibilidad a cambios"
                isDarkMode={isDarkMode}
                items={[
                  { label: "Media", value: fmt(pa.robust_plateau.mean_value) },
                  { label: "Desv. Estándar", value: fmt(pa.robust_plateau.std_value) },
                  { label: "Tamaño (celdas)", value: String(pa.robust_plateau.size) },
                  { label: "Profit Factor", value: fmt(pa.robust_plateau.profit_factor) },
                  { label: "DD/Return", value: fmt(pa.robust_plateau.return_dd) },
                  { label: "Total Return %", value: fmt(pa.robust_plateau.total_return) },
                ]}
              />
            )}

            {/* Local Stability */}
            {pa?.local_stability && (
              <AnalysisCard
                title="🎯 Estabilidad Local"
                subtitle="Máximo vecino-promediado (penaliza picos aislados)"
                isDarkMode={isDarkMode}
                items={[
                  { label: "Valor", value: fmt(pa.local_stability.best_value) },
                  ...Object.entries(pa.local_stability.coordinates).map(([k, v]) => ({
                    label: k,
                    value: fmt(v),
                  })),
                  { label: "Profit Factor", value: fmt(pa.local_stability.profit_factor) },
                  { label: "DD/Return", value: fmt(pa.local_stability.return_dd) },
                ]}
              />
            )}

            {/* Robust Center */}
            {pa?.robust_center && (
              <AnalysisCard
                title="🎯 Centro Robusto"
                subtitle="Centro geométrico de la meseta más estable"
                isDarkMode={isDarkMode}
                items={[
                  ...Object.entries(pa.robust_center.coordinates).map(([k, v]) => ({
                    label: k,
                    value: fmt(v),
                  })),
                  {
                    label: "Degradación vs Pico",
                    value: fmt(pa.robust_center.degradation_from_peak),
                    highlight: true,
                  },
                ]}
              />
            )}
          </div>
        </div>
      )}

      {/* Empty state */}
      {loadingParams && (
        <div className="flex items-center justify-center h-40">
          <p className="text-sm text-[var(--muted)] animate-pulse">
            Detectando parámetros en la estrategia...
          </p>
        </div>
      )}

      {!result && !loading && !loadingParams && params.length > 0 && (
        <div className="flex items-center justify-center h-40 border border-dashed border-[var(--border)] rounded-lg">
          <div className="text-center space-y-1">
            <p className="text-sm text-[var(--muted)]">
              Selecciona parámetros y ejecuta la optimización
            </p>
            <p className="text-xs text-[var(--muted)]">
              {params.length} parámetros detectados en la estrategia
            </p>
          </div>
        </div>
      )}

      {!loadingParams && params.length === 0 && (
        <div className="flex items-center justify-center h-40">
          <p className="text-sm text-[var(--muted)]">
            No se detectaron parámetros optimizables en la estrategia
          </p>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function RangeSlider({
  label,
  value,
  onChange,
  param,
}: {
  label: string;
  value: [number, number];
  onChange: (v: [number, number]) => void;
  param?: OptimizationParam;
}) {
  const step = param?.step || 1;
  return (
    <div>
      <label className="text-xs text-[var(--muted)] block mb-1">{label}</label>
      <div className="flex items-center gap-2">
        <input
          type="number"
          value={value[0]}
          step={step}
          onChange={(e) => onChange([Number(e.target.value), value[1]])}
          className="w-20 px-2 py-1 text-xs border border-[var(--border)] rounded bg-[var(--card-bg)] text-[var(--foreground)] focus:outline-none focus:ring-1 focus:ring-[var(--accent)]"
        />
        <span className="text-xs text-[var(--muted)]">→</span>
        <input
          type="number"
          value={value[1]}
          step={step}
          onChange={(e) => onChange([value[0], Number(e.target.value)])}
          className="w-20 px-2 py-1 text-xs border border-[var(--border)] rounded bg-[var(--card-bg)] text-[var(--foreground)] focus:outline-none focus:ring-1 focus:ring-[var(--accent)]"
        />
      </div>
      {param && (
        <p className="text-[10px] text-[var(--muted)] mt-0.5">
          Actual: {param.current_value} | Step: {step}
        </p>
      )}
    </div>
  );
}

function AnalysisCard({
  title,
  subtitle,
  items,
  isDarkMode,
}: {
  title: string;
  subtitle?: string;
  items: { label: string; value: string; highlight?: boolean }[];
  isDarkMode?: boolean;
}) {
  return (
    <div className="p-1 space-y-2">
      <p className="text-xs font-semibold text-[var(--foreground)] mb-0.5">{title}</p>
      {subtitle && (
        <p className="text-[10px] text-[var(--muted)] mb-2">{subtitle}</p>
      )}
      <div className="space-y-1">
        {items.map((item, i) => (
          <div key={i} className="flex justify-between items-center">
            <span className="text-[11px] text-[var(--muted)]">{item.label}</span>
            <span
              className={`text-[11px] font-mono ${
                item.highlight
                  ? "text-amber-500 dark:text-amber-400 font-semibold"
                  : "text-[var(--foreground)]"
              }`}
            >
              {item.value}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function fmt(v: number | null | undefined): string {
  if (v === null || v === undefined) return "—";
  if (Math.abs(v) >= 1000) return v.toLocaleString(undefined, { maximumFractionDigits: 2 });
  if (Math.abs(v) >= 1) return v.toFixed(2);
  return v.toFixed(4);
}
