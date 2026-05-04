// client/src/pages/Register.jsx
import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { apiPost } from "../lib/api";

export default function Register() {
  console.log("✅ REGISTER COMPONENT RENDER");

  const nav = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  async function handleSubmit(e) {
    e.preventDefault();
    console.log("✅ handleSubmit çalıştı"); // <-- BUNU MUTLAKA GÖRMELİSİN
    setErr("");
    setLoading(true);

    try {
      const payload = { email, password, displayName };
      console.log("➡️ REGISTER payload:", payload);

      const data = await apiPost("/api/auth/register", payload);
      console.log("✅ REGISTER response:", data);

      if (data?.accessToken) localStorage.setItem("accessToken", data.accessToken);
      if (data?.user) localStorage.setItem("user", JSON.stringify(data.user));

      nav("/notes");
    } catch (e2) {
      console.error("❌ REGISTER error:", e2);
      setErr(e2?.message || "Register failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ maxWidth: 420, margin: "40px auto", display: "grid", gap: 10 }}>
      <h2>Register</h2>

      {/* KESİN CLICK TEST */}
      <button type="button" onClick={() => alert("✅ Click çalıştı mı?")}>
        TEST CLICK
      </button>

      <form onSubmit={handleSubmit} style={{ display: "grid", gap: 8 }}>
        <label>Display Name</label>
        <input
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          placeholder="Irem"
          required
        />

        <label>Email</label>
        <input
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="test1@mail.com"
          type="email"
          required
        />

        <label>Password</label>
        <input
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="123456"
          type="password"
          required
        />

        <button type="submit" disabled={loading}>
          {loading ? "Creating..." : "Create account"}
        </button>
      </form>

      {err && <p style={{ color: "crimson" }}>{err}</p>}

      <p style={{ marginTop: 12 }}>
        Already have an account? <Link to="/login">Login</Link>
      </p>
    </div>
  );
}
