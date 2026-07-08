# ⌨️ DevOps Cheatsheet

Ứng dụng fullstack tra cứu nhanh lệnh **Docker, Kubernetes, Git, Linux, CI/CD, Terraform, Nginx, Ansible** — có tìm kiếm toàn cục, copy lệnh 1 chạm, giao diện terminal gruvbox.

**Stack:** React 18 (Vite) · Node.js 22 + Express · Docker multi-stage · GitHub Actions CI/CD

```
devops-cheatsheet/
├── client/                  # Frontend React + Vite
│   └── src/                 # App.jsx, styles.css
├── server/                  # Backend Express
│   ├── index.js             # API + phục vụ static build
│   └── data/cheatsheets.json# Dữ liệu lệnh (thêm/sửa tại đây)
├── Dockerfile               # Multi-stage: build client → runtime Node
├── docker-compose.yml
└── .github/workflows/ci-cd.yml
```

## API

| Endpoint | Mô tả |
|---|---|
| `GET /api/health` | Health check (dùng cho healthcheck/probe) |
| `GET /api/categories` | Danh sách category + số lệnh |
| `GET /api/categories/:id` | Toàn bộ lệnh của một category |
| `GET /api/search?q=...` | Tìm kiếm toàn cục |

## 🧑‍💻 Chạy môi trường dev

Cần Node.js ≥ 20. Mở 2 terminal:

```bash
# Terminal 1 — backend (cổng 3000)
cd server && npm install && npm run dev

# Terminal 2 — frontend (cổng 5173, tự proxy /api sang 3000)
cd client && npm install && npm run dev
```

Mở http://localhost:5173

## 🚀 Deploy

### Cách 1 — Docker Compose (khuyên dùng, 1 lệnh)

```bash
docker compose up -d --build
```

Mở http://localhost:8080 (đổi cổng bằng biến `APP_PORT` trong file `.env`, xem `.env.example`).

### Cách 2 — Docker thuần

```bash
docker build -t devops-cheatsheet .
docker run -d -p 8080:3000 --restart unless-stopped --name devops-cheatsheet devops-cheatsheet
```

### Cách 3 — VPS không dùng Docker

```bash
cd client && npm ci && npm run build
cp -r dist ../server/public
cd ../server && npm ci --omit=dev
NODE_ENV=production PORT=3000 node index.js   # hoặc dùng pm2: pm2 start index.js --name cheatsheet
```

Đặt Nginx phía trước làm reverse proxy + SSL:

```nginx
server {
    server_name cheatsheet.example.com;
    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

Sau đó chạy `certbot --nginx -d cheatsheet.example.com` để có HTTPS.

### Cách 4 — PaaS (Render / Railway / Fly.io)

Các nền tảng này tự nhận **Dockerfile** ở gốc repo:
1. Push code lên GitHub.
2. Tạo service mới → chọn repo → nền tảng tự build từ Dockerfile.
3. Ứng dụng lắng nghe biến `PORT` nên không cần cấu hình thêm.

## 🔁 CI/CD tự động (GitHub Actions)

Workflow `.github/workflows/ci-cd.yml` gồm 3 job:

1. **build** — build frontend, kiểm tra cú pháp backend (chạy cả trên PR).
2. **docker** — build image và push lên **GHCR** (`ghcr.io/<user>/<repo>`) khi push lên `main`. Không cần secret, dùng sẵn `GITHUB_TOKEN`.
3. **deploy** — SSH vào VPS, pull image mới và restart container. Cần khai báo secrets trong *Settings → Secrets and variables → Actions*:
   - `SSH_HOST` — IP/domain server
   - `SSH_USER` — user SSH
   - `SSH_KEY` — private key (nội dung file `~/.ssh/id_ed25519`)

Nếu chưa có VPS, xoá job `deploy` là workflow vẫn chạy bình thường.

## ✏️ Thêm lệnh mới

Chỉ cần sửa `server/data/cheatsheets.json` — thêm category hoặc thêm phần tử vào mảng `commands`:

```json
{ "cmd": "helm upgrade --install app ./chart", "desc": "Cài hoặc nâng cấp release Helm" }
```

Restart server (hoặc rebuild image) là xong, không cần đụng vào frontend.
