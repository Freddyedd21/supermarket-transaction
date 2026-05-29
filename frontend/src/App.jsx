import React, { useEffect, useMemo, useState } from "react";
import {
  Activity,
  AlertCircle,
  ArrowRight,
  BarChart3,
  CalendarDays,
  ChartNoAxesCombined,
  Grid3X3,
  Package,
  ReceiptText,
  RefreshCw,
  ShoppingBasket,
  Tags,
  Users,
} from "lucide-react";

const API_BASE_URL = import.meta.env.VITE_API_URL ?? "http://127.0.0.1:8000";

const endpoints = {
  kpis: "/api/analytics/kpis",
  topProductos: "/api/analytics/top_productos",
  topClientes: "/api/analytics/top_clientes",
  categorias: "/api/analytics/categorias_rentables",
  serieTiempo: "/api/analytics/serie_tiempo",
  boxplotClientes: "/api/analytics/boxplot_clientes",
  correlacionClientes: "/api/analytics/correlacion_clientes",
};

const initialData = {
  kpis: null,
  topProductos: [],
  topClientes: [],
  categorias: [],
  serieTiempo: [],
};

const initialAnalyticalData = {
  serieTiempo: [],
  boxplotClientes: [],
  correlacionClientes: [],
};

function formatNumber(value) {
  const numericValue = Number(value ?? 0);
  return new Intl.NumberFormat("es-CO").format(numericValue);
}

function formatDate(value) {
  if (!value) return "Sin fecha";

  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return String(value);

  return new Intl.DateTimeFormat("es-CO", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date);
}

function normalizeDate(value) {
  if (!value) return "";
  return String(value).slice(0, 10);
}

async function fetchJson(path) {
  const response = await fetch(`${API_BASE_URL}${path}`);
  if (!response.ok) {
    throw new Error(`Error ${response.status} al consultar ${path}`);
  }
  return response.json();
}

function MetricCard({ icon: Icon, label, value, helper, tone = "blue" }) {
  return (
    <article className={`metric-card metric-card--${tone}`}>
      <div className="metric-card__icon" aria-hidden="true">
        <Icon size={22} />
      </div>
      <div>
        <p className="metric-card__label">{label}</p>
        <strong>{formatNumber(value)}</strong>
        <span>{helper}</span>
      </div>
    </article>
  );
}

function AppNavigation() {
  const path = window.location.pathname;

  return (
    <nav className="app-nav" aria-label="Navegacion principal">
      <a className={path === "/" ? "app-nav__link app-nav__link--active" : "app-nav__link"} href="/">
        Resumen Ejecutivo
      </a>
      <a
        className={path.startsWith("/visualizaciones") ? "app-nav__link app-nav__link--active" : "app-nav__link"}
        href="/visualizaciones"
      >
        Visualizaciones Analiticas
      </a>
    </nav>
  );
}

