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

function sqlText(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
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
  const categories = productCategories.get(productId) ?? [];
  categories.push(categoryNames.get(categoryId) ?? `Categoria ${categoryId}`);
  productCategories.set(productId, categories);
}

const counts = new Map();
const transactionsDir = path.join(dataRoot, "Transactions");

for (const file of fs.readdirSync(transactionsDir).filter((name) => name.endsWith("_Tran.csv"))) {
  for (const line of readLines(path.join(transactionsDir, file))) {
    const products = (line.split("|")[3] ?? "").trim().split(/\s+/).filter(Boolean);

    for (const productId of products) {
      const categories = productCategories.get(productId) ?? ["Producto sin Categoría"];

      for (const category of categories) {
        if (category === "Producto sin Categoría") continue;
        counts.set(category, (counts.get(category) ?? 0) + 1);
      }
    }
  }
}

const topCategories = [...counts.entries()]
  .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
  .slice(0, 10);

const sql = [
  "BEGIN;",
  "TRUNCATE categorias_rentables;",
  ...topCategories.map(
    ([name, units]) =>
      `INSERT INTO categorias_rentables (nombre_categoria, unidades_vendidas) VALUES (${sqlText(name)}, ${units});`,
  ),
  "COMMIT;",
].join("\n");

const result = spawnSync(
  "docker",
  ["exec", "-i", "supermercado-postgres", "psql", "-U", "postgres", "-d", "supermercado_db"],
  {
    input: sql,
    encoding: "utf8",
  },
);

process.stdout.write(result.stdout);
process.stderr.write(result.stderr);

if (result.status !== 0) {
  process.exit(result.status);
}

console.log("Categorias actualizadas:");
for (const [name, units] of topCategories) {
  console.log(`- ${name}: ${units}`);
}
