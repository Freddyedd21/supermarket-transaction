from collections import Counter, defaultdict
from pathlib import Path


PROJECT_ROOT = Path(__file__).resolve().parents[2]
DATA_ROOT = PROJECT_ROOT / "data" / "DataSet"
TRANSACTIONS_DIR = DATA_ROOT / "Transactions"
CATEGORIES_FILE = DATA_ROOT / "Products" / "Categories.csv"
PRODUCT_CATEGORY_FILE = DATA_ROOT / "Products" / "ProductCategory.csv"


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


def _read_product_categories(categories):
    product_categories = defaultdict(set)

    with PRODUCT_CATEGORY_FILE.open("r", encoding="utf-8") as file:
        next(file, None)

        for line in file:
            line = line.strip()
            if not line:
                continue

            product_id, category_id = [part.strip() for part in line.split("|", 1)]
            category_name = categories.get(category_id)
            if category_name:
                product_categories[product_id].add(category_name)

    return product_categories


def _transaction_files():
    return sorted(TRANSACTIONS_DIR.glob("*_Tran.csv"))


def _top_counter(counter, key_name, value_name, limit=10):
    return [
        {key_name: int(key) if str(key).isdigit() else key, value_name: value}
        for key, value in sorted(counter.items(), key=lambda item: (-item[1], str(item[0])))[:limit]
    ]


def build_summary(store=None, start_date=None, end_date=None):
    categories = _read_categories()
    product_categories = _read_product_categories(categories)
    transaction_files = _transaction_files()

    product_units = Counter()
    category_units = Counter()
    daily_units = Counter()
    daily_transactions = Counter()
    client_transactions = Counter()
    client_units = Counter()
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

                total_units += len(products)
                client_transactions[client_id] += 1
                client_units[client_id] += len(products)
                daily_transactions[date] += 1
                daily_units[date] += len(products)

                for product_id in products:
                    product_units[product_id] += 1

                matches_filters = True
                if store and store_id != store:
                    matches_filters = False
                if start_date and date < start_date:
                    matches_filters = False
                if end_date and date > end_date:
                    matches_filters = False

                if matches_filters:
                    filtered_transactions += 1
                    clients.add(client_id)

    for product_id, units in product_units.items():
        for category_name in product_categories.get(product_id, ()):
            category_units[category_name] += units

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
        "filtros": {
            "tiendas": sorted(stores, key=lambda value: int(value) if value.isdigit() else value),
            "fecha_min": min_date,
            "fecha_max": max_date,
        },
    }
