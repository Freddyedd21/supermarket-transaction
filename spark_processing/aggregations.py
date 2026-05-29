import os
import platform
import subprocess
import sys
from pathlib import Path

os.environ.setdefault("PGCLIENTENCODING", "UTF8")

# En Windows PySpark respeta SPARK_HOME si existe. Si apunta a una carpeta
# incompleta, intenta lanzar C:\spark\bin\spark-submit.cmd y falla con WinError 2.
is_windows = platform.system().lower().startswith("win")
if is_windows:
    os.environ.setdefault("PYSPARK_PYTHON", sys.executable)
    spark_home = os.getenv("SPARK_HOME")
    spark_submit = Path(spark_home or "") / "bin" / "spark-submit.cmd"
    if spark_home and not spark_submit.exists():
        print(
            f"[Config] SPARK_HOME='{spark_home}' no contiene bin/spark-submit.cmd. "
            "Se ignora para usar la instalacion incluida con pyspark."
        )
        os.environ.pop("SPARK_HOME", None)

try:
    import psycopg2
except ImportError as exc:
    raise ImportError("Falta psycopg2-binary. Instálalo con: pip install psycopg2-binary") from exc

from pyspark.sql import SparkSession
from pyspark.sql.functions import col, count, count_distinct, explode, split, monotonically_increasing_id, row_number, trim
from pyspark.sql.window import Window

# 1. Crear la sesión de Spark
ENABLE_DB_WRITE = os.getenv("ENABLE_DB_WRITE", "1").strip().lower() in {"1", "true", "yes"}

spark_builder = (
    SparkSession.builder
    .appName("SupermercadoIngestion")
    .master("local[*]")
    .config("spark.sql.shuffle.partitions", "4")
)

spark = spark_builder.getOrCreate()

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

# Leemos la tabla puente y dejamos una sola categoría principal por producto.
# El archivo trae productos asociados a varias categorías; si no se resuelve,
# el join duplica ventas por categoría. Usamos la primera categoría registrada
# en ProductCategory.csv como categoría principal.
df_product_category_raw = (
    spark.sparkContext.textFile(path_productos)
    .zipWithIndex()
    .filter(lambda row: row[1] > 0)
    .map(lambda row: (row[0], row[1]))
    .toDF(["linea", "orden_origen"])
)

ventana_categoria_principal = Window.partitionBy("codigo_producto").orderBy(col("orden_origen").asc())

