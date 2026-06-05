from collections import Counter, defaultdict
from functools import lru_cache
from itertools import combinations
import json
from math import log1p, sqrt
from pathlib import Path


PROJECT_ROOT = Path(__file__).resolve().parents[2]
DATA_ROOT = PROJECT_ROOT / "data" / "DataSet"
TRANSACTIONS_DIR = DATA_ROOT / "Transactions"
CATEGORIES_FILE = DATA_ROOT / "Products" / "Categories.csv"
PRODUCT_CATEGORY_FILE = DATA_ROOT / "Products" / "ProductCategory.csv"
CACHE_FILE = PROJECT_ROOT / "backend" / "cache" / "advanced_summary.json"

CLUSTER_COUNT = 4
KMEANS_ITERATIONS = 8
KMEANS_TRAIN_LIMIT = 15000
PAIR_SAMPLE_STRIDE = 12
MAX_PAIR_ITEMS = 24
FEATURE_NAMES = [
    "frecuencia_transacciones",
    "productos_distintos",
    "volumen_total",
    "diversidad_categorias",
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


def _client_template():
    return {
        "frecuencia_transacciones": 0,
        "volumen_total": 0,
        "productos": set(),
        "categorias": set(),
    }


def _load_market_model():
    categories = _read_categories()
    product_categories = _read_first_product_categories(categories)
    clients = defaultdict(_client_template)
    client_products = defaultdict(set)
    product_counts = Counter()
    pair_counts = Counter()
    total_transactions = 0
    total_units = 0

    for file_path in _transaction_files():
        with file_path.open("r", encoding="utf-8") as file:
            for line in file:
                line = line.strip()
                if not line:
                    continue

                parts = line.split("|")
                if len(parts) != 4:
                    continue

                _, _, client_id, products_text = [part.strip() for part in parts]
                products = [product for product in products_text.split() if product]
                if not products:
                    continue

                unique_products = sorted(set(products), key=lambda value: int(value) if value.isdigit() else value)
                client = clients[client_id]
                client["frecuencia_transacciones"] += 1
                client["volumen_total"] += len(products)
                client["productos"].update(unique_products)
                client_products[client_id].update(unique_products)

                for product_id in products:
                    product_counts[product_id] += 1
                    category_name = product_categories.get(product_id)
                    if category_name:
                        client["categorias"].add(category_name)

                total_transactions += 1
                total_units += len(products)

                if total_transactions % PAIR_SAMPLE_STRIDE == 0:
                    pair_products = unique_products[:MAX_PAIR_ITEMS]
                    for product_a, product_b in combinations(pair_products, 2):
                        pair_counts[(product_a, product_b)] += 1

    client_rows = []
    for client_id, stats in clients.items():
        frequency = stats["frecuencia_transacciones"]
        volume = stats["volumen_total"]
        distinct_products = len(stats["productos"])
        category_diversity = len(stats["categorias"])

        client_rows.append(
            {
                "cliente_id": client_id,
                "frecuencia_transacciones": frequency,
                "productos_distintos": distinct_products,
                "volumen_total": volume,
                "diversidad_categorias": category_diversity,
                "cantidad_promedio": volume / frequency if frequency else 0,
            }
        )

    neighbors = defaultdict(list)
    for (product_a, product_b), pair_count in pair_counts.items():
        neighbors[product_a].append((product_b, pair_count))
        neighbors[product_b].append((product_a, pair_count))

    for product_id in neighbors:
        neighbors[product_id].sort(key=lambda item: (-item[1], item[0]))

    return {
        "client_rows": client_rows,
        "client_products": {key: value for key, value in client_products.items()},
        "product_counts": product_counts,
        "neighbors": dict(neighbors),
        "total_transactions": total_transactions,
        "total_units": total_units,
    }


def _standardize(rows):
    transformed = []
    for row in rows:
        transformed.append([log1p(float(row[name])) for name in FEATURE_NAMES])

    columns = list(zip(*transformed))
    means = [sum(column) / len(column) for column in columns]
    stds = []
    for column, mean in zip(columns, means):
        variance = sum((value - mean) ** 2 for value in column) / len(column)
        stds.append(sqrt(variance) or 1)

    return [
        [(value - means[index]) / stds[index] for index, value in enumerate(values)]
        for values in transformed
    ]


def _distance(point, centroid):
    return sum((point[index] - centroid[index]) ** 2 for index in range(len(point)))


def _fit_kmeans(rows):
    if not rows:
        return [], []

    points = _standardize(rows)
    if len(points) > KMEANS_TRAIN_LIMIT:
        stride = max(len(points) // KMEANS_TRAIN_LIMIT, 1)
        train_indexes = list(range(0, len(points), stride))[:KMEANS_TRAIN_LIMIT]
    else:
        train_indexes = list(range(len(points)))

    sorted_indexes = sorted(train_indexes, key=lambda index: rows[index]["volumen_total"])
    seed_positions = [0.08, 0.35, 0.65, 0.92]
    centroids = [
        points[sorted_indexes[min(int((len(sorted_indexes) - 1) * position), len(sorted_indexes) - 1)]][:]
        for position in seed_positions[:CLUSTER_COUNT]
    ]
    train_assignments = [0] * len(train_indexes)

    for _ in range(KMEANS_ITERATIONS):
        changed = False

        for local_index, point_index in enumerate(train_indexes):
            point = points[point_index]
            cluster = min(range(len(centroids)), key=lambda centroid_index: _distance(point, centroids[centroid_index]))
            if train_assignments[local_index] != cluster:
                train_assignments[local_index] = cluster
                changed = True

        totals = [[0.0 for _ in FEATURE_NAMES] for _ in centroids]
        counts = [0 for _ in centroids]

        for assignment, point_index in zip(train_assignments, train_indexes):
            point = points[point_index]
            counts[assignment] += 1
            for feature_index, value in enumerate(point):
                totals[assignment][feature_index] += value

        for cluster_index, count in enumerate(counts):
            if count:
                centroids[cluster_index] = [value / count for value in totals[cluster_index]]

        if not changed:
            break

    assignments = [
        min(range(len(centroids)), key=lambda centroid_index: _distance(point, centroids[centroid_index]))
        for point in points
    ]

    return assignments, points


def _cluster_label(rank):
    labels = [
        (
            "Clientes ocasionales",
            "Compran pocas veces, con bajo volumen y menor diversidad. Son candidatos para campañas de reactivacion.",
        ),
        (
            "Compradores regulares",
            "Mantienen una actividad estable y canastas medianas. Funcionan bien para promociones por categoria.",
        ),
        (
            "Clientes de alto volumen",
            "Compran mas unidades y visitan con mayor frecuencia. Conviene priorizar retencion y beneficios.",
        ),
        (
            "Clientes intensivos y diversos",
            "Concentran alto volumen, frecuencia y variedad de productos. Son el segmento mas valioso para fidelizacion.",
        ),
    ]

    return labels[min(rank, len(labels) - 1)]


def _summarize_clusters(rows, assignments, points):
    cluster_groups = defaultdict(list)
    for row, assignment in zip(rows, assignments):
        cluster_groups[assignment].append(row)

    raw_summaries = []
    for cluster, group in cluster_groups.items():
        averages = {
            name: sum(float(row[name]) for row in group) / len(group)
            for name in FEATURE_NAMES
        }
        raw_summaries.append(
            {
                "cluster_original": cluster,
                "clientes": len(group),
                "promedios": averages,
                "score": averages["volumen_total"] + averages["frecuencia_transacciones"] * 2,
            }
        )

    raw_summaries.sort(key=lambda item: item["score"])
    cluster_rank = {item["cluster_original"]: index for index, item in enumerate(raw_summaries)}
    total_clients = len(rows)

    clusters = []
    for item in raw_summaries:
        rank = cluster_rank[item["cluster_original"]]
        name, interpretation = _cluster_label(rank)
        clusters.append(
            {
                "cluster": rank,
                "nombre": name,
                "clientes": item["clientes"],
                "porcentaje": round((item["clientes"] / total_clients) * 100, 2),
                "promedios": {
                    key: round(value, 2)
                    for key, value in item["promedios"].items()
                },
                "interpretacion": interpretation,
            }
        )

    sample_by_cluster = defaultdict(int)
    points_output = []
    max_samples_per_cluster = 70

    for row, assignment, point in zip(rows, assignments, points):
        cluster = cluster_rank[assignment]
        if sample_by_cluster[cluster] >= max_samples_per_cluster:
            continue

        sample_by_cluster[cluster] += 1
        points_output.append(
            {
                "cliente_id": int(row["cliente_id"]) if str(row["cliente_id"]).isdigit() else row["cliente_id"],
                "cluster": cluster,
                "x": round(log1p(row["volumen_total"]), 4),
                "y": round(log1p(row["productos_distintos"]), 4),
                "frecuencia_transacciones": row["frecuencia_transacciones"],
                "volumen_total": row["volumen_total"],
                "productos_distintos": row["productos_distintos"],
                "diversidad_categorias": row["diversidad_categorias"],
            }
        )

    return clusters, points_output


def _product_recommendations(model, product_id, limit=8):
    product_key = str(product_id).strip()
    product_count = model["product_counts"].get(product_key, 0)
    recommendations = []

    for related_product, pair_count in model["neighbors"].get(product_key, [])[:limit]:
        related_count = model["product_counts"].get(related_product, 1)
        confidence = pair_count / product_count if product_count else 0
        lift = confidence / (related_count / model["total_transactions"]) if model["total_transactions"] else 0
        recommendations.append(
            {
                "id_producto": int(related_product) if related_product.isdigit() else related_product,
                "compras_conjuntas": pair_count,
                "confianza": round(confidence, 4),
                "lift": round(lift, 2),
                "interpretacion": f"Se compra junto con el producto {product_key} en {pair_count} tickets.",
            }
        )

    return recommendations


def _client_recommendations(model, client_id, limit=8):
    client_key = str(client_id).strip()
    owned_products = model["client_products"].get(client_key, set())
    scores = defaultdict(float)
    joint_counts = Counter()

    for product_id in owned_products:
        base_count = model["product_counts"].get(product_id, 1)
        for related_product, pair_count in model["neighbors"].get(product_id, [])[:30]:
            if related_product in owned_products:
                continue

            scores[related_product] += pair_count / base_count
            joint_counts[related_product] += pair_count

    if not scores:
        for product_id, count in model["product_counts"].most_common(limit * 2):
            if product_id not in owned_products:
                scores[product_id] = count / max(model["total_transactions"], 1)
                joint_counts[product_id] = count

    recommendations = []
    for product_id, score in sorted(scores.items(), key=lambda item: (-item[1], item[0]))[:limit]:
        recommendations.append(
            {
                "id_producto": int(product_id) if product_id.isdigit() else product_id,
                "score": round(score, 4),
                "compras_conjuntas": joint_counts[product_id],
                "interpretacion": f"Sugerido por productos que el cliente {client_key} ya compro.",
            }
        )

    return recommendations


@lru_cache(maxsize=1)
def _build_model():
    model = _load_market_model()
    assignments, points = _fit_kmeans(model["client_rows"])
    clusters, sampled_points = _summarize_clusters(model["client_rows"], assignments, points)
    top_clients = sorted(
        model["client_rows"],
        key=lambda row: (-row["volumen_total"], str(row["cliente_id"])),
    )[:20]
    top_products = model["product_counts"].most_common(20)

    model["segmentacion"] = {
        "total_clientes": len(model["client_rows"]),
        "variables": FEATURE_NAMES,
        "clusters": clusters,
        "puntos": sampled_points,
        "interpretacion_general": (
            "La segmentacion separa clientes por frecuencia, volumen, variedad de productos "
            "y diversidad de categorias. Los valores fueron escalados antes de aplicar K-Means."
        ),
    }
    model["recomendador"] = {
        "metodo": "Reglas de asociacion por co-ocurrencia en tickets.",
        "clientes_sugeridos": [
            {
                "cliente_id": int(row["cliente_id"]) if str(row["cliente_id"]).isdigit() else row["cliente_id"],
                "volumen_total": row["volumen_total"],
                "frecuencia_transacciones": row["frecuencia_transacciones"],
            }
            for row in top_clients
        ],
        "productos_sugeridos": [
            {
                "id_producto": int(product_id) if product_id.isdigit() else product_id,
                "unidades_vendidas": count,
            }
            for product_id, count in top_products
        ],
    }

    return model


def _read_cached_summary():
    if not CACHE_FILE.exists():
        return None

    with CACHE_FILE.open("r", encoding="utf-8") as file:
        return json.load(file)


def _write_cached_summary(summary):
    CACHE_FILE.parent.mkdir(parents=True, exist_ok=True)
    with CACHE_FILE.open("w", encoding="utf-8") as file:
        json.dump(summary, file, ensure_ascii=False)


def build_advanced_summary(use_cache=True):
    if use_cache:
        cached_summary = _read_cached_summary()
        if cached_summary:
            return cached_summary

    model = _build_model()
    default_client = model["recomendador"]["clientes_sugeridos"][0]["cliente_id"] if model["recomendador"]["clientes_sugeridos"] else ""
    default_product = model["recomendador"]["productos_sugeridos"][0]["id_producto"] if model["recomendador"]["productos_sugeridos"] else ""

    summary = {
        "segmentacion": model["segmentacion"],
        "recomendador": model["recomendador"],
        "ejemplos": {
            "cliente_id": default_client,
            "producto_id": default_product,
            "recomendaciones_cliente": recommend_for_client(default_client) if default_client != "" else [],
            "recomendaciones_producto": recommend_for_product(default_product) if default_product != "" else [],
        },
        "regeneracion": {
            "descripcion": "Los modelos se recalculan leyendo los CSV del proyecto. Al incorporar nuevos datos, refresca la cache o vuelve a ejecutar Spark para persistir tablas.",
            "pasos": [
                "Agregar o reemplazar archivos en data/DataSet/Transactions.",
                "Ejecutar python .\\spark_processing\\aggregations.py para regenerar tablas de PostgreSQL.",
                "Usar el boton Actualizar modelos en la vista avanzada para recalcular segmentacion y recomendaciones desde los CSV.",
            ],
        },
    }
    _write_cached_summary(summary)
    return summary


def recommend_for_client(client_id, limit=8):
    return _client_recommendations(_build_model(), client_id, limit=limit)


def recommend_for_product(product_id, limit=8):
    return _product_recommendations(_build_model(), product_id, limit=limit)


def refresh_advanced_cache():
    _build_model.cache_clear()
    return build_advanced_summary(use_cache=False)
