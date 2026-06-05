from functools import lru_cache

from fastapi import APIRouter
from config.database import query_all, query_one
from services.advanced_analysis import (
    build_advanced_summary,
    recommend_for_client,
    recommend_for_product,
    refresh_advanced_cache,
)
from services.csv_summary import build_summary

router = APIRouter(prefix="/api/analytics", tags=["analytics"])


@router.get("/resumen")
def get_resumen(tienda: str | None = None, fecha_inicio: str | None = None, fecha_fin: str | None = None):
    return build_summary(store=tienda, start_date=fecha_inicio, end_date=fecha_fin)


@router.get("/avanzado")
def get_analisis_avanzado():
    return build_advanced_summary()


@router.post("/avanzado/refrescar")
def refresh_analisis_avanzado():
    return refresh_advanced_cache()


@router.get("/recomendaciones/cliente/{cliente_id}")
def get_recomendaciones_cliente(cliente_id: str):
    return {
        "cliente_id": int(cliente_id) if cliente_id.isdigit() else cliente_id,
        "recomendaciones": recommend_for_client(cliente_id),
    }


@router.get("/recomendaciones/producto/{producto_id}")
def get_recomendaciones_producto(producto_id: str):
    return {
        "producto_id": int(producto_id) if producto_id.isdigit() else producto_id,
        "recomendaciones": recommend_for_product(producto_id),
    }


@router.get("/kpis")

def get_kpis():
    return query_one(
        """
        SELECT
            k.total_unidades_vendidas,
            k.total_transacciones,
            (SELECT COUNT(*) FROM boxplot_clientes) AS clientes_unicos
        FROM kpis_globales k
        """
    )

@router.get("/top_productos")
def get_top_productos():
    return query_all("SELECT * FROM top_productos")

@router.get("/top_clientes")
def get_top_clientes():
    return query_all("SELECT * FROM top_clientes")

@router.get("/categorias_rentables")
def get_categorias_rentables():
    return query_all(
        "SELECT * FROM categorias_rentables "
        "WHERE nombre_categoria <> 'Producto sin Categoría' "
        "ORDER BY unidades_vendidas DESC "
        "LIMIT 10"
    )

@router.get("/serie_tiempo")
def get_serie_tiempo():
    return query_all("SELECT * FROM serie_tiempo")


@lru_cache(maxsize=1)
def _build_visualizaciones():
    resumen = build_summary()
    return {
        "serie_tiempo": get_serie_tiempo(),
        "dias_semana": resumen["dias_semana"],
        "boxplot_clientes": get_boxplot_clientes_resumen(),
        "correlacion_clientes": get_correlacion_clientes(),
    }


@router.get("/visualizaciones")
def get_visualizaciones(refresh: bool = False):
    if refresh:
        _build_visualizaciones.cache_clear()

    return _build_visualizaciones()

@router.get("/boxplot_clientes")
def get_boxplot_clientes():
    return query_all("SELECT * FROM boxplot_clientes")


@router.get("/boxplot_clientes_resumen")
def get_boxplot_clientes_resumen():
    stats = query_one(
        """
        WITH valores AS (
            SELECT
                cliente_id,
                cantidad_total_cliente::double precision AS valor
            FROM boxplot_clientes
        ),
        percentiles AS (
            SELECT
                MIN(valor) AS minimo,
                MAX(valor) AS maximo,
                percentile_cont(0.25) WITHIN GROUP (ORDER BY valor) AS q1,
                percentile_cont(0.50) WITHIN GROUP (ORDER BY valor) AS mediana,
                percentile_cont(0.75) WITHIN GROUP (ORDER BY valor) AS q3,
                COUNT(*) AS total
            FROM valores
        ),
        limites AS (
            SELECT
                minimo,
                maximo,
                q1,
                mediana,
                q3,
                total,
                GREATEST(minimo, q1 - 1.5 * (q3 - q1)) AS limite_inferior,
                LEAST(maximo, q3 + 1.5 * (q3 - q1)) AS limite_superior
            FROM percentiles
        )
        SELECT
            minimo,
            maximo,
            q1,
            mediana,
            q3,
            limite_inferior,
            limite_superior,
            total,
            (
                SELECT COUNT(*)
                FROM valores, limites
                WHERE valor < limite_inferior OR valor > limite_superior
            ) AS atipicos
        FROM limites
        """
    )

    outliers = query_all(
        """
        WITH valores AS (
            SELECT
                cliente_id,
                cantidad_total_cliente::double precision AS valor
            FROM boxplot_clientes
        ),
        percentiles AS (
            SELECT
                MIN(valor) AS minimo,
                MAX(valor) AS maximo,
                percentile_cont(0.25) WITHIN GROUP (ORDER BY valor) AS q1,
                percentile_cont(0.75) WITHIN GROUP (ORDER BY valor) AS q3
            FROM valores
        ),
        limites AS (
            SELECT
                GREATEST(minimo, q1 - 1.5 * (q3 - q1)) AS limite_inferior,
                LEAST(maximo, q3 + 1.5 * (q3 - q1)) AS limite_superior
            FROM percentiles
        )
        SELECT cliente_id, valor
        FROM valores, limites
        WHERE valor < limite_inferior OR valor > limite_superior
        ORDER BY valor DESC
        LIMIT 90
        """
    )

    return {
        **stats,
        "outliers_muestra": outliers,
    }


