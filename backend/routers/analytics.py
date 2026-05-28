from fastapi import APIRouter
from config.database import get_db

router = APIRouter(prefix="/api/analytics", tags=["analytics"])

@router.get("/kpis")

def get_kpis():
    db = get_db()
    with db.cursor() as cursor:
        cursor.execute("SELECT * FROM kpis_globales")
        res = cursor.fetchone()
    db.close()
    return res

@router.get("/top_productos")
def get_top_productos():
    db = get_db()
    with db.cursor() as cursor:
        cursor.execute("SELECT * FROM top_productos")
        res = cursor.fetchall()
    db.close()
    return res

@router.get("/top_clientes")
def get_top_clientes():
    db = get_db()
    with db.cursor() as cursor:
        cursor.execute("SELECT * FROM top_clientes")
        res = cursor.fetchall()
    db.close()
    return res

@router.get("/categorias_rentables")
def get_categorias_rentables():
    db = get_db()
    with db.cursor() as cursor:
        cursor.execute("SELECT * FROM categorias_rentables")
        res = cursor.fetchall()
    db.close()
    return res

@router.get("/serie_tiempo")
def get_serie_tiempo():
    db = get_db()
    with db.cursor() as cursor:
        cursor.execute("SELECT * FROM serie_tiempo")
        res = cursor.fetchall()
    db.close()
    return res

@router.get("/boxplot_clientes")
def get_boxplot_clientes():
    db = get_db()
    with db.cursor() as cursor:
        cursor.execute("SELECT * FROM boxplot_clientes")
        res = cursor.fetchall()
    db.close()
    return res

