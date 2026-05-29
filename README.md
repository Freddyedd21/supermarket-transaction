# supermarket-transaction

Proyecto para análisis de transacciones de supermercado usando PySpark (ETL/aggregations) y visualización (frontend).

## Dataset (formato y ubicación)

Los datos viven en `data/DataSet/` y **usan el delimitador de tubería `|`** (no coma).

Archivos principales:

- `data/DataSet/Transactions/*_Tran.csv`
	- **Rol:** Transacciones (tickets)
	- **Formato:** sin encabezado, separado por `|`
	- **Columnas:** `Fecha | Tienda_ID | Cliente_ID o identificador recurrente | Productos`
	- **Nota:** `Productos` es un string con **IDs de producto separados por espacios** (ej: `"20 3 1"`).

- `data/DataSet/Products/ProductCategory.csv`
	- **Rol:** puente producto-categoría para el ranking de categorías
	- **Formato:** con encabezado, separado por `|`
	- **Columnas:** `v.Code_pr | v.code`
	- **Nota:** puede asignar un mismo producto a varias categorías; para el top de categorías se cuenta cada relación.

- `data/DataSet/Products/Categories.csv`
	- **Rol:** dimensión de categorías (diccionario)
	- **Formato:** sin encabezado, separado por `|`
	- **Columnas:** `ID_Categoria | Nombre_Categoria`
	- **Ejemplo:** `5|PANES-TOSTADAS`.

## Modelo relacional (cómo se conectan los archivos)

El dataset se comporta como un modelo relacional tipo **estrella**:

| Archivo | Rol en el negocio | Columnas detectadas | Observación clave |
|---|---|---|---|
| `*_Tran.csv` | Tabla de hechos (Fact) | `Fecha | Tienda_ID | Ticket_ID | Productos` | Cada fila representa un ticket/canasta; `Productos` viene “compactado” en un string. |
| `ProductCategory.csv` | Tabla puente | `v.Code_pr | v.code` | Conecta cada producto con su categoría. |
| `Categories.csv` | Dimensión | `ID_Categoria | Nombre_Categoria` | Traduce el código de categoría a un nombre legible. |

## Hallazgos críticos para el código

- **Anatomía de una compra:**
	- Ejemplo: `2013-01-01 | 102 | 530 | 20 3 1`
	- Significa que el 1 de enero de 2013, en la tienda 102, el ticket 530 incluye los productos `20`, `3` y `1`.
	- Para poder contar y agregar correctamente, la estrategia es: **split** de `Productos` y luego **explode** para crear una fila por producto.

- **Cliente / identificador recurrente:**
	- La tercera columna de transacciones se usa como `cliente_id` porque se repite en el tiempo: hay 131.186 valores distintos frente a 1.108.987 transacciones.
	- Si el origen del dataset la documenta como ticket, debe explicarse como un identificador recurrente/proxy para el análisis de frecuencia.

- **Lectura correcta de categorías:**
	- El análisis de top 10 categorías cruza cada código de `Productos` con `ProductCategory.csv` y luego con `Categories.csv`.
	- Si un producto pertenece a varias categorías, suma una unidad en cada categoría relacionada.
	- Este cruce reproduce el top esperado donde `CARNES PROCESADAS AL VACIO` y `VERDURAS RAIZ,TUBERCULO Y BULBOS` aparecen con `1.811.523` unidades.
	- Los códigos vendidos sin relación en `ProductCategory.csv` se excluyen del ranking de categorías.

- **Importante para visualizaciones:**
	- Si no se incorpora `Categories.csv`, los análisis por categoría mostrarán solo IDs (`1, 2, 3...`) en lugar de nombres (ej: `YOGURT`, `PANES-TOSTADAS`).

## Plan de vuelo del pipeline (ETL)

Flujo recomendado de transformaciones y cruces (joins):

```text
[Tickets con String de Productos]
	|
	v  (Split & Explode)
[Fila por cada Código Vendido] ---> [ProductCategory.csv] ---> [Categories.csv]
```

Salida esperada (tabla unificada) para facilitar KPIs y gráficos:

- `fecha, tienda_id, cliente_id, id_producto, nombre_categoria`

## Probar localmente (Spark)

Requisitos:

- Python
- Java instalado (Spark lo necesita)

Ejecutar el script en Windows (PowerShell):

```powershell
cd C:\Users\samue\OneDrive\Desktop\supermarket-transaction
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install pyspark

cd .\spark_processing
python .\aggregations.py
```

Notas:

- En Windows, el script **no escribe a PostgreSQL por defecto** (`ENABLE_DB_WRITE=0`) para evitar el crash de `winutils.exe`/`HADOOP_HOME` cuando Spark intenta cargar jars externos.
- El script usa rutas basadas en el proyecto y expande los `*_Tran.csv` con Python para evitar problemas de globbing en Spark/Hadoop en Windows.

## Levantar PostgreSQL (Docker)

Desde la raíz del proyecto:

```powershell
docker compose up -d
docker compose ps
```

Credenciales por defecto (alineadas con el backend):

- DB: `supermercado_db`
- User: `postgres`
- Pass: `tu_password`
- Host/Port desde Windows: `localhost:5432`

Si cambias credenciales, ajusta también [backend/config/database.py](backend/config/database.py) y [docker-compose.yml](docker-compose.yml).

## Backend (FastAPI)

```powershell
cd .\backend
pip install -r .\requirements.txt
python -m uvicorn main:app --reload --port 8000
```

Endpoints principales:

- `GET http://127.0.0.1:8000/api/analytics/kpis`
- `GET http://127.0.0.1:8000/api/analytics/top_productos`
- `GET http://127.0.0.1:8000/api/analytics/serie_tiempo`
- `GET http://127.0.0.1:8000/api/analytics/boxplot_clientes`
- `GET http://127.0.0.1:8000/api/analytics/correlacion_clientes`

## Frontend

```powershell
cd .\frontend
npm install
npm run dev
```

Vistas principales:

- `http://localhost:5173/` - Resumen Ejecutivo.
- `http://localhost:5173/visualizaciones` - Visualizaciones Analíticas: serie de tiempo, boxplot y heatmap de correlación.

Si sólo necesitas regenerar las métricas del heatmap sin correr todo Spark:

```powershell
node .\backend\update_client_metrics_table.js
```

## Pregunta de validación

¿Tiene sentido cómo se conectan los tres archivos entre sí, o hay algún dato del dataset que te genere dudas antes de implementar los cruces (joins)?
