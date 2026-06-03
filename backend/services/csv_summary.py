from collections import Counter
from datetime import date as date_type
from functools import lru_cache
from pathlib import Path


PROJECT_ROOT = Path(__file__).resolve().parents[2]
DATA_ROOT = PROJECT_ROOT / "data" / "DataSet"
TRANSACTIONS_DIR = DATA_ROOT / "Transactions"
CATEGORIES_FILE = DATA_ROOT / "Products" / "Categories.csv"
PRODUCT_CATEGORY_FILE = DATA_ROOT / "Products" / "ProductCategory.csv"

WEEKDAYS = [
    "Lunes",
    "Martes",
    "Miercoles",
    "Jueves",
    "Viernes",
    "Sabado",
    "Domingo",
]


def _read_categories():
    categories = {}

    with CATEGORIES_FILE.open("r", encoding="utf-8") as file:
        for line in file:
            line = line.strip()
            if not line:
                continue

            category_id, category_name = line.split("|", 1)
            categories[category_id.strip()] = category_name.strip()

    return categories


def _read_first_product_categories(categories):
    product_categories = {}

    with PRODUCT_CATEGORY_FILE.open("r", encoding="utf-8") as file:
        next(file, None)

        for line in file:
            line = line.strip()
            if not line:
                continue

            product_id, category_id = [part.strip() for part in line.split("|", 1)]
            category_name = categories.get(category_id)
            if category_name and product_id not in product_categories:
                product_categories[product_id] = category_name

    return product_categories


def _transaction_files():
    return sorted(TRANSACTIONS_DIR.glob("*_Tran.csv"))


def _top_counter(counter, key_name, value_name, limit=10):
    return [
        {key_name: int(key) if str(key).isdigit() else key, value_name: value}
        for key, value in sorted(counter.items(), key=lambda item: (-item[1], str(item[0])))[:limit]
    ]


def _weekday_index(value):
    try:
        return date_type.fromisoformat(value).weekday()
    except ValueError:
        return None


@lru_cache(maxsize=32)
def build_summary(store=None, start_date=None, end_date=None):
    categories = _read_categories()
    product_categories = _read_first_product_categories(categories)
    transaction_files = _transaction_files()

    product_units = Counter()
    category_units = Counter()
    daily_units = Counter()
    daily_transactions = Counter()
    client_transactions = Counter()
    client_units = Counter()
    weekday_transactions = Counter()
    weekday_units = Counter()
    stores = set()
    clients = set()

    total_units = 0
    filtered_transactions = 0
    min_date = None
    max_date = None

    for file_path in transaction_files:
        with file_path.open("r", encoding="utf-8") as file:
            for line in file:
                line = line.strip()
                if not line:
                    continue

                parts = line.split("|")
                if len(parts) != 4:
                    continue

                date, store_id, client_id, products_text = [part.strip() for part in parts]
                stores.add(store_id)
                min_date = date if min_date is None or date < min_date else min_date
                max_date = date if max_date is None or date > max_date else max_date

                products = [product for product in products_text.split() if product]
                if not products:
                    continue

                matches_filters = True
                if store and store_id != store:
                    matches_filters = False
                if start_date and date < start_date:
                    matches_filters = False
                if end_date and date > end_date:
                    matches_filters = False

                if matches_filters:
                    total_units += len(products)
                    filtered_transactions += 1
                    clients.add(client_id)
                    client_transactions[client_id] += 1
                    client_units[client_id] += len(products)
                    daily_transactions[date] += 1
                    daily_units[date] += len(products)

                    weekday = _weekday_index(date)
                    if weekday is not None:
                        weekday_transactions[weekday] += 1
                        weekday_units[weekday] += len(products)

                    for product_id in products:
                        product_units[product_id] += 1
                        category_name = product_categories.get(product_id)
                        if category_name:
                            category_units[category_name] += 1

    top_clients = [
        {
            "cliente_id": int(client_id) if str(client_id).isdigit() else client_id,
            "frecuencia_transacciones": client_transactions[client_id],
            "volumen_compra": client_units[client_id],
        }
        for client_id in sorted(client_units, key=lambda key: (-client_units[key], str(key)))[:10]
    ]

    serie_tiempo = [
        {
            "fecha": date,
            "unidades_vendidas": daily_units[date],
            "transacciones_diarias": daily_transactions[date],
        }
        for date in sorted(daily_units)
    ]

    dias_semana = [
        {
            "dia": weekday,
            "orden": index,
            "transacciones": weekday_transactions[index],
            "unidades_vendidas": weekday_units[index],
        }
        for index, weekday in enumerate(WEEKDAYS)
    ]

    return {
        "kpis": {
            "total_unidades_vendidas": total_units,
            "total_transacciones": filtered_transactions,
            "clientes_unicos": len(clients),
        },
        "top_productos": _top_counter(product_units, "id_producto", "unidades_vendidas"),
        "top_clientes": top_clients,
        "categorias_rentables": _top_counter(category_units, "nombre_categoria", "unidades_vendidas"),
        "serie_tiempo": serie_tiempo,
        "dias_semana": dias_semana,
        "filtros": {
            "tiendas": sorted(stores, key=lambda value: int(value) if value.isdigit() else value),
            "fecha_min": min_date,
            "fecha_max": max_date,
        },
    }
