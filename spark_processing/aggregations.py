from pathlib import Path

from pyspark.sql import SparkSession
from pyspark.sql.functions import col, count, count_distinct, explode, split

# 1. Crear la sesión de Spark
spark = (
    SparkSession.builder
    .appName("SupermercadoIngestion")
    .config("spark.sql.shuffle.partitions", "4")
    .getOrCreate()
)

# 2. Rutas de los archivos
project_root = Path(__file__).resolve().parent.parent
transactions_dir = project_root / "data" / "DataSet" / "Transactions"
transaction_files = sorted(p.resolve().as_posix() for p in transactions_dir.glob("*_Tran.csv"))

if not transaction_files:
    raise FileNotFoundError(f"No se encontraron CSV de transacciones en: {transactions_dir}")

path_productos = (project_root / "data" / "DataSet" / "Products" / "ProductCategory.csv").resolve().as_posix()
path_categorias = (project_root / "data" / "DataSet" / "Products" / "Categories.csv").resolve().as_posix()

# 3. Lectura de los DataFrames
df_transacciones = (
    spark.read.csv(transaction_files, sep="|", header=False, inferSchema=True)
    .toDF("fecha", "tienda_id", "ticket_id", "productos")
)

# SOLUCIÓN: Renombrar las columnas problemáticas inmediatamente después de leerlas
df_product_category = (
    spark.read.csv(path_productos, sep="|", header=True, inferSchema=True)
    .withColumnRenamed("v.Code_pr", "codigo_producto")
    .withColumnRenamed("v.code", "codigo_categoria")
)

df_categorias = (
    spark.read.csv(path_categorias, sep="|", header=False, inferSchema=True)
    .toDF("id_categoria", "nombre_categoria")
)

# ==========================================
# FASE ETL: NORMALIZACIÓN Y JOINS
# ==========================================

# A. Normalización: Expandir la lista de productos
df_detalles = df_transacciones.withColumn("id_producto", explode(split(col("productos"), " ")))
df_detalles = df_detalles.filter(col("id_producto") != "")

# B. Cruce de datos (Modelo Estrella) actualizando la sintaxis del JOIN
df_completo = df_detalles.join(
    df_product_category, 
    df_detalles.id_producto == df_product_category.codigo_producto, 
    "left"
).join(
    df_categorias,
    df_product_category.codigo_categoria == df_categorias.id_categoria,
    "left"
)

# ==========================================
# CÁLCULO DE MÉTRICAS: RESUMEN EJECUTIVO
# ==========================================

# 1. KPIs Globales
df_kpis = df_detalles.agg(
    count("*").alias("total_unidades_vendidas"), 
    count_distinct("ticket_id").alias("total_transacciones") 
)

# 2. Top 10 Productos
df_top_productos = (
    df_detalles.groupBy("id_producto")
    .agg(count("*").alias("unidades_vendidas"))
    .orderBy(col("unidades_vendidas").desc())
    .limit(10)
)

# 3. Top 10 Clientes (Adaptado a Tickets/Tiendas por estructura de datos) 
df_top_tickets = (
    df_detalles.groupBy("ticket_id", "tienda_id")
    .agg(count("*").alias("volumen_compra"))
    .orderBy(col("volumen_compra").desc())
    .limit(10)
)

# 4. Categorías más rentables (Inferido por volumen, ya que no hay precios) 
df_categorias_rentables = (
    df_completo.groupBy("nombre_categoria")
    .agg(count("*").alias("unidades_vendidas"))
    .orderBy(col("unidades_vendidas").desc())
)

# ==========================================
# CÁLCULO DE MÉTRICAS: VISUALIZACIONES ANALÍTICAS
# ==========================================

# 1. Serie de tiempo (Ventas por día) 
df_serie_tiempo = (
    df_detalles.groupBy("fecha")
    .agg(
        count("*").alias("unidades_vendidas"),
        count_distinct("ticket_id").alias("transacciones_diarias")
    )
    .orderBy("fecha")
)

# 2. Datos para Boxplot (Distribución de totales por ticket) 
df_boxplot = (
    df_detalles.groupBy("ticket_id")
    .agg(count("*").alias("cantidad_total_ticket"))
)

# ==========================================
# PERSISTENCIA EN POSTGRESQL
# ==========================================
# Reemplaza con tus credenciales reales
DB_URL = "jdbc:postgresql://localhost:5432/supermercado_db"
DB_PROPERTIES = {
    "user": "postgres",
    "password": "tu_password",
    "driver": "org.postgresql.Driver"
}

def guardar_en_db(df, tabla):
    """Guarda un DataFrame en PostgreSQL sobreescribiendo los datos anteriores."""
    # Descomenta las siguientes líneas cuando tu base de datos esté levantada
    # df.write.jdbc(url=DB_URL, table=tabla, mode="overwrite", properties=DB_PROPERTIES)
    print(f"[{tabla}] procesada exitosamente. Muestra:")
    df.show(3)

guardar_en_db(df_kpis, "kpis_globales")
guardar_en_db(df_top_productos, "top_productos")
guardar_en_db(df_top_tickets, "top_clientes_tickets")
guardar_en_db(df_categorias_rentables, "categorias_rentables")
guardar_en_db(df_serie_tiempo, "serie_tiempo")
guardar_en_db(df_boxplot, "boxplot_data")

spark.stop()