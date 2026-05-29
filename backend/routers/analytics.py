from fastapi import APIRouter
from config.database import query_all, query_one
from services.csv_summary import build_summary

router = APIRouter(prefix="/api/analytics", tags=["analytics"])


@router.get("/resumen")
def get_resumen(tienda: str | None = None, fecha_inicio: str | None = None, fecha_fin: str | None = None):
    return build_summary(store=tienda, start_date=fecha_inicio, end_date=fecha_fin)

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

@router.get("/boxplot_clientes")
def get_boxplot_clientes():
    return query_all("SELECT * FROM boxplot_clientes")


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
        )
        SELECT 'Frecuencia' AS variable_x, 'Frecuencia' AS variable_y, 1.0 AS correlacion FROM metricas
        UNION ALL SELECT 'Frecuencia', 'Volumen total', corr(frecuencia, volumen) FROM metricas
        UNION ALL SELECT 'Frecuencia', 'Productos distintos', corr(frecuencia, productos) FROM metricas
        UNION ALL SELECT 'Frecuencia', 'Cantidad promedio', corr(frecuencia, promedio) FROM metricas
        UNION ALL SELECT 'Frecuencia', 'Diversidad categorias', corr(frecuencia, categorias) FROM metricas
        UNION ALL SELECT 'Volumen total', 'Frecuencia', corr(volumen, frecuencia) FROM metricas
        UNION ALL SELECT 'Volumen total', 'Volumen total', 1.0 FROM metricas
        UNION ALL SELECT 'Volumen total', 'Productos distintos', corr(volumen, productos) FROM metricas
        UNION ALL SELECT 'Volumen total', 'Cantidad promedio', corr(volumen, promedio) FROM metricas
        UNION ALL SELECT 'Volumen total', 'Diversidad categorias', corr(volumen, categorias) FROM metricas
        UNION ALL SELECT 'Productos distintos', 'Frecuencia', corr(productos, frecuencia) FROM metricas
        UNION ALL SELECT 'Productos distintos', 'Volumen total', corr(productos, volumen) FROM metricas
        UNION ALL SELECT 'Productos distintos', 'Productos distintos', 1.0 FROM metricas
        UNION ALL SELECT 'Productos distintos', 'Cantidad promedio', corr(productos, promedio) FROM metricas
        UNION ALL SELECT 'Productos distintos', 'Diversidad categorias', corr(productos, categorias) FROM metricas
        UNION ALL SELECT 'Cantidad promedio', 'Frecuencia', corr(promedio, frecuencia) FROM metricas
        UNION ALL SELECT 'Cantidad promedio', 'Volumen total', corr(promedio, volumen) FROM metricas
        UNION ALL SELECT 'Cantidad promedio', 'Productos distintos', corr(promedio, productos) FROM metricas
        UNION ALL SELECT 'Cantidad promedio', 'Cantidad promedio', 1.0 FROM metricas
        UNION ALL SELECT 'Cantidad promedio', 'Diversidad categorias', corr(promedio, categorias) FROM metricas
        UNION ALL SELECT 'Diversidad categorias', 'Frecuencia', corr(categorias, frecuencia) FROM metricas
        UNION ALL SELECT 'Diversidad categorias', 'Volumen total', corr(categorias, volumen) FROM metricas
        UNION ALL SELECT 'Diversidad categorias', 'Productos distintos', corr(categorias, productos) FROM metricas
        UNION ALL SELECT 'Diversidad categorias', 'Cantidad promedio', corr(categorias, promedio) FROM metricas
        UNION ALL SELECT 'Diversidad categorias', 'Diversidad categorias', 1.0 FROM metricas
        """
    )

