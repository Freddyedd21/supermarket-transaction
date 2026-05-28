from pathlib import Path
from pyspark.sql import SparkSession
from pyspark.sql.functions import col, count, count_distinct, explode, split, monotonically_increasing_id, trim

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

# 3. Lectura de los DataFrames y limpieza
df_transacciones = (
    spark.read.csv(transaction_files, sep="|", header=False, inferSchema=True)
    .toDF("fecha", "tienda_id", "cliente_id", "productos")
    .withColumn("tx_id", monotonically_increasing_id())
)

# Leemos la tabla puente de productos y aseguramos que no haya espacios en los IDs
df_product_category = (
    spark.read.csv(path_productos, sep="|", header=True, inferSchema=True)
    .withColumnRenamed("v.Code_pr", "codigo_producto")
    .withColumnRenamed("v.code", "codigo_categoria")
    .withColumn("codigo_producto", trim(col("codigo_producto")).cast("int"))
    .withColumn("codigo_categoria", trim(col("codigo_categoria")).cast("int"))
)

# Leemos el catálogo de categorías y limpiamos espacios
df_categorias = (
    spark.read.csv(path_categorias, sep="|", header=False, inferSchema=True)
    .toDF("id_categoria", "nombre_categoria")
    .withColumn("id_categoria", trim(col("id_categoria")).cast("int"))
    .withColumn("nombre_categoria", trim(col("nombre_categoria")))
)

# ==========================================
# FASE ETL: NORMALIZACIÓN Y JOINS
# ==========================================

# A. Normalización: Expandir la lista de productos separada por espacios
df_detalles = (
    df_transacciones
    .withColumn("id_producto", explode(split(trim(col("productos")), " ")))
    .withColumn("id_producto", trim(col("id_producto")).cast("int"))
)

# Filtrar nulos resultantes de espacios dobles o vacíos en la lista de productos
df_detalles = df_detalles.filter(col("id_producto").isNotNull())

# B. Cruce de datos: Doble Join (Transacciones -> Producto -> Categoría)
df_completo = (
    df_detalles
    .join(
        df_product_category,
        df_detalles.id_producto == df_product_category.codigo_producto,
        "left"
    )
    .join(
        df_categorias,
        df_product_category.codigo_categoria == df_categorias.id_categoria,
        "left"
    )
)

# CONTROL DE CALIDAD: Llenar categorías que por algún motivo no existan en el catálogo
df_completo = df_completo.na.fill({"nombre_categoria": "Producto sin Categoría"})

# ==========================================
# CÁLCULO DE MÉTRICAS: RESUMEN EJECUTIVO
# ==========================================

# 1. KPIs Globales
df_kpis = df_detalles.agg(
    count("*").alias("total_unidades_vendidas"), 
    count_distinct("tx_id").alias("total_transacciones") 
)

# 2. Top 10 Productos
df_top_productos = (
    df_detalles.groupBy("id_producto")
    .agg(count("*").alias("unidades_vendidas"))
    .orderBy(col("unidades_vendidas").desc())
    .limit(10)
)

# 3. Top 10 Clientes
df_top_clientes = (
    df_detalles.groupBy("cliente_id")
    .agg(
        count_distinct("tx_id").alias("frecuencia_transacciones"), 
        count("*").alias("volumen_compra") 
    )
    .orderBy(col("volumen_compra").desc())
    .limit(10)
)

# 4. Categorías más rentables
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
        count_distinct("tx_id").alias("transacciones_diarias")
    )
    .orderBy("fecha")
)

# 2. Datos para Boxplot
df_boxplot = (
    df_detalles.groupBy("cliente_id")
    .agg(count("*").alias("cantidad_total_cliente"))
)

# ==========================================
# PERSISTENCIA / AUDITORÍA EN CONSOLA
# ==========================================
def guardar_en_db(df, tabla):
    """Simula el guardado imprimiendo los resultados limpios en consola."""
    print(f"\n[{tabla}] procesada exitosamente. Muestra:")
    df.show(10, truncate=False)

guardar_en_db(df_kpis, "kpis_globales")
guardar_en_db(df_top_productos, "top_productos")
guardar_en_db(df_top_clientes, "top_clientes") 
guardar_en_db(df_categorias_rentables, "categorias_rentables")
guardar_en_db(df_serie_tiempo, "serie_tiempo")
guardar_en_db(df_boxplot, "boxplot_data")

spark.stop()