function HorizontalBarList({
  title,
  subtitle,
  icon: Icon,
  data,
  labelKey,
  valueKey,
  emptyText,
  compact = false,
}) {
  const maxValue = Math.max(...data.map((item) => Number(item[valueKey] ?? 0)), 1);

  return (
    <section className="panel">
      <div className="panel__header">
        <div>
          <p className="eyebrow">{subtitle}</p>
          <h2>{title}</h2>
        </div>
        <Icon className="panel__icon" size={22} aria-hidden="true" />
      </div>

      {data.length === 0 ? (
        <div className="empty-state">{emptyText}</div>
      ) : (
        <div className={compact ? "bar-list bar-list--compact" : "bar-list"}>
          {data.map((item, index) => {
            const value = Number(item[valueKey] ?? 0);
            const label = item[labelKey] ?? `Item ${index + 1}`;
            const width = `${Math.max((value / maxValue) * 100, 4)}%`;

            return (
              <div className="bar-row" key={`${label}-${index}`}>
                <div className="bar-row__meta">
                  <span>{label}</span>
                  <strong>{formatNumber(value)}</strong>
                </div>
                <div className="bar-row__track" aria-hidden="true">
                  <div className="bar-row__fill" style={{ width }} />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

function TimeSeriesChart({ data }) {
  const chartData = useMemo(
    () =>
      data
        .map((item) => ({
          fecha: normalizeDate(item.fecha),
          unidades: Number(item.unidades_vendidas ?? 0),
          transacciones: Number(item.transacciones_diarias ?? 0),
        }))
        .filter((item) => item.fecha)
        .sort((a, b) => a.fecha.localeCompare(b.fecha)),
    [data],
  );

  const { points, areaPoints, maxUnits, firstDate, lastDate } = useMemo(() => {
    if (chartData.length === 0) {
      return {
        points: "",
        areaPoints: "",
        maxUnits: 0,
        firstDate: "",
        lastDate: "",
      };
    }

    const width = 720;
    const height = 220;
    const paddingX = 18;
    const paddingY = 18;
    const maxY = Math.max(...chartData.map((item) => item.unidades), 1);
    const usableWidth = width - paddingX * 2;
    const usableHeight = height - paddingY * 2;

    const linePoints = chartData
      .map((item, index) => {
        const x =
          paddingX +
          (chartData.length === 1 ? usableWidth / 2 : (index / (chartData.length - 1)) * usableWidth);
        const y = paddingY + usableHeight - (item.unidades / maxY) * usableHeight;
        return `${x},${y}`;
      })
      .join(" ");

    return {
      points: linePoints,
      areaPoints: `${paddingX},${height - paddingY} ${linePoints} ${width - paddingX},${height - paddingY}`,
      maxUnits: maxY,
      firstDate: chartData[0].fecha,
      lastDate: chartData[chartData.length - 1].fecha,
    };
  }, [chartData]);

  return (
    <section className="panel panel--wide">
      <div className="panel__header">
        <div>
          <p className="eyebrow">Comportamiento temporal</p>
          <h2>Ventas por día</h2>
        </div>
        <CalendarDays className="panel__icon" size={22} aria-hidden="true" />
      </div>

      {chartData.length === 0 ? (
        <div className="empty-state">No hay datos de serie de tiempo disponibles.</div>
      ) : (
        <>
          <div className="line-chart">
            <svg viewBox="0 0 720 220" role="img" aria-label="Serie de tiempo de unidades vendidas por día">
              <defs>
                <linearGradient id="areaGradient" x1="0" x2="0" y1="0" y2="1">
                  <stop offset="0%" stopColor="#2a9d8f" stopOpacity="0.22" />
                  <stop offset="100%" stopColor="#2a9d8f" stopOpacity="0.02" />
                </linearGradient>
              </defs>
              <line x1="18" x2="702" y1="202" y2="202" className="chart-axis" />
              <line x1="18" x2="18" y1="18" y2="202" className="chart-axis" />
              <polyline points={areaPoints} className="chart-area" />
              <polyline points={points} className="chart-line" />
            </svg>
          </div>
          <div className="chart-summary">
            <span>{formatDate(firstDate)}</span>
            <strong>Maximo diario: {formatNumber(maxUnits)} unidades</strong>
            <span>{formatDate(lastDate)}</span>
          </div>
        </>
      )}
    </section>
  );
}

function percentile(sortedValues, position) {
  if (sortedValues.length === 0) return 0;

  const index = (sortedValues.length - 1) * position;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  const weight = index - lower;

  return sortedValues[lower] * (1 - weight) + sortedValues[upper] * weight;
}

function BoxplotChart({ data }) {
  const stats = useMemo(() => {
    const values = data
      .map((item) => Number(item.cantidad_total_cliente ?? 0))
      .filter((value) => Number.isFinite(value))
      .sort((a, b) => a - b);

    if (values.length === 0) return null;

    const q1 = percentile(values, 0.25);
    const median = percentile(values, 0.5);
    const q3 = percentile(values, 0.75);
    const iqr = q3 - q1;
    const lowerFence = Math.max(values[0], q1 - 1.5 * iqr);
    const upperFence = Math.min(values[values.length - 1], q3 + 1.5 * iqr);
    const outliers = values.filter((value) => value < lowerFence || value > upperFence).length;
    const maxScale = Math.max(upperFence, q3, median, 1);
    const toX = (value) => 48 + (value / maxScale) * 624;

    return {
      min: values[0],
      q1,
      median,
      q3,
      max: values[values.length - 1],
      lowerFence,
      upperFence,
      outliers,
      total: values.length,
      x: {
        lower: toX(lowerFence),
        q1: toX(q1),
        median: toX(median),
        q3: toX(q3),
        upper: toX(upperFence),
      },
    };
  }, [data]);

  return (
    <section className="panel panel--wide">
      <div className="panel__header">
        <div>
          <p className="eyebrow">Distribucion</p>
          <h2>Boxplot de volumen por cliente</h2>
        </div>
        <ChartNoAxesCombined className="panel__icon" size={22} aria-hidden="true" />
      </div>

      {!stats ? (
        <div className="empty-state">No hay datos de boxplot disponibles.</div>
      ) : (
        <>
          <div className="boxplot-chart">
            <svg viewBox="0 0 720 180" role="img" aria-label="Boxplot de unidades compradas por cliente">
              <line x1="48" x2="672" y1="92" y2="92" className="boxplot-axis" />
              <line x1={stats.x.lower} x2={stats.x.q1} y1="92" y2="92" className="boxplot-whisker" />
              <line x1={stats.x.q3} x2={stats.x.upper} y1="92" y2="92" className="boxplot-whisker" />
              <line x1={stats.x.lower} x2={stats.x.lower} y1="68" y2="116" className="boxplot-cap" />
              <line x1={stats.x.upper} x2={stats.x.upper} y1="68" y2="116" className="boxplot-cap" />
              <rect
                x={stats.x.q1}
                y="54"
                width={Math.max(stats.x.q3 - stats.x.q1, 2)}
                height="76"
                rx="6"
                className="boxplot-box"
              />
              <line x1={stats.x.median} x2={stats.x.median} y1="48" y2="136" className="boxplot-median" />
            </svg>
          </div>
          <div className="stat-strip">
            <span>Q1: {formatNumber(Math.round(stats.q1))}</span>
            <strong>Mediana: {formatNumber(Math.round(stats.median))}</strong>
            <span>Q3: {formatNumber(Math.round(stats.q3))}</span>
            <span>Atipicos: {formatNumber(stats.outliers)}</span>
          </div>
        </>
      )}
    </section>
  );
}

function HeatmapCorrelation({ data }) {
  const variables = useMemo(() => {
    return [...new Set(data.flatMap((item) => [item.variable_x, item.variable_y]))].filter(Boolean);
  }, [data]);

  const lookup = useMemo(() => {
    const map = new Map();
    for (const item of data) {
      map.set(`${item.variable_y}__${item.variable_x}`, Number(item.correlacion ?? 0));
    }
    return map;
  }, [data]);

  function colorFor(value) {
    const alpha = Math.min(Math.abs(value), 1);
    if (value >= 0) return `rgba(42, 157, 143, ${0.14 + alpha * 0.76})`;
    return `rgba(179, 74, 56, ${0.14 + alpha * 0.76})`;
  }

  return (
    <section className="panel panel--wide">
      <div className="panel__header">
        <div>
          <p className="eyebrow">Relaciones numericas</p>
          <h2>Heatmap de correlacion</h2>
        </div>
        <Grid3X3 className="panel__icon" size={22} aria-hidden="true" />
      </div>

      {variables.length === 0 ? (
        <div className="empty-state">No hay metricas de correlacion disponibles.</div>
      ) : (
        <div className="heatmap" style={{ "--heatmap-size": variables.length }}>
          <div className="heatmap__corner" />
          {variables.map((variable) => (
            <div className="heatmap__label heatmap__label--top" key={`top-${variable}`}>
              {variable}
            </div>
          ))}
          {variables.map((row) => (
            <React.Fragment key={row}>
              <div className="heatmap__label heatmap__label--side">{row}</div>
              {variables.map((column) => {
                const value = lookup.get(`${row}__${column}`) ?? 0;
                return (
                  <div className="heatmap__cell" key={`${row}-${column}`} style={{ backgroundColor: colorFor(value) }}>
                    {value.toFixed(2)}
                  </div>
                );
              })}
            </React.Fragment>
          ))}
        </div>
      )}
    </section>
  );
}

function ExecutiveInsight({ serieTiempo, categorias }) {
  const peakDay = useMemo(() => {
    return [...serieTiempo].sort(
      (a, b) => Number(b.transacciones_diarias ?? 0) - Number(a.transacciones_diarias ?? 0),
    )[0];
  }, [serieTiempo]);

  const topCategory = categorias[0];

  return (
    <section className="panel panel--insight">
      <div className="panel__header">
        <div>
          <p className="eyebrow">Lectura ejecutiva</p>
          <h2>Hallazgos clave</h2>
        </div>
        <BarChart3 className="panel__icon" size={22} aria-hidden="true" />
      </div>

      <div className="insight-list">
        <div>
          <span>Día pico de compra</span>
          <strong>{peakDay ? formatDate(normalizeDate(peakDay.fecha)) : "Sin datos"}</strong>
          <p>
            {peakDay
              ? `${formatNumber(peakDay.transacciones_diarias)} transacciones registradas.`
              : "La serie temporal no tiene registros para calcular el pico."}
          </p>
        </div>
        <div>
          <span>Categoría con mayor volumen relativo</span>
          <strong>{topCategory?.nombre_categoria ?? "Sin datos"}</strong>
          <p>
            {topCategory
              ? `${formatNumber(topCategory.unidades_vendidas)} unidades vendidas.`
              : "No hay categorías agregadas para comparar."}
          </p>
        </div>
      </div>
    </section>
  );
}

export default function App() {
  const path = window.location.pathname;

  if (path.startsWith("/visualizaciones")) {
    return <AnalyticalVisualizationsPage />;
  }

  return <ExecutiveDashboard />;
}

function ExecutiveDashboard() {
  const [data, setData] = useState(initialData);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function loadDashboard() {
    setLoading(true);
    setError("");

    try {
      const [kpis, topProductos, topClientes, categorias, serieTiempo] = await Promise.all([
        fetchJson(endpoints.kpis),
        fetchJson(endpoints.topProductos),
        fetchJson(endpoints.topClientes),
        fetchJson(endpoints.categorias),
        fetchJson(endpoints.serieTiempo),
      ]);

      setData({
        kpis,
        topProductos,
        topClientes,
        categorias: categorias.filter((item) => item.nombre_categoria !== "Producto sin Categoría"),
        serieTiempo,
      });
    } catch (requestError) {
      setError(requestError.message);
      setData(initialData);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadDashboard();
  }, []);

  const peakDays = useMemo(() => {
    return [...data.serieTiempo]
      .sort((a, b) => Number(b.transacciones_diarias ?? 0) - Number(a.transacciones_diarias ?? 0))
      .slice(0, 7)
      .map((item) => ({
        ...item,
        fecha_corta: formatDate(normalizeDate(item.fecha)),
      }));
  }, [data.serieTiempo]);

  return (
    <main className="app-shell">
      <AppNavigation />
      <header className="dashboard-header">
        <div>
          <p className="eyebrow">Analitica descriptiva de supermercado</p>
          <h1>Resumen Ejecutivo</h1>
          <p className="dashboard-header__copy">
            Indicadores principales de volumen, frecuencia de compra, productos destacados y comportamiento diario.
          </p>
        </div>
        <button className="refresh-button" onClick={loadDashboard} disabled={loading} type="button">
          <RefreshCw size={18} aria-hidden="true" />
          {loading ? "Actualizando" : "Actualizar"}
        </button>
      </header>

      {error ? (
        <section className="alert" role="alert">
          <AlertCircle size={20} aria-hidden="true" />
          <div>
            <strong>No se pudo cargar el resumen ejecutivo</strong>
            <p>
              {error}. Verifica que FastAPI este corriendo en {API_BASE_URL} y que las tablas ya existan en PostgreSQL.
            </p>
          </div>
        </section>
      ) : null}

      <section className="metric-grid" aria-label="Indicadores globales">
        <MetricCard
          icon={ShoppingBasket}
          label="Total de ventas"
          value={data.kpis?.total_unidades_vendidas}
          helper="Unidades vendidas"
          tone="green"
        />
        <MetricCard
          icon={ReceiptText}
          label="Transacciones"
          value={data.kpis?.total_transacciones}
          helper="Tickets registrados"
          tone="blue"
        />
        <MetricCard
          icon={Package}
          label="Productos en ranking"
          value={data.topProductos.length}
          helper="Top por volumen"
          tone="amber"
        />
        <MetricCard
          icon={Tags}
          label="Categorias analizadas"
          value={data.categorias.length}
          helper="Volumen relativo"
          tone="rose"
        />
      </section>

      {loading ? (
        <section className="loading-panel">
          <RefreshCw size={22} aria-hidden="true" />
          Cargando datos del resumen ejecutivo...
        </section>
      ) : (
        <>
          <section className="dashboard-grid">
            <HorizontalBarList
              title="Top 10 productos"
              subtitle="Productos mas comprados"
              icon={Package}
              data={data.topProductos}
              labelKey="id_producto"
              valueKey="unidades_vendidas"
              emptyText="No hay datos de productos disponibles."
            />
            <HorizontalBarList
              title="Top 10 clientes"
              subtitle="Mayor volumen de compra"
              icon={Users}
              data={data.topClientes}
              labelKey="cliente_id"
              valueKey="volumen_compra"
              emptyText="No hay datos de clientes disponibles."
            />
          </section>

          <section className="dashboard-grid dashboard-grid--wide-left">
            <TimeSeriesChart data={data.serieTiempo} />
            <ExecutiveInsight serieTiempo={data.serieTiempo} categorias={data.categorias} />
          </section>

          <section className="dashboard-grid">
            <HorizontalBarList
              title="Dias pico de compra"
              subtitle="Transacciones diarias"
              icon={CalendarDays}
              data={peakDays}
              labelKey="fecha_corta"
              valueKey="transacciones_diarias"
              emptyText="No hay datos diarios disponibles."
              compact
            />
            <HorizontalBarList
              title="Categorias mas rentables"
              subtitle="Rentabilidad inferida por volumen"
              icon={Tags}
              data={data.categorias}
              labelKey="nombre_categoria"
              valueKey="unidades_vendidas"
              emptyText="No hay datos de categorias disponibles."
              compact
            />
          </section>
        </>
      )}
    </main>
  );
}

function AnalyticalVisualizationsPage() {
  const [data, setData] = useState(initialAnalyticalData);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function loadVisualizations() {
    setLoading(true);
    setError("");

    try {
      const [serieTiempo, boxplotClientes, correlacionClientes] = await Promise.all([
        fetchJson(endpoints.serieTiempo),
        fetchJson(endpoints.boxplotClientes),
        fetchJson(endpoints.correlacionClientes),
      ]);

      setData({
        serieTiempo,
        boxplotClientes,
        correlacionClientes,
      });
    } catch (requestError) {
      setError(requestError.message);
      setData(initialAnalyticalData);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadVisualizations();
  }, []);

  return (
    <main className="app-shell">
      <AppNavigation />
      <header className="dashboard-header">
        <div>
          <p className="eyebrow">Exploracion de comportamiento</p>
          <h1>Visualizaciones Analiticas</h1>
          <p className="dashboard-header__copy">
            Tendencia temporal, distribucion de compras por cliente y correlaciones entre metricas de comportamiento.
          </p>
        </div>
        <button className="refresh-button" onClick={loadVisualizations} disabled={loading} type="button">
          <RefreshCw size={18} aria-hidden="true" />
          {loading ? "Actualizando" : "Actualizar"}
        </button>
      </header>

      {error ? (
        <section className="alert" role="alert">
          <AlertCircle size={20} aria-hidden="true" />
          <div>
            <strong>No se pudieron cargar las visualizaciones analiticas</strong>
            <p>
              {error}. Verifica que FastAPI este corriendo y que el pipeline haya creado `metricas_clientes`.
            </p>
          </div>
        </section>
      ) : null}

      <section className="metric-grid metric-grid--three" aria-label="Indicadores de visualizaciones analiticas">
        <MetricCard
          icon={CalendarDays}
          label="Dias analizados"
          value={data.serieTiempo.length}
          helper="Serie temporal"
          tone="green"
        />
        <MetricCard
          icon={Users}
          label="Clientes analizados"
          value={data.boxplotClientes.length}
          helper="Distribucion por cliente"
          tone="blue"
        />
        <MetricCard
          icon={Activity}
          label="Correlaciones"
          value={data.correlacionClientes.length}
          helper="Matriz de metricas"
          tone="amber"
        />
      </section>

      {loading ? (
        <section className="loading-panel">
          <RefreshCw size={22} aria-hidden="true" />
          Cargando visualizaciones analiticas...
        </section>
      ) : (
        <>
          <section className="dashboard-grid dashboard-grid--wide-left">
            <TimeSeriesChart data={data.serieTiempo} />
            <section className="panel panel--insight">
              <div className="panel__header">
                <div>
                  <p className="eyebrow">Lectura rapida</p>
                  <h2>Objetivo analitico</h2>
                </div>
                <ArrowRight className="panel__icon" size={22} aria-hidden="true" />
              </div>
              <div className="insight-list">
                <div>
                  <span>Serie de tiempo</span>
                  <strong>Tendencias y estacionalidad</strong>
                  <p>Permite ubicar dias de mayor volumen y cambios de comportamiento durante el periodo.</p>
                </div>
                <div>
                  <span>Boxplot y heatmap</span>
                  <strong>Outliers y relaciones</strong>
                  <p>Complementan la lectura con dispersion por cliente y dependencia entre variables numericas.</p>
                </div>
              </div>
            </section>
          </section>

          <section className="dashboard-grid">
            <BoxplotChart data={data.boxplotClientes} />
            <HeatmapCorrelation data={data.correlacionClientes} />
          </section>
        </>
      )}
    </main>
  );
}
