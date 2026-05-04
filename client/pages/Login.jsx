// client/src/pages/Login.jsx
import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { apiPost } from "../lib/api";

export default function Login() {
  console.log("✅ LOGIN COMPONENT RENDER");

  const nav = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  async function handleSubmit(e) {
    e.preventDefault();
    console.log("✅ login handleSubmit çalıştı");
    setErr("");
    setLoading(true);

    try {
      const payload = { email, password };
      console.log("➡️ LOGIN payload:", payload);

      const data = await apiPost("/api/auth/login", payload);
      console.log("✅ LOGIN response:", data);

      if (data?.accessToken) localStorage.setItem("accessToken", data.accessToken);
      if (data?.user) localStorage.setItem("user", JSON.stringify(data.user));

      nav("/notes");
    } catch (e2) {
      console.error("❌ LOGIN error:", e2);
      setErr(e2?.message || "Login failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ maxWidth: 420, margin: "40px auto", display: "grid", gap: 10 }}>
      <h2>Login</h2>

      <form onSubmit={handleSubmit} style={{ display: "grid", gap: 8 }}>
        <label>Email</label>
        <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" required />

        <label>Password</label>
        <input value={password} onChange={(e) => setPassword(e.target.value)} type="password" required />

        <button type="submit" disabled={loading}>
          {loading ? "Signing in..." : "Sign in"}
        </button>
      </form>

      {err && <p style={{ color: "crimson" }}>{err}</p>}

      <p style={{ marginTop: 12 }}>
        No account? <Link to="/register">Register</Link>
      </p>
    </div>
  );
}
