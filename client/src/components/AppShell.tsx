import { Link, NavLink, Outlet } from "react-router-dom";
import { useAuth } from "../features/auth/AuthProvider";

export function AppShell() {
  const { account, signOut } = useAuth();
  return <div className="min-h-screen bg-paper text-ink">
    <header className="border-b border-line bg-[#fbfaf6]">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-6 px-5 py-4">
        <Link className="flex items-center gap-2 text-[22px] font-bold tracking-[-1px]" to="/"><span className="grid h-[27px] w-[27px] place-items-center rounded-[8px] bg-ink text-[17px] text-lime">G</span>GameTrade</Link>
        <nav className="hidden items-center gap-7 text-sm text-[#495460] md:flex">
          <NavLink to="/marketplace">Mercado</NavLink>
          {account?.role === "seller" && <NavLink to="/seller/offers">Mis ofertas</NavLink>}
          {account && <NavLink to="/orders">Pedidos</NavLink>}
        </nav>
        <div className="flex items-center gap-3 text-sm">
          {account ? <>
            <Link className="text-[#495460] hover:text-ink" to="/profile">{account.name}</Link>
            <button className="button-secondary" onClick={() => void signOut()}>Salir</button>
          </> : <>
            <Link className="text-[#495460] hover:text-ink" to="/account">Iniciar sesión</Link>
            <Link className="button-primary" to="/account?mode=register">Crear cuenta</Link>
          </>}
        </div>
      </div>
    </header>
    <main><Outlet /></main>
    <footer className="border-t border-line bg-[#fbfaf6] px-5 py-8 text-center text-sm text-[#65717e]">© 2026 GameTrade · <Link to="/rules">Reglas</Link> · <Link to="/privacy">Privacidad</Link> · <Link to="/support">Soporte</Link></footer>
  </div>;
}
