import React, { useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  BarChart3,
  CalendarDays,
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
};

const initialData = {
  kpis: null,
  topProductos: [],
  topClientes: [],
  categorias: [],
  serieTiempo: [],
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
