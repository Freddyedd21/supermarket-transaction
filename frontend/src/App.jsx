import React, { useEffect, useMemo, useState } from "react";
import {
  Activity,
  AlertCircle,
  ArrowRight,
  BarChart3,
  Brain,
  CalendarDays,
  ChartNoAxesCombined,
  GitBranch,
  Grid3X3,
  Package,
  ReceiptText,
  RefreshCw,
  RotateCcw,
  Search,
  ShoppingBasket,
  SlidersHorizontal,
  Sparkles,
  Store,
  Tags,
  Users,
} from "lucide-react";

const API_BASE_URL = import.meta.env.VITE_API_URL ?? "http://127.0.0.1:8000";

const endpoints = {
  resumen: "/api/analytics/resumen",
  kpis: "/api/analytics/kpis",
  topProductos: "/api/analytics/top_productos",
  topClientes: "/api/analytics/top_clientes",
  categorias: "/api/analytics/categorias_rentables",
  serieTiempo: "/api/analytics/serie_tiempo",
  boxplotClientes: "/api/analytics/boxplot_clientes",
  correlacionClientes: "/api/analytics/correlacion_clientes",
  avanzado: "/api/analytics/avanzado",
  refrescarAvanzado: "/api/analytics/avanzado/refrescar",
  recomendarCliente: "/api/analytics/recomendaciones/cliente",
  recomendarProducto: "/api/analytics/recomendaciones/producto",
};

const initialData = {
  kpis: null,
  topProductos: [],
  topClientes: [],
  categorias: [],
  serieTiempo: [],
  diasSemana: [],
};

const initialFilterOptions = {
  tiendas: [],
  fecha_min: "2013-01-01",
  fecha_max: "2013-06-30",
};

const initialAnalyticalData = {
  serieTiempo: [],
  boxplotClientes: [],
  correlacionClientes: [],
};

