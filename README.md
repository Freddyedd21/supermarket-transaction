# supermarket-transaction

Proyecto para análisis de transacciones de supermercado usando PySpark (ETL/aggregations) y visualización (frontend).

## Dataset (formato y ubicación)

Los datos viven en `data/DataSet/` y **usan el delimitador de tubería `|`** (no coma).

Archivos principales:

- `data/DataSet/Transactions/*_Tran.csv`
	- **Rol:** Transacciones (tickets)
	- **Formato:** sin encabezado, separado por `|`
	- **Columnas:** `Fecha | Tienda_ID | Ticket_ID | Productos`
	- **Nota:** `Productos` es un string con **IDs de producto separados por espacios** (ej: `"20 3 1"`).

- `data/DataSet/Products/ProductCategory.csv`
	- **Rol:** puente Producto ↔ Categoría
	- **Formato:** con encabezado, separado por `|`
	- **Columnas:** `v.Code_pr | v.code`
	- **Nota:** `v.Code_pr` = ID del producto, `v.code` = ID de la categoría.

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

- **El “eslabón perdido” de clientes:**
	- El taller menciona “ID de cliente”, pero en las transacciones **no aparece** una columna de cliente.
	- Para la entrega analítica, se puede interpretar cada **Ticket_ID como un evento de compra único** (o proxy de cliente en ese instante).

- **Importante para visualizaciones:**
	- Si no se incorpora `Categories.csv`, los análisis por categoría mostrarán solo IDs (`1, 2, 3...`) en lugar de nombres (ej: `YOGURT`, `PANES-TOSTADAS`).

## Plan de vuelo del pipeline (ETL)

Flujo recomendado de transformaciones y cruces (joins):

```text
[Tickets con String de Productos]
	|
	v  (Split & Explode)
[Fila por cada Producto Individual] --- (Join por producto_id) ---> [ProductCategory.csv]
	|
	v  (Join por categoria_id)
[Categories.csv]
```

Salida esperada (tabla unificada) para facilitar KPIs y gráficos:

- `fecha, tienda_id, ticket_id, producto_id, categoria_id, nombre_categoria`

## Probar localmente (Spark)

Requisitos:

- Python
- Java instalado (Spark lo necesita)

Ejecutar el script de verificación/carga en Windows (PowerShell):

```powershell
cd C:\Users\samue\OneDrive\Desktop\supermarket-transaction
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install pyspark

cd .\spark_processing
python .\aggregations.py
```

Notas:

- En Windows es normal ver warnings sobre `winutils.exe` (`HADOOP_HOME`), pero el script debería correr igual.
- El script usa rutas basadas en el proyecto y expande los `*_Tran.csv` con Python para evitar problemas de globbing en Spark/Hadoop en Windows.

## Pregunta de validación

¿Tiene sentido cómo se conectan los tres archivos entre sí, o hay algún dato del dataset que te genere dudas antes de implementar los cruces (joins)?