@router.get("/correlacion_clientes")
def get_correlacion_clientes():
    return query_all(
        """
        WITH metricas AS (
            SELECT
                frecuencia_transacciones::double precision AS frecuencia,
                volumen_total::double precision AS volumen,
                productos_distintos::double precision AS productos,
                cantidad_promedio::double precision AS promedio,
                diversidad_categorias::double precision AS categorias
            FROM metricas_clientes
        ),
        correlaciones AS (
            SELECT
                corr(frecuencia, volumen) AS frecuencia_volumen,
                corr(frecuencia, productos) AS frecuencia_productos,
                corr(frecuencia, promedio) AS frecuencia_promedio,
                corr(frecuencia, categorias) AS frecuencia_categorias,
                corr(volumen, productos) AS volumen_productos,
                corr(volumen, promedio) AS volumen_promedio,
                corr(volumen, categorias) AS volumen_categorias,
                corr(productos, promedio) AS productos_promedio,
                corr(productos, categorias) AS productos_categorias,
                corr(promedio, categorias) AS promedio_categorias
            FROM metricas
        )
        SELECT matriz.variable_x, matriz.variable_y, matriz.correlacion
        FROM correlaciones c
        CROSS JOIN LATERAL (
            VALUES
                ('Frecuencia', 'Frecuencia', 1.0::double precision),
                ('Frecuencia', 'Volumen total', c.frecuencia_volumen),
                ('Frecuencia', 'Productos distintos', c.frecuencia_productos),
                ('Frecuencia', 'Cantidad promedio', c.frecuencia_promedio),
                ('Frecuencia', 'Diversidad categorias', c.frecuencia_categorias),
                ('Volumen total', 'Frecuencia', c.frecuencia_volumen),
                ('Volumen total', 'Volumen total', 1.0::double precision),
                ('Volumen total', 'Productos distintos', c.volumen_productos),
                ('Volumen total', 'Cantidad promedio', c.volumen_promedio),
                ('Volumen total', 'Diversidad categorias', c.volumen_categorias),
                ('Productos distintos', 'Frecuencia', c.frecuencia_productos),
                ('Productos distintos', 'Volumen total', c.volumen_productos),
                ('Productos distintos', 'Productos distintos', 1.0::double precision),
                ('Productos distintos', 'Cantidad promedio', c.productos_promedio),
                ('Productos distintos', 'Diversidad categorias', c.productos_categorias),
                ('Cantidad promedio', 'Frecuencia', c.frecuencia_promedio),
                ('Cantidad promedio', 'Volumen total', c.volumen_promedio),
                ('Cantidad promedio', 'Productos distintos', c.productos_promedio),
                ('Cantidad promedio', 'Cantidad promedio', 1.0::double precision),
                ('Cantidad promedio', 'Diversidad categorias', c.promedio_categorias),
                ('Diversidad categorias', 'Frecuencia', c.frecuencia_categorias),
                ('Diversidad categorias', 'Volumen total', c.volumen_categorias),
                ('Diversidad categorias', 'Productos distintos', c.productos_categorias),
                ('Diversidad categorias', 'Cantidad promedio', c.promedio_categorias),
                ('Diversidad categorias', 'Diversidad categorias', 1.0::double precision)
        ) AS matriz(variable_x, variable_y, correlacion)
        """
    )