df_product_category = (
    df_product_category_raw
    .select(
        trim(split(col("linea"), r"\|").getItem(0)).cast("int").alias("codigo_producto"),
        trim(split(col("linea"), r"\|").getItem(1)).cast("int").alias("codigo_categoria"),
        col("orden_origen"),
    )
    .filter(col("codigo_producto").isNotNull() & col("codigo_categoria").isNotNull())
    .withColumn("categoria_rank", row_number().over(ventana_categoria_principal))
    .filter(col("categoria_rank") == 1)
    .drop("orden_origen", "categoria_rank")
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
    .withColumn("id_producto", explode(split(trim(col("productos")), r"\s+")))
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
    df_completo
    .filter(col("nombre_categoria") != "Producto sin Categoría")
    .groupBy("nombre_categoria")
    .agg(count("*").alias("unidades_vendidas"))
    .orderBy(col("unidades_vendidas").desc())
    .limit(10)
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
def conectar_postgres():
    db_host = os.getenv("POSTGRES_HOST", "127.0.0.1")
    db_port = os.getenv("POSTGRES_PORT", "5432")
    db_name = os.getenv("POSTGRES_DB", "supermercado_db")
    db_user = os.getenv("POSTGRES_USER", "postgres")

    print(f"[Persistencia] Conectando a PostgreSQL en {db_host}:{db_port}/{db_name} como {db_user}...")

    return psycopg2.connect(
        host=db_host,
        port=db_port,
        database=db_name,
        user=db_user,
        password=os.getenv("POSTGRES_PASSWORD", "tu_password"),
        connect_timeout=10,
        options="-c client_encoding=UTF8",
    )


def recrear_tabla(cursor, nombre_tabla, columnas_sql):
    cursor.execute(f"DROP TABLE IF EXISTS {nombre_tabla}")
    cursor.execute(f"CREATE TABLE {nombre_tabla} ({columnas_sql})")


def df_a_rows(df, columnas):
    return [tuple(row[columna] for columna in columnas) for row in df.collect()]


def guardar_rows(cursor, nombre_tabla, columnas, rows):
    if not rows:
        print(f"[Persistencia] Tabla '{nombre_tabla}' no tiene filas para guardar.")
        return

    placeholders = ", ".join(["%s"] * len(columnas))
    columnas_sql = ", ".join(columnas)
    cursor.executemany(
        f"INSERT INTO {nombre_tabla} ({columnas_sql}) VALUES ({placeholders})",
        rows,
    )
    print(f"[Persistencia] Tabla '{nombre_tabla}' guardada con {len(rows)} filas.")


def sql_literal(value):
    if value is None:
        return "NULL"
    return "'" + str(value).replace("'", "''") + "'"


def sql_value(value):
    if value is None:
        return "NULL"
    if isinstance(value, (int, float)):
        return str(value)
    return sql_literal(value)


def insert_sql(nombre_tabla, columnas, rows):
    if not rows:
        return []

    columnas_sql = ", ".join(columnas)
    statements = []
    chunk_size = 500

    for start in range(0, len(rows), chunk_size):
        chunk = rows[start:start + chunk_size]
        values_sql = ",\n".join(
            "(" + ", ".join(sql_value(value) for value in row) + ")"
            for row in chunk
        )
        statements.append(f"INSERT INTO {nombre_tabla} ({columnas_sql}) VALUES\n{values_sql};")

    return statements


def guardar_en_db_con_docker(tablas):
    print("[Persistencia] Usando docker exec + psql como alternativa a psycopg2...")

    sql = [
        "BEGIN;",
        "DROP TABLE IF EXISTS kpis_globales;",
        "DROP TABLE IF EXISTS top_productos;",
        "DROP TABLE IF EXISTS top_clientes;",
        "DROP TABLE IF EXISTS categorias_rentables;",
        "DROP TABLE IF EXISTS serie_tiempo;",
        "DROP TABLE IF EXISTS boxplot_clientes;",
        "CREATE TABLE kpis_globales (total_unidades_vendidas BIGINT, total_transacciones BIGINT);",
        "CREATE TABLE top_productos (id_producto INTEGER, unidades_vendidas BIGINT);",
        "CREATE TABLE top_clientes (cliente_id INTEGER, frecuencia_transacciones BIGINT, volumen_compra BIGINT);",
        "CREATE TABLE categorias_rentables (nombre_categoria TEXT, unidades_vendidas BIGINT);",
        "CREATE TABLE serie_tiempo (fecha DATE, unidades_vendidas BIGINT, transacciones_diarias BIGINT);",
        "CREATE TABLE boxplot_clientes (cliente_id INTEGER, cantidad_total_cliente BIGINT);",
    ]

    for nombre_tabla, columnas, rows in tablas:
        sql.extend(insert_sql(nombre_tabla, columnas, rows))
        print(f"[Persistencia] Tabla '{nombre_tabla}' preparada con {len(rows)} filas.")

    sql.append("COMMIT;")

    command = [
        "docker",
        "exec",
        "-i",
        "supermercado-postgres",
        "psql",
        "-U",
        os.getenv("POSTGRES_USER", "postgres"),
        "-d",
        os.getenv("POSTGRES_DB", "supermercado_db"),
    ]

    result = subprocess.run(
        command,
        input="\n".join(sql),
        text=True,
        capture_output=True,
        encoding="utf-8",
    )

    if result.returncode != 0:
        print(result.stdout)
        print(result.stderr)
        raise RuntimeError("No se pudieron cargar las tablas con docker exec psql.")

    print("[Persistencia] Tablas cargadas correctamente usando docker exec psql.")


def guardar_en_db():
    print("\n[Persistencia] Guardando tablas analíticas en PostgreSQL...")

    tablas = [
        (
            "kpis_globales",
            ["total_unidades_vendidas", "total_transacciones"],
            df_a_rows(df_kpis, ["total_unidades_vendidas", "total_transacciones"]),
        ),
        (
            "top_productos",
            ["id_producto", "unidades_vendidas"],
            df_a_rows(df_top_productos, ["id_producto", "unidades_vendidas"]),
        ),
        (
            "top_clientes",
            ["cliente_id", "frecuencia_transacciones", "volumen_compra"],
            df_a_rows(df_top_clientes, ["cliente_id", "frecuencia_transacciones", "volumen_compra"]),
        ),
        (
            "categorias_rentables",
            ["nombre_categoria", "unidades_vendidas"],
            df_a_rows(df_categorias_rentables, ["nombre_categoria", "unidades_vendidas"]),
        ),
        (
            "serie_tiempo",
            ["fecha", "unidades_vendidas", "transacciones_diarias"],
            df_a_rows(df_serie_tiempo, ["fecha", "unidades_vendidas", "transacciones_diarias"]),
        ),
        (
            "boxplot_clientes",
            ["cliente_id", "cantidad_total_cliente"],
            df_a_rows(df_boxplot, ["cliente_id", "cantidad_total_cliente"]),
        ),
    ]

    try:
        conn = conectar_postgres()
    except Exception as exc:
        print(f"[Persistencia] psycopg2 no pudo conectar: {type(exc).__name__}: {exc}")
        guardar_en_db_con_docker(tablas)
        return

    with conn:
        with conn.cursor() as cursor:
            recrear_tabla(cursor, "kpis_globales", "total_unidades_vendidas BIGINT, total_transacciones BIGINT")
            recrear_tabla(cursor, "top_productos", "id_producto INTEGER, unidades_vendidas BIGINT")
            recrear_tabla(cursor, "top_clientes", "cliente_id INTEGER, frecuencia_transacciones BIGINT, volumen_compra BIGINT")
            recrear_tabla(cursor, "categorias_rentables", "nombre_categoria TEXT, unidades_vendidas BIGINT")
            recrear_tabla(cursor, "serie_tiempo", "fecha DATE, unidades_vendidas BIGINT, transacciones_diarias BIGINT")
            recrear_tabla(cursor, "boxplot_clientes", "cliente_id INTEGER, cantidad_total_cliente BIGINT")

            guardar_rows(
                cursor,
                "kpis_globales",
                ["total_unidades_vendidas", "total_transacciones"],
                tablas[0][2],
            )
            guardar_rows(
                cursor,
                "top_productos",
                ["id_producto", "unidades_vendidas"],
                tablas[1][2],
            )
            guardar_rows(
                cursor,
                "top_clientes",
                ["cliente_id", "frecuencia_transacciones", "volumen_compra"],
                tablas[2][2],
            )
            guardar_rows(
                cursor,
                "categorias_rentables",
                ["nombre_categoria", "unidades_vendidas"],
                tablas[3][2],
            )
            guardar_rows(
                cursor,
                "serie_tiempo",
                ["fecha", "unidades_vendidas", "transacciones_diarias"],
                tablas[4][2],
            )
            guardar_rows(
                cursor,
                "boxplot_clientes",
                ["cliente_id", "cantidad_total_cliente"],
                tablas[5][2],
            )

    print("[Persistencia] Proceso terminado correctamente.")


if ENABLE_DB_WRITE:
    guardar_en_db()
else:
    print("\n[Persistencia] ENABLE_DB_WRITE=0 -> no se escribieron tablas en PostgreSQL.")

spark.stop()
