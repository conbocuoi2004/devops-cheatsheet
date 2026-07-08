import { useEffect, useMemo, useRef, useState } from "react";

const STORAGE_KEY = "devops-cheatsheet-data-v1";

function makeId() {
  return typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : `id-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

// Gán uid cho mỗi lệnh để sửa/xoá chính xác
function withIds(raw) {
  return {
    categories: raw.categories.map((cat) => ({
      ...cat,
      commands: cat.commands.map((c) => ({ ...c, uid: c.uid || makeId() })),
    })),
  };
}

function loadLocal() {
  try {
    const s = localStorage.getItem(STORAGE_KEY);
    return s ? JSON.parse(s) : null;
  } catch {
    return null;
  }
}

function useDebounce(value, delay = 200) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

function CopyButton({ text }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {}
  }
  return (
    <button className={`copy-btn ${copied ? "copied" : ""}`} onClick={copy} aria-label="Sao chép lệnh">
      {copied ? "✓ Đã chép" : "Sao chép"}
    </button>
  );
}

// Form dùng chung cho cả thêm mới và sửa
function CommandForm({ initial, onSave, onCancel }) {
  const [cmd, setCmd] = useState(initial?.cmd || "");
  const [desc, setDesc] = useState(initial?.desc || "");
  const cmdRef = useRef(null);
  useEffect(() => cmdRef.current?.focus(), []);

  function submit() {
    if (!cmd.trim()) return;
    onSave({ cmd: cmd.trim(), desc: desc.trim() || "(chưa có mô tả)" });
  }

  return (
    <div className="cmd-form">
      <input
        ref={cmdRef}
        className="form-input mono"
        value={cmd}
        onChange={(e) => setCmd(e.target.value)}
        placeholder="Lệnh, vd: helm upgrade --install app ./chart"
        onKeyDown={(e) => e.key === "Enter" && submit()}
      />
      <input
        className="form-input"
        value={desc}
        onChange={(e) => setDesc(e.target.value)}
        placeholder="Mô tả lệnh làm gì"
        onKeyDown={(e) => e.key === "Enter" && submit()}
      />
      <div className="form-actions">
        <button className="btn primary" onClick={submit}>Lưu</button>
        <button className="btn" onClick={onCancel}>Huỷ</button>
      </div>
    </div>
  );
}

function CommandRow({ item, catId, showCategory, onEdit, onDelete }) {
  const [editing, setEditing] = useState(false);

  if (editing) {
    return (
      <div className="cmd-row">
        <CommandForm
          initial={item}
          onSave={(vals) => { onEdit(catId, item.uid, vals); setEditing(false); }}
          onCancel={() => setEditing(false)}
        />
      </div>
    );
  }

  return (
    <div className="cmd-row">
      <div className="cmd-line">
        <span className="prompt-char">$</span>
        <code className="cmd-text">{item.cmd}</code>
        <span className="row-actions">
          <CopyButton text={item.cmd} />
          <button className="icon-btn" onClick={() => setEditing(true)} aria-label="Sửa lệnh">Sửa</button>
          <button
            className="icon-btn danger"
            onClick={() => { if (window.confirm(`Xoá lệnh này?\n\n${item.cmd}`)) onDelete(catId, item.uid); }}
            aria-label="Xoá lệnh"
          >Xoá</button>
        </span>
      </div>
      <p className="cmd-desc">
        {showCategory && <span className="cmd-tag">{item.icon} {item.category}</span>}
        {item.desc}
      </p>
    </div>
  );
}

export default function App() {
  const [data, setData] = useState(null);
  const [active, setActive] = useState(null);
  const [query, setQuery] = useState("");
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState(null);
  const inputRef = useRef(null);
  const debouncedQuery = useDebounce(query);

  // Nạp dữ liệu: ưu tiên bản đã chỉnh sửa trong localStorage, chưa có thì lấy từ server
  useEffect(() => {
    const local = loadLocal();
    if (local?.categories?.length) {
      setData(local);
      setActive(local.categories[0].id);
      return;
    }
    fetch("/api/all")
      .then((r) => r.json())
      .then((raw) => {
        const seeded = withIds(raw);
        setData(seeded);
        setActive(seeded.categories[0]?.id || null);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(seeded));
      })
      .catch(() => setError("Không kết nối được API. Backend đã chạy chưa?"));
  }, []);

  // Mọi thay đổi đều lưu lại ngay
  function save(next) {
    setData(next);
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); } catch {}
  }

  function addCommand(catId, vals) {
    save({
      categories: data.categories.map((c) =>
        c.id === catId ? { ...c, commands: [{ ...vals, uid: makeId() }, ...c.commands] } : c
      ),
    });
  }

  function editCommand(catId, uid, vals) {
    save({
      categories: data.categories.map((c) =>
        c.id !== catId ? c : { ...c, commands: c.commands.map((k) => (k.uid === uid ? { ...k, ...vals } : k)) }
      ),
    });
  }

  function deleteCommand(catId, uid) {
    save({
      categories: data.categories.map((c) =>
        c.id !== catId ? c : { ...c, commands: c.commands.filter((k) => k.uid !== uid) }
      ),
    });
  }

  function resetAll() {
    if (!window.confirm("Khôi phục dữ liệu gốc? Mọi lệnh bạn đã thêm/sửa/xoá sẽ mất.")) return;
    localStorage.removeItem(STORAGE_KEY);
    fetch("/api/all")
      .then((r) => r.json())
      .then((raw) => {
        const seeded = withIds(raw);
        save(seeded);
        setActive(seeded.categories[0]?.id || null);
      })
      .catch(() => setError("Không tải được dữ liệu gốc từ server."));
  }

  // Tìm kiếm ngay trên dữ liệu local (đã gồm cả lệnh tự thêm)
  const results = useMemo(() => {
    const q = debouncedQuery.trim().toLowerCase();
    if (!q || !data) return null;
    const out = [];
    for (const cat of data.categories) {
      for (const c of cat.commands) {
        if (
          c.cmd.toLowerCase().includes(q) ||
          c.desc.toLowerCase().includes(q) ||
          cat.name.toLowerCase().includes(q)
        ) {
          out.push({ ...c, category: cat.name, categoryId: cat.id, icon: cat.icon });
        }
      }
    }
    return out.slice(0, 50);
  }, [debouncedQuery, data]);

  useEffect(() => {
    function onKey(e) {
      if (e.key === "/" && document.activeElement?.tagName !== "INPUT") {
        e.preventDefault();
        inputRef.current?.focus();
      }
      if (e.key === "Escape") { setQuery(""); inputRef.current?.blur(); }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const searching = results !== null;
  const detail = data?.categories.find((c) => c.id === active) || null;
  const total = data ? data.categories.reduce((s, c) => s + c.commands.length, 0) : 0;

  return (
    <div className="shell">
      <header className="titlebar">
        <span className="titlebar-dots" aria-hidden="true"><i /> <i /> <i /></span>
        <span className="titlebar-text">devops-cheatsheet — bash</span>
        <button className="reset-btn" onClick={resetAll} title="Khôi phục dữ liệu gốc">↺ khôi phục gốc</button>
      </header>

      <div className="hero">
        <h1 className="hero-title">DevOps Cheatsheet</h1>
        <p className="hero-sub">Tra cứu, thêm và chỉnh lệnh của riêng bạn. Nhấn <kbd>/</kbd> để tìm kiếm.</p>
        <label className="search-prompt">
          <span className="search-user">dev@ops</span>
          <span className="search-sep">:~$</span>
          <span className="search-grep">grep</span>
          <input
            ref={inputRef}
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder='"docker logs", "rollout", "ssl"...'
            aria-label="Tìm kiếm lệnh"
          />
        </label>
      </div>

      {error && <div className="error-box">⚠ {error}</div>}

      {!searching && data && (
        <nav className="tabs" aria-label="Danh mục">
          {data.categories.map((c) => (
            <button
              key={c.id}
              className={`tab ${active === c.id ? "active" : ""}`}
              onClick={() => { setActive(c.id); setAdding(false); }}
            >
              <span className="tab-icon">{c.icon}</span> {c.name}
              <span className="tab-count">{c.commands.length}</span>
            </button>
          ))}
        </nav>
      )}

      <main className="content">
        {searching ? (
          <>
            <p className="section-label">
              {results.length
                ? `${results.length} kết quả cho "${debouncedQuery.trim()}"`
                : `Không tìm thấy lệnh nào cho "${debouncedQuery.trim()}". Thử từ khoá khác.`}
            </p>
            {results.map((r) => (
              <CommandRow key={r.uid} item={r} catId={r.categoryId} showCategory onEdit={editCommand} onDelete={deleteCommand} />
            ))}
          </>
        ) : detail ? (
          <>
            <div className="section-head">
              <p className="section-label">{detail.icon} {detail.name} — {detail.description}</p>
              <button className="btn primary add-btn" onClick={() => setAdding(true)}>+ Thêm lệnh</button>
            </div>
            {adding && (
              <div className="cmd-row">
                <CommandForm
                  onSave={(vals) => { addCommand(detail.id, vals); setAdding(false); }}
                  onCancel={() => setAdding(false)}
                />
              </div>
            )}
            {detail.commands.map((c) => (
              <CommandRow key={c.uid} item={c} catId={detail.id} onEdit={editCommand} onDelete={deleteCommand} />
            ))}
            {detail.commands.length === 0 && !adding && (
              <p className="cmd-desc" style={{ marginLeft: 0 }}>Chưa có lệnh nào. Bấm "+ Thêm lệnh" để bắt đầu.</p>
            )}
          </>
        ) : (
          !error && <p className="section-label">Đang tải…</p>
        )}
      </main>

      <footer className="statusbar">
        <span className="status-chunk mode">NORMAL</span>
        <span className="status-chunk">{total} lệnh</span>
        <span className="status-chunk grow">dữ liệu lưu trên máy bạn</span>
        <span className="status-chunk">utf-8</span>
      </footer>
    </div>
  );
}
