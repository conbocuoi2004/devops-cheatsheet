import express from "express";
import compression from "compression";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3000;

const data = JSON.parse(
  fs.readFileSync(path.join(__dirname, "data", "cheatsheets.json"), "utf-8")
);

const app = express();
app.use(compression());
app.disable("x-powered-by");

// ---------- API ----------

// Health check — dùng cho Docker HEALTHCHECK / k8s liveness probe
app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", uptime: process.uptime() });
});

// Toàn bộ dữ liệu — client dùng làm bộ dữ liệu khởi tạo
app.get("/api/all", (_req, res) => {
  res.json(data);
});

// Danh sách category (không kèm commands cho nhẹ)
app.get("/api/categories", (_req, res) => {
  res.json(
    data.categories.map(({ id, name, icon, description, commands }) => ({
      id,
      name,
      icon,
      description,
      count: commands.length,
    }))
  );
});

// Chi tiết một category
app.get("/api/categories/:id", (req, res) => {
  const cat = data.categories.find((c) => c.id === req.params.id);
  if (!cat) return res.status(404).json({ error: "Không tìm thấy category" });
  res.json(cat);
});

// Tìm kiếm toàn cục: /api/search?q=docker
app.get("/api/search", (req, res) => {
  const q = (req.query.q || "").toString().trim().toLowerCase();
  if (!q) return res.json([]);
  const results = [];
  for (const cat of data.categories) {
    for (const c of cat.commands) {
      if (
        c.cmd.toLowerCase().includes(q) ||
        c.desc.toLowerCase().includes(q) ||
        cat.name.toLowerCase().includes(q)
      ) {
        results.push({ ...c, category: cat.name, categoryId: cat.id, icon: cat.icon });
      }
    }
  }
  res.json(results.slice(0, 50));
});

// ---------- Static (frontend build) ----------
const clientDist = path.join(__dirname, "public");
if (fs.existsSync(clientDist)) {
  app.use(express.static(clientDist, { maxAge: "1d", index: false }));
  // SPA fallback: mọi route không phải /api trả về index.html
  app.get(/^(?!\/api).*/, (_req, res) => {
    res.sendFile(path.join(clientDist, "index.html"));
  });
}

app.listen(PORT, () => {
  console.log(`✅ DevOps Cheatsheet API chạy tại http://localhost:${PORT}`);
});
