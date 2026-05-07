export default function AdminPage() {
  const adminUrl = process.env.NEXT_PUBLIC_ADMIN_APP_URL ?? "http://localhost:3100";

  return (
    <main
      style={{
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
        padding: 24,
        background: "#eef3f8",
        color: "#111827",
        fontFamily:
          'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", "Microsoft YaHei", sans-serif',
      }}
    >
      <section
        style={{
          width: "min(520px, 100%)",
          border: "1px solid #d8e0ea",
          borderRadius: 10,
          background: "#fff",
          padding: 28,
          boxShadow: "0 16px 48px rgba(15, 23, 42, 0.08)",
        }}
      >
        <p style={{ margin: "0 0 8px", color: "#64748b", fontWeight: 700 }}>
          Admin Console
        </p>
        <h1 style={{ margin: "0 0 12px", fontSize: 30 }}>后台已迁移到独立应用</h1>
        <p style={{ margin: "0 0 22px", color: "#475569", lineHeight: 1.7 }}>
          新后台使用独立登录态，不再和前台用户登录互相影响。本地开发地址是
          <code style={{ marginLeft: 6 }}>{adminUrl}</code>。
        </p>
        <a
          href={adminUrl}
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            height: 42,
            padding: "0 18px",
            borderRadius: 8,
            background: "#111827",
            color: "#fff",
            textDecoration: "none",
            fontWeight: 700,
          }}
        >
          打开新后台
        </a>
      </section>
    </main>
  );
}
