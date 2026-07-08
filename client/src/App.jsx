import { useEffect, useRef, useState } from "react";

function useDebounce(value, delay = 250) {
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
    } catch {
      /* clipboard bị chặn thì bỏ qua */
    }
  }
  return (
    <button className={`copy-btn ${copied ? "copied" : ""}`} onClick={copy} aria-label="Sao chép lệnh">
      {copied ? "✓ Đã chép" : "Sao chép"}
    </button>
  );
}

function CommandRow({ item, showCategory }) {
  return (
    <div className="cmd-row">
      <div className="cmd-line">
        <span className="prompt-char">$</span>
        <code className="cmd-text">{item.cmd}</code>
        <CopyButton text={item.cmd} />
      </div>
      <p className="cmd-desc">
        {showCategory && (
          <span className="cmd-tag">
            {item.icon} {item.category}
          </span>
        )}
        {item.desc}
      </p>
    </div>
  );
}

export default function App() {
  const [categories, setCategories] = useState([]);
  const [active, setActive] = useState(null); // category đang xem
  const [detail, setDetail] = useState(null); // dữ liệu category đang xem
  const [query, setQuery] = useState("");
  const [results, setResults] = useState(null);
  const [error, setError] = useState(null);
  const inputRef = useRef(null);
  const debouncedQuery = useDebounce(query);

  // Tải danh sách category lúc khởi động
  useEffect(() => {
    fetch("/api/categories")
      .then((r) => r.json())
      .then((cats) => {
        setCategories(cats);
        if (cats.length) setActive(cats[0].id);
      })
      .catch(() => setError("Không kết nối được API. Backend đã chạy chưa?"));
  }, []);

  // Tải chi tiết khi đổi category
  useEffect(() => {
    if (!active) return;
    fetch(`/api/categories/${active}`)
      .then((r) => r.json())
      .then(setDetail)
      .catch(() => setError("Không tải được dữ liệu category."));
  }, [active]);

  // Tìm kiếm toàn cục
  useEffect(() => {
    const q = debouncedQuery.trim();
    if (!q) {
      setResults(null);
      return;
    }
    fetch(`/api/search?q=${encodeURIComponent(q)}`)
      .then((r) => r.json())
      .then(setResults)
      .catch(() => setResults([]));
  }, [debouncedQuery]);

  // Phím tắt "/" để focus ô tìm kiếm
  useEffect(() => {
    function onKey(e) {
      if (e.key === "/" && document.activeElement !== inputRef.current) {
        e.preventDefault();
        inputRef.current?.focus();
      }
      if (e.key === "Escape") {
        setQuery("");
        inputRef.current?.blur();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const searching = results !== null;

  return (
    <div className="shell">
      <header className="titlebar">
        <span className="titlebar-dots" aria-hidden="true">
          <i /> <i /> <i />
        </span>
        <span className="titlebar-text">devops-cheatsheet — bash</span>
      </header>

      <div className="hero">
        <h1 className="hero-title">DevOps Cheatsheet</h1>
        <p className="hero-sub">Tra cứu nhanh các lệnh hay dùng nhất. Nhấn <kbd>/</kbd> để tìm kiếm.</p>
        <label className="search-prompt">
          <span className="search-user">dev@ops</span>
          <span className="search-sep">:~$</span>
          <span className="search-grep">grep</span>
          <input
            ref={inputRef}
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder='"docker logs", "rollback", "ssl"...'
            aria-label="Tìm kiếm lệnh"
          />
        </label>
      </div>

      {error && <div className="error-box">⚠ {error}</div>}

      {!searching && (
        <nav className="tabs" aria-label="Danh mục">
          {categories.map((c) => (
            <button
              key={c.id}
              className={`tab ${active === c.id ? "active" : ""}`}
              onClick={() => setActive(c.id)}
            >
              <span className="tab-icon">{c.icon}</span> {c.name}
              <span className="tab-count">{c.count}</span>
            </button>
          ))}
        </nav>
      )}

      <main className="content">
        {searching ? (
          <>
            <p className="section-label">
              {results.length
                ? `${results.length} kết quả cho “${debouncedQuery.trim()}”`
                : `Không tìm thấy lệnh nào cho “${debouncedQuery.trim()}”. Thử từ khoá khác.`}
            </p>
            {results.map((r, i) => (
              <CommandRow key={i} item={r} showCategory />
            ))}
          </>
        ) : detail ? (
          <>
            <p className="section-label">
              {detail.icon} {detail.name} — {detail.description}
            </p>
            {detail.commands.map((c, i) => (
              <CommandRow key={i} item={c} />
            ))}
          </>
        ) : (
          !error && <p className="section-label">Đang tải…</p>
        )}
      </main>

      <footer className="statusbar">
        <span className="status-chunk mode">NORMAL</span>
        <span className="status-chunk">{categories.reduce((s, c) => s + (c.count || 0), 0)} lệnh</span>
        <span className="status-chunk grow">React + Express + Docker</span>
        <span className="status-chunk">utf-8</span>
      </footer>
    </div>
  );
}
