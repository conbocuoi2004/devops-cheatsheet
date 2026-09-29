const fs = require("node:fs");
const path = require("node:path");
const { randomUUID } = require("node:crypto");
const initSqlJs = require("sql.js");

const bundledSeed = path.join(__dirname, "data", "cheatsheets.json");
const seed = JSON.parse(fs.readFileSync(
  fs.existsSync(bundledSeed) ? bundledSeed : path.join(__dirname, "..", "server", "data", "cheatsheets.json"), "utf8"
));

function validate(data) {
  if (!data || !Array.isArray(data.categories) || !data.categories.length || data.categories.length > 100) {
    throw new Error("Dữ liệu danh mục không hợp lệ");
  }
  const ids = new Set();
  const uids = new Set();
  for (const cat of data.categories) {
    if (typeof cat.id !== "string" || !/^[\w-]{1,80}$/.test(cat.id) || ids.has(cat.id) ||
        typeof cat.name !== "string" || cat.name.length > 200 ||
        typeof cat.icon !== "string" || cat.icon.length > 50 ||
        typeof cat.description !== "string" || cat.description.length > 2000 ||
        !Array.isArray(cat.commands) || cat.commands.length > 10000) {
      throw new Error("Danh mục không hợp lệ");
    }
    ids.add(cat.id);
    for (const c of cat.commands) {
      if (typeof c.cmd !== "string" || !c.cmd.trim() || c.cmd.length > 10000 ||
          typeof c.desc !== "string" || c.desc.length > 10000 ||
          (c.uid !== undefined && (typeof c.uid !== "string" || c.uid.length > 100 || !c.uid)) ||
          (c.uid && uids.has(c.uid))) {
        throw new Error("Lệnh không hợp lệ");
      }
      if (c.uid) uids.add(c.uid);
    }
  }
}

async function openDatabase(userData) {
  const folder = path.join(userData, "data");
  const filename = path.join(folder, "cheatsheets.db");
  fs.mkdirSync(folder, { recursive: true });
  const wasmBinary = fs.readFileSync(require.resolve("sql.js/dist/sql-wasm.wasm"));
  const SQL = await initSqlJs({ wasmBinary });
  const db = fs.existsSync(filename) ? new SQL.Database(fs.readFileSync(filename)) : new SQL.Database();

  function persist() {
    const temp = `${filename}.tmp`;
    fs.writeFileSync(temp, Buffer.from(db.export()));
    fs.renameSync(temp, filename);
  }

  db.run("PRAGMA foreign_keys = ON");
  db.run("CREATE TABLE IF NOT EXISTS categories (id TEXT PRIMARY KEY, name TEXT NOT NULL, icon TEXT NOT NULL, description TEXT NOT NULL, position INTEGER NOT NULL)");
  db.run("CREATE TABLE IF NOT EXISTS commands (uid TEXT PRIMARY KEY, category_id TEXT NOT NULL REFERENCES categories(id) ON DELETE CASCADE, cmd TEXT NOT NULL, description TEXT NOT NULL, position INTEGER NOT NULL)");
  db.run("CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)");

  function value(sql) {
    const result = db.exec(sql);
    return result[0]?.values[0]?.[0];
  }

  function replace(data) {
    validate(data);
    db.run("BEGIN TRANSACTION");
    try {
      db.run("DELETE FROM commands");
      db.run("DELETE FROM categories");
      const cats = db.prepare("INSERT INTO categories VALUES (?, ?, ?, ?, ?)");
      const cmds = db.prepare("INSERT INTO commands VALUES (?, ?, ?, ?, ?)");
      try {
        data.categories.forEach((cat, i) => {
          cats.run([cat.id, cat.name, cat.icon, cat.description, i]);
          cat.commands.forEach((c, j) => cmds.run([c.uid || randomUUID(), cat.id, c.cmd, c.desc, j]));
        });
      } finally {
        cats.free();
        cmds.free();
      }
      db.run("COMMIT");
      persist();
    } catch (error) {
      try { db.run("ROLLBACK"); } catch {}
      throw error;
    }
  }

  function read() {
    const categories = [];
    const byId = new Map();
    const cats = db.exec("SELECT id, name, icon, description FROM categories ORDER BY position")[0];
    for (const [id, name, icon, description] of cats?.values || []) {
      const cat = { id, name, icon, description, commands: [] };
      categories.push(cat);
      byId.set(id, cat);
    }
    const cmds = db.exec("SELECT uid, category_id, cmd, description FROM commands ORDER BY category_id, position")[0];
    for (const [uid, categoryId, cmd, desc] of cmds?.values || []) {
      byId.get(categoryId).commands.push({ uid, cmd, desc });
    }
    return { categories };
  }

  if (!value("SELECT COUNT(*) FROM categories")) replace(seed);
  // Cũ: bản Electron lưu các sửa đổi trong localStorage. Chỉ nhận bản cũ một lần.
  return {
    filename,
    read,
    replace,
    migrationPending: () => value("SELECT value FROM meta WHERE key = 'local_migrated'") === undefined,
    migrate(local) {
      if (this.migrationPending()) {
        if (local) replace(local);
        db.run("INSERT INTO meta (key, value) VALUES ('local_migrated', '1')");
        persist();
      }
      return read();
    },
    reset() { replace(seed); return read(); },
    backup() { return Buffer.from(db.export()); },
  };
}

module.exports = { openDatabase };