const initialAdvancedData = {
  segmentacion: {
    total_clientes: 0,
    variables: [],
    clusters: [],
    puntos: [],
    interpretacion_general: "",
  },
  recomendador: {
    metodo: "",
    clientes_sugeridos: [],
    productos_sugeridos: [],
  },
  ejemplos: {
    cliente_id: "",
    producto_id: "",
    recomendaciones_cliente: [],
    recomendaciones_producto: [],
  },
  regeneracion: {
    descripcion: "",
    pasos: [],
  },
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

async function postJson(path) {
  const response = await fetch(`${API_BASE_URL}${path}`, { method: "POST" });
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
      <a
        className={path.startsWith("/avanzado") ? "app-nav__link app-nav__link--active" : "app-nav__link"}
        href="/avanzado"
      >
        Analisis Avanzado
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

function WeekdayHeatmap({ data }) {
  const chartData = useMemo(
    () =>
      data
        .map((item) => ({
          dia: item.dia,
          orden: Number(item.orden ?? 0),
          transacciones: Number(item.transacciones ?? 0),
          unidades: Number(item.unidades_vendidas ?? 0),
        }))
        .sort((a, b) => a.orden - b.orden),
    [data],
  );

  const maxTransactions = Math.max(...chartData.map((item) => item.transacciones), 1);

  function intensity(value) {
    return 0.12 + (value / maxTransactions) * 0.78;
  }

  return (
    <section className="panel">
      <div className="panel__header">
        <div>
          <p className="eyebrow">Transacciones por dia</p>
          <h2>Dias pico de compra</h2>
        </div>
        <CalendarDays className="panel__icon" size={22} aria-hidden="true" />
      </div>

      {chartData.length === 0 ? (
        <div className="empty-state">No hay datos por dia de la semana disponibles.</div>
      ) : (
        <div className="weekday-heatmap" role="list" aria-label="Mapa de calor de transacciones por dia de semana">
          {chartData.map((item) => (
            <div
              className="weekday-heatmap__cell"
              key={item.dia}
              role="listitem"
              style={{ "--heat": intensity(item.transacciones) }}
              title={`${item.dia}: ${formatNumber(item.transacciones)} transacciones`}
            >
              <span>{item.dia}</span>
              <strong>{formatNumber(item.transacciones)}</strong>
              <small>{formatNumber(item.unidades)} unidades</small>
            </div>
          ))}
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

function ExecutiveInsight({ diasSemana, categorias }) {
  const peakDay = useMemo(() => {
    return [...diasSemana].sort(
      (a, b) => Number(b.transacciones ?? 0) - Number(a.transacciones ?? 0),
    )[0];
  }, [diasSemana]);

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
          <span>Dia de semana pico</span>
          <strong>{peakDay?.dia ?? "Sin datos"}</strong>
          <p>
            {peakDay
              ? `${formatNumber(peakDay.transacciones)} transacciones registradas.`
              : "No hay registros para calcular el pico semanal."}
          </p>
        </div>
        <div>
          <span>Categoría con mayor volumen</span>
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

const clusterColors = ["#2a9d8f", "#3267a8", "#e9a03b", "#b34a38"];

function formatDecimal(value, digits = 2) {
  return Number(value ?? 0).toLocaleString("es-CO", {
    maximumFractionDigits: digits,
    minimumFractionDigits: 0,
  });
}

function ClusterScatter({ points }) {
  const chart = useMemo(() => {
    const cleanPoints = points
      .map((point) => ({
        ...point,
        x: Number(point.x ?? 0),
        y: Number(point.y ?? 0),
        cluster: Number(point.cluster ?? 0),
      }))
      .filter((point) => Number.isFinite(point.x) && Number.isFinite(point.y));

    if (cleanPoints.length === 0) {
      return { points: [], minX: 0, maxX: 1, minY: 0, maxY: 1 };
    }

    return {
      points: cleanPoints,
      minX: Math.min(...cleanPoints.map((point) => point.x)),
      maxX: Math.max(...cleanPoints.map((point) => point.x)),
      minY: Math.min(...cleanPoints.map((point) => point.y)),
      maxY: Math.max(...cleanPoints.map((point) => point.y)),
    };
  }, [points]);

  const width = 720;
  const height = 320;
  const padding = 42;
  const xRange = Math.max(chart.maxX - chart.minX, 0.001);
  const yRange = Math.max(chart.maxY - chart.minY, 0.001);

  return (
    <section className="panel panel--wide">
      <div className="panel__header">
        <div>
          <p className="eyebrow">K-Means</p>
          <h2>Visualizacion del clustering</h2>
        </div>
        <Brain className="panel__icon" size={22} aria-hidden="true" />
      </div>

      {chart.points.length === 0 ? (
        <div className="empty-state">No hay puntos de segmentacion disponibles.</div>
      ) : (
        <>
          <div className="scatter-chart">
            <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Clusters de clientes">
              <line x1={padding} x2={width - padding} y1={height - padding} y2={height - padding} className="chart-axis" />
              <line x1={padding} x2={padding} y1={padding} y2={height - padding} className="chart-axis" />
              {chart.points.map((point, index) => {
                const x = padding + ((point.x - chart.minX) / xRange) * (width - padding * 2);
                const y = height - padding - ((point.y - chart.minY) / yRange) * (height - padding * 2);
                return (
                  <circle
                    cx={x}
                    cy={y}
                    r="5"
                    fill={clusterColors[point.cluster % clusterColors.length]}
                    opacity="0.74"
                    key={`${point.cliente_id}-${index}`}
                  />
                );
              })}
              <text x={width / 2} y={height - 8} className="chart-label">
                Volumen total de compra
              </text>
              <text x="14" y={height / 2} className="chart-label chart-label--vertical">
                Productos distintos
              </text>
            </svg>
          </div>
          <div className="cluster-legend">
            {[0, 1, 2, 3].map((cluster) => (
              <span key={cluster}>
                <i style={{ backgroundColor: clusterColors[cluster] }} />
                Grupo {cluster + 1}
              </span>
            ))}
          </div>
        </>
      )}
    </section>
  );
}

function ClusterCards({ clusters }) {
  return (
    <section className="cluster-grid" aria-label="Interpretacion de segmentos">
      {clusters.map((cluster) => (
        <article className="cluster-card" key={cluster.cluster}>
          <div className="cluster-card__header">
            <span style={{ backgroundColor: clusterColors[cluster.cluster % clusterColors.length] }}>
              Grupo {Number(cluster.cluster) + 1}
            </span>
            <strong>{cluster.nombre}</strong>
          </div>
          <p>{cluster.interpretacion}</p>
          <div className="cluster-card__stats">
            <span>{formatNumber(cluster.clientes)} clientes</span>
            <span>{formatDecimal(cluster.porcentaje)}%</span>
            <span>{formatDecimal(cluster.promedios?.frecuencia_transacciones)} compras prom.</span>
            <span>{formatDecimal(cluster.promedios?.volumen_total)} unidades prom.</span>
          </div>
        </article>
      ))}
    </section>
  );
}

function RecommendationList({ title, data, scoreKey }) {
  return (
    <section className="recommendation-list">
      <h3>{title}</h3>
      {data.length === 0 ? (
        <div className="empty-state empty-state--small">No hay recomendaciones disponibles.</div>
      ) : (
        data.map((item) => (
          <article className="recommendation-item" key={`${title}-${item.id_producto}`}>
            <div>
              <span>Producto {item.id_producto}</span>
              <p>{item.interpretacion}</p>
            </div>
            <strong>
              {scoreKey === "lift"
                ? `Lift ${formatDecimal(item.lift)}`
                : `Score ${formatDecimal(item.score ?? item.confianza, 3)}`}
            </strong>
          </article>
        ))
      )}
    </section>
  );
}

function RecommendationPanel({ data, onClientSearch, onProductSearch, loading }) {
  const [clientId, setClientId] = useState(data.ejemplos.cliente_id ?? "");
  const [productId, setProductId] = useState(data.ejemplos.producto_id ?? "");
  const [clientRecommendations, setClientRecommendations] = useState(data.ejemplos.recomendaciones_cliente ?? []);
  const [productRecommendations, setProductRecommendations] = useState(data.ejemplos.recomendaciones_producto ?? []);

  useEffect(() => {
    setClientId(data.ejemplos.cliente_id ?? "");
    setProductId(data.ejemplos.producto_id ?? "");
    setClientRecommendations(data.ejemplos.recomendaciones_cliente ?? []);
    setProductRecommendations(data.ejemplos.recomendaciones_producto ?? []);
  }, [data]);

  async function searchClient(event) {
    event.preventDefault();
    const recommendations = await onClientSearch(clientId);
    setClientRecommendations(recommendations);
  }

  async function searchProduct(event) {
    event.preventDefault();
    const recommendations = await onProductSearch(productId);
    setProductRecommendations(recommendations);
  }

  return (
    <section className="panel panel--wide">
      <div className="panel__header">
        <div>
          <p className="eyebrow">Reglas de asociacion</p>
          <h2>Recomendador de productos</h2>
        </div>
        <Sparkles className="panel__icon" size={22} aria-hidden="true" />
      </div>

      <div className="recommender-grid">
        <form className="lookup-form" onSubmit={searchClient}>
          <label>
            <span>Cliente</span>
            <input
              list="clientes-sugeridos"
              value={clientId}
              onChange={(event) => setClientId(event.target.value)}
              placeholder="Ej: 336296"
            />
          </label>
          <button className="refresh-button" type="submit" disabled={loading || !clientId}>
            <Search size={18} aria-hidden="true" />
            Recomendar
          </button>
          <datalist id="clientes-sugeridos">
            {data.recomendador.clientes_sugeridos.map((client) => (
              <option value={client.cliente_id} key={client.cliente_id} />
            ))}
          </datalist>
        </form>

        <form className="lookup-form" onSubmit={searchProduct}>
          <label>
            <span>Producto</span>
            <input
              list="productos-sugeridos"
              value={productId}
              onChange={(event) => setProductId(event.target.value)}
              placeholder="Ej: 3"
            />
          </label>
          <button className="refresh-button" type="submit" disabled={loading || !productId}>
            <Search size={18} aria-hidden="true" />
            Buscar similares
          </button>
          <datalist id="productos-sugeridos">
            {data.recomendador.productos_sugeridos.map((product) => (
              <option value={product.id_producto} key={product.id_producto} />
            ))}
          </datalist>
        </form>
      </div>

      <div className="dashboard-grid">
        <RecommendationList title="Sugerencias para el cliente" data={clientRecommendations} scoreKey="score" />
        <RecommendationList title="Productos comprados juntos" data={productRecommendations} scoreKey="lift" />
      </div>
    </section>
  );
}

function RegenerationPanel({ data, onRefresh, loading }) {
  return (
    <section className="panel panel--insight">
      <div className="panel__header">
        <div>
          <p className="eyebrow">Nuevos datos</p>
          <h2>Generacion de resultados</h2>
        </div>
        <GitBranch className="panel__icon" size={22} aria-hidden="true" />
      </div>
      <div className="insight-list">
        <div>
          <span>Flujo implementado</span>
          <strong>CSV, Spark y cache del modelo</strong>
          <p>{data.descripcion}</p>
        </div>
      </div>
      <ol className="process-list">
        {data.pasos.map((step, index) => (
          <li key={`${step}-${index}`}>{step}</li>
        ))}
      </ol>
      <button className="refresh-button" onClick={onRefresh} disabled={loading} type="button">
        <RefreshCw size={18} aria-hidden="true" />
        {loading ? "Recalculando" : "Actualizar modelos"}
      </button>
    </section>
  );
}

export default function App() {
  const path = window.location.pathname;

  if (path.startsWith("/avanzado")) {
    return <AdvancedAnalysisPage />;
  }

  if (path.startsWith("/visualizaciones")) {
    return <AnalyticalVisualizationsPage />;
  }

  return <ExecutiveDashboard />;
}

function ExecutiveDashboard() {
  const [data, setData] = useState(initialData);
  const [filters, setFilters] = useState({
    tienda: "",
  });
  const [filterOptions, setFilterOptions] = useState(initialFilterOptions);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function loadDashboard(activeFilters = filters) {
    setLoading(true);
    setError("");

    try {
      const selectedFilters = activeFilters?.tienda === undefined ? filters : activeFilters;
      const params = new URLSearchParams();

      if (selectedFilters.tienda) params.set("tienda", selectedFilters.tienda);

      const resumen = await fetchJson(`${endpoints.resumen}?${params.toString()}`);

      setData({
        kpis: resumen.kpis,
        topProductos: resumen.top_productos,
        topClientes: resumen.top_clientes,
        categorias: resumen.categorias_rentables.filter((item) => item.nombre_categoria !== "Producto sin Categoría"),
        serieTiempo: resumen.serie_tiempo,
        diasSemana: resumen.dias_semana ?? [],
      });
      setFilterOptions(resumen.filtros ?? initialFilterOptions);
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

  function updateFilter(key, value) {
    setFilters((currentFilters) => ({
      ...currentFilters,
      [key]: value,
    }));
  }

  function resetFilters() {
    const defaultFilters = {
      tienda: "",
    };

    setFilters(defaultFilters);
    loadDashboard(defaultFilters);
  }

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
        <button className="refresh-button" onClick={() => loadDashboard()} disabled={loading} type="button">
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

      <section className="filters-panel" aria-label="Filtros del resumen ejecutivo">
        <div className="filters-panel__header">
          <div>
            <p className="eyebrow">Consulta filtrada</p>
            <h2>Filtro por tienda</h2>
          </div>
          <SlidersHorizontal size={22} aria-hidden="true" />
        </div>
        <div className="filters-panel__controls">
          <label className="filter-field">
            <span>
              <Store size={16} aria-hidden="true" />
              Tienda
            </span>
            <select value={filters.tienda} onChange={(event) => updateFilter("tienda", event.target.value)}>
              <option value="">Todas las tiendas</option>
              {filterOptions.tiendas.map((storeId) => (
                <option value={storeId} key={storeId}>
                  Tienda {storeId}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="filters-panel__actions">
          <button className="refresh-button" onClick={() => loadDashboard()} disabled={loading} type="button">
            <RefreshCw size={18} aria-hidden="true" />
            Aplicar filtros
          </button>
          <button className="ghost-button" onClick={resetFilters} disabled={loading} type="button">
            <RotateCcw size={18} aria-hidden="true" />
            Restablecer
          </button>
        </div>
      </section>

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
          icon={Users}
          label="Clientes unicos"
          value={data.kpis?.clientes_unicos}
          helper="Compradores distintos"
          tone="amber"
        />
        <MetricCard
          icon={Tags}
          label="Categorias top"
          value={data.categorias.length}
          helper="Ranking por volumen"
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
            <ExecutiveInsight diasSemana={data.diasSemana} categorias={data.categorias} />
          </section>

          <section className="dashboard-grid dashboard-grid--balanced">
            <WeekdayHeatmap data={data.diasSemana} />
            <HorizontalBarList
              title="Categorias mas rentables"
              subtitle="Volumen inferido por unidades"
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

function AdvancedAnalysisPage() {
  const [data, setData] = useState(initialAdvancedData);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [lookupLoading, setLookupLoading] = useState(false);

  async function loadAdvanced() {
    setLoading(true);
    setError("");

    try {
      const advanced = await fetchJson(endpoints.avanzado);
      setData(advanced);
    } catch (requestError) {
      setError(requestError.message);
      setData(initialAdvancedData);
    } finally {
      setLoading(false);
    }
  }

  async function refreshModels() {
    setRefreshing(true);
    setError("");

    try {
      const advanced = await postJson(endpoints.refrescarAvanzado);
      setData(advanced);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setRefreshing(false);
    }
  }

  async function searchClient(clientId) {
    setLookupLoading(true);
    setError("");

    try {
      const response = await fetchJson(`${endpoints.recomendarCliente}/${clientId}`);
      return response.recomendaciones ?? [];
    } catch (requestError) {
      setError(requestError.message);
      return [];
    } finally {
      setLookupLoading(false);
    }
  }

  async function searchProduct(productId) {
    setLookupLoading(true);
    setError("");

    try {
      const response = await fetchJson(`${endpoints.recomendarProducto}/${productId}`);
      return response.recomendaciones ?? [];
    } catch (requestError) {
      setError(requestError.message);
      return [];
    } finally {
      setLookupLoading(false);
    }
  }

  useEffect(() => {
    loadAdvanced();
  }, []);

  return (
    <main className="app-shell">
      <AppNavigation />
      <header className="dashboard-header">
        <div>
          <p className="eyebrow">Modelado y diagnostico</p>
          <h1>Analisis Avanzado</h1>
          <p className="dashboard-header__copy">
            Segmentacion de clientes con K-Means, recomendaciones por reglas de asociacion y flujo para regenerar
            resultados con nuevos datos.
          </p>
        </div>
        <button className="refresh-button" onClick={refreshModels} disabled={loading || refreshing} type="button">
          <RefreshCw size={18} aria-hidden="true" />
          {refreshing ? "Recalculando" : "Actualizar modelos"}
        </button>
      </header>

      {error ? (
        <section className="alert" role="alert">
          <AlertCircle size={20} aria-hidden="true" />
          <div>
            <strong>No se pudo cargar el analisis avanzado</strong>
            <p>{error}. Verifica que FastAPI este corriendo y que los CSV existan en data/DataSet.</p>
          </div>
        </section>
      ) : null}

      <section className="metric-grid metric-grid--three" aria-label="Indicadores de analisis avanzado">
        <MetricCard
          icon={Users}
          label="Clientes segmentados"
          value={data.segmentacion.total_clientes}
          helper="K-Means sobre comportamiento"
          tone="green"
        />
        <MetricCard
          icon={Brain}
          label="Segmentos"
          value={data.segmentacion.clusters.length}
          helper="Grupos interpretados"
          tone="blue"
        />
        <MetricCard
          icon={Sparkles}
          label="Variables"
          value={data.segmentacion.variables.length}
          helper="Frecuencia, volumen y diversidad"
          tone="amber"
        />
      </section>

      {loading ? (
        <section className="loading-panel">
          <RefreshCw size={22} aria-hidden="true" />
          Calculando segmentacion y recomendaciones...
        </section>
      ) : (
        <>
          <section className="dashboard-grid dashboard-grid--wide-left">
            <ClusterScatter points={data.segmentacion.puntos} />
            <section className="panel panel--insight">
              <div className="panel__header">
                <div>
                  <p className="eyebrow">Interpretacion</p>
                  <h2>Lectura del modelo</h2>
                </div>
                <BarChart3 className="panel__icon" size={22} aria-hidden="true" />
              </div>
              <div className="insight-list">
                <div>
                  <span>Segmentacion de clientes</span>
                  <strong>K-Means con 4 grupos</strong>
                  <p>{data.segmentacion.interpretacion_general}</p>
                </div>
                <div>
                  <span>Recomendador</span>
                  <strong>{data.recomendador.metodo}</strong>
                  <p>
                    Las sugerencias salen de productos que aparecen juntos en los mismos tickets, excluyendo productos ya
                    comprados por el cliente.
                  </p>
                </div>
              </div>
            </section>
          </section>

          <ClusterCards clusters={data.segmentacion.clusters} />

          <RecommendationPanel
            data={data}
            onClientSearch={searchClient}
            onProductSearch={searchProduct}
            loading={lookupLoading}
          />

          <RegenerationPanel data={data.regeneracion} onRefresh={refreshModels} loading={refreshing} />
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
