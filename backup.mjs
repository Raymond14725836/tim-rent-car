import { DatabaseSync, backup } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
const root = dirname(fileURLToPath(import.meta.url)),
  data = process.env.DATA_DIR || join(root, "data");
mkdirSync(join(data, "backups"), { recursive: true });
const db = new DatabaseSync(join(data, "rental.sqlite"));
const file = join(
  data,
  "backups",
  `manual-${new Date().toISOString().replaceAll(":", "-")}.sqlite`,
);
await backup(db, file);
db.close();
console.log(file);
