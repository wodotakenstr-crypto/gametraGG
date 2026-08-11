import { Link, NavLink, Outlet } from "react-router-dom";
import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { useAuth } from "../features/auth/AuthProvider";

interface Notification { id: string; orderId: string; text: string; createdAt: string; }

export function AppShell() {
  const { account, signOut } = useAuth();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [showNotifications, setShowNotifications] = useState(false);

  useEffect(() => {
    if (!account) { setNotifications([]); return; }
    async function load() { try { setNotifications(await api<Notification[]>("/notifications")); } catch { setNotifications([]); } }
    void load(); const interval = window.setInterval(() => void load(), 8_000);
    return () => window.clearInterval(interval);
  }, [account]);

  async function read(notification: Notification) {
    try { await api(`/notifications/${notification.id}/read`, { method: "POST" }); setNotifications(current => current.filter(item => item.id !== notification.id)); } catch { /* Keep the notification visible when the request fails. */ }
  }
  return <div>
    <header className="topbar">
      <Link className="brand" to="/"><span>G</span>GameTrade</Link>
      <nav className="main-nav" aria-label="Navegación principal">
        <NavLink to="/marketplace">Mercado</NavLink>
        <a href="/#como-funciona">Cómo funciona</a>
        <a href="/#vender">Vender</a>
        {account?.role === "seller" && <NavLink to="/seller/offers">Mis ofertas</NavLink>}
        {account && <NavLink to="/orders">Mis pedidos</NavLink>}
      </nav>
      <div className="header-actions">
        {account && <div className="profile-area"><button className="account-name" onClick={() => setShowNotifications(value => !value)}>Notificaciones{notifications.length ? ` (${notifications.length})` : ""}</button>{showNotifications && <div className="profile-dropdown">{notifications.map(notification => <Link key={notification.id} to={notification.orderId ? `/orders?order=${notification.orderId}` : "/orders"} onClick={() => void read(notification)}>{notification.text}</Link>)}{!notifications.length && <span className="block px-2 py-2 text-xs text-[#65717e]">No tienes notificaciones.</span>}</div>}</div>}
        {account ? <><Link className="login" to="/profile">{account.name}</Link><button className="button button-small" onClick={() => void signOut()}>Salir</button></> : <><Link className="login" to="/account">Iniciar sesión</Link><Link className="button button-small" to="/account?mode=register">Crear cuenta</Link></>}
      </div>
    </header>
    <main><Outlet /></main>
    <footer><Link className="brand" to="/"><span>G</span>GameTrade</Link><p>© 2026 GameTrade. Mercado independiente para gamers.</p><Link to="/rules">Reglas del mercado</Link><Link to="/privacy">Privacidad</Link><Link to="/support">Ayuda y soporte</Link></footer>
  </div>;
}
