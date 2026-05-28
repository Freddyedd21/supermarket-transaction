from fastapi import APIRouter
from config.database import query_all, query_one

router = APIRouter(prefix="/api/analytics", tags=["analytics"])

@router.get("/kpis")

def get_kpis():
    return query_one("SELECT * FROM kpis_globales")

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

