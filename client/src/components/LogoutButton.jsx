import { clearTokens, isLoggedIn } from '../lib/auth'

export default function LogoutButton() {
  if (!isLoggedIn()) return null;

  function handleLogout() {
    clearTokens();
    // Kullanıcıyı giriş sayfasına at
    window.location.href = '/login';
  }

  return (
    <button onClick={handleLogout} style={{ marginLeft: 12 }}>
      Logout
    </button>
  );
}
