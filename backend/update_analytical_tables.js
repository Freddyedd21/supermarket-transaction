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

function insertChunks(tableName, columns, rows, chunkSize = 500) {
  const statements = [];
  const columnSql = columns.join(", ");

  for (let start = 0; start < rows.length; start += chunkSize) {
    const chunk = rows.slice(start, start + chunkSize);
    const valuesSql = chunk
      .map((row) => `(${row.map(sqlValue).join(", ")})`)
      .join(",\n");

    statements.push(`INSERT INTO ${tableName} (${columnSql}) VALUES\n${valuesSql};`);
  }

  return statements;
}

const categoryNames = new Map(
  readLines(path.join(dataRoot, "Products", "Categories.csv")).map((line) => {
    const [id, name] = line.split("|");
    return [id.trim(), name.trim()];
  }),
);

const productCategories = new Map();
const productCategoryRows = readLines(path.join(dataRoot, "Products", "ProductCategory.csv")).slice(1);

for (const line of productCategoryRows) {
  const [productId, categoryId] = line.split("|").map((value) => value.trim());
  const categories = productCategories.get(productId) ?? new Set();
  categories.add(categoryNames.get(categoryId) ?? `Categoria ${categoryId}`);
  productCategories.set(productId, categories);
}

const clientStats = new Map();
const transactionsDir = path.join(dataRoot, "Transactions");

function getClient(clientId) {
  if (!clientStats.has(clientId)) {
    clientStats.set(clientId, {
      transactions: 0,
      totalUnits: 0,
      products: new Set(),
      categories: new Set(),
    });
  }

  return clientStats.get(clientId);
}

for (const file of fs.readdirSync(transactionsDir).filter((name) => name.endsWith("_Tran.csv"))) {
  for (const line of readLines(path.join(transactionsDir, file))) {
    const [, , clientId, productsText] = line.split("|").map((value) => value?.trim());
    if (!clientId || !productsText) continue;

    const products = productsText.split(/\s+/).filter(Boolean);
    const client = getClient(clientId);
    client.transactions += 1;
    client.totalUnits += products.length;

    for (const productId of products) {
      client.products.add(productId);
      const categories = productCategories.get(productId) ?? new Set();

      for (const category of categories) {
        client.categories.add(category);
      }
    }
  }
}

const metricRows = [...clientStats.entries()]
  .map(([clientId, stats]) => [
    Number(clientId),
    stats.transactions,
    stats.totalUnits,
    stats.products.size,
    Number((stats.totalUnits / stats.transactions).toFixed(6)),
    stats.categories.size,
  ])
  .sort((a, b) => a[0] - b[0]);

const sql = [
  "BEGIN;",
  "DROP TABLE IF EXISTS metricas_clientes;",
  "CREATE TABLE metricas_clientes (cliente_id INTEGER, frecuencia_transacciones BIGINT, volumen_total BIGINT, productos_distintos BIGINT, cantidad_promedio DOUBLE PRECISION, diversidad_categorias BIGINT);",
  ...insertChunks(
    "metricas_clientes",
    [
      "cliente_id",
      "frecuencia_transacciones",
      "volumen_total",
      "productos_distintos",
      "cantidad_promedio",
      "diversidad_categorias",
    ],
    metricRows,
  ),
  "COMMIT;",
].join("\n");

const result = spawnSync(
  "docker",
  ["exec", "-i", "supermercado-postgres", "psql", "-U", "postgres", "-d", "supermercado_db"],
  {
    input: sql,
    encoding: "utf8",
    maxBuffer: 1024 * 1024 * 20,
  },
);

process.stdout.write(result.stdout);
process.stderr.write(result.stderr);

if (result.status !== 0) {
  process.exit(result.status);
}

console.log(`metricas_clientes actualizada con ${metricRows.length} clientes.`);
