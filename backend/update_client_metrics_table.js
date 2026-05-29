const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const projectRoot = path.resolve(__dirname, "..");
const dataRoot = path.join(projectRoot, "data", "DataSet");

function readLines(filePath) {
  return fs
    .readFileSync(filePath, "utf8")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function sqlValue(value) {
  if (value === null || value === undefined) return "NULL";
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "NULL";
  return `'${String(value).replaceAll("'", "''")}'`;
}

const categoryNames = new Map(
  readLines(path.join(dataRoot, "Products", "Categories.csv")).map((line) => {
    const [id, name] = line.split("|");
    return [id.trim(), name.trim()];
  }),
);

const metrics = new Map();
const transactionsDir = path.join(dataRoot, "Transactions");

function metricFor(clientId) {
  if (!metrics.has(clientId)) {
    metrics.set(clientId, {
      frecuencia: 0,
      volumen: 0,
      productos: new Set(),
      categorias: new Set(),
    });
  }

  return metrics.get(clientId);
}

for (const file of fs.readdirSync(transactionsDir).filter((name) => name.endsWith("_Tran.csv"))) {
  for (const line of readLines(path.join(transactionsDir, file))) {
    const [, , clientId, productsText] = line.split("|").map((value) => value?.trim());
    if (!clientId || !productsText) continue;

    const products = productsText.split(/\s+/).filter(Boolean);
    const metric = metricFor(clientId);
    metric.frecuencia += 1;
    metric.volumen += products.length;

    for (const productId of products) {
      metric.productos.add(productId);

      const category = categoryNames.get(productId);
      if (category) {
        metric.categorias.add(category);
      }
    }
  }
}

const rows = [...metrics.entries()].map(([clientId, metric]) => [
  Number(clientId),
  metric.frecuencia,
  metric.volumen,
  metric.productos.size,
  Number((metric.volumen / metric.frecuencia).toFixed(6)),
  metric.categorias.size,
]);

const sql = [
  "BEGIN;",
  "DROP TABLE IF EXISTS metricas_clientes;",
  "CREATE TABLE metricas_clientes (cliente_id INTEGER, frecuencia_transacciones BIGINT, volumen_total BIGINT, productos_distintos BIGINT, cantidad_promedio DOUBLE PRECISION, diversidad_categorias BIGINT);",
];

const chunkSize = 1000;
for (let start = 0; start < rows.length; start += chunkSize) {
  const chunk = rows.slice(start, start + chunkSize);
  const values = chunk.map((row) => `(${row.map(sqlValue).join(", ")})`).join(",\n");
  sql.push(
    "INSERT INTO metricas_clientes (cliente_id, frecuencia_transacciones, volumen_total, productos_distintos, cantidad_promedio, diversidad_categorias) VALUES",
    `${values};`,
  );
}
sql.push("COMMIT;");

const result = spawnSync(
  "docker",
  ["exec", "-i", "supermercado-postgres", "psql", "-U", "postgres", "-d", "supermercado_db"],
  {
    input: sql.join("\n"),
    encoding: "utf8",
  },
);

process.stdout.write(result.stdout);
process.stderr.write(result.stderr);

if (result.status !== 0) {
  process.exit(result.status);
}

console.log(`Metricas de clientes actualizadas: ${rows.length} clientes`);
