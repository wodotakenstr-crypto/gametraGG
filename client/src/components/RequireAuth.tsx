import { Navigate, Outlet } from "react-router-dom";
import { useAuth } from "../features/auth/AuthProvider";

export function RequireAuth({ role }: { role?: "seller" | "admin" }) {
  const { account, loading } = useAuth();
  if (loading) return <div className="page-state">Cargando sesión...</div>;
  if (!account) return <Navigate replace to="/account" />;
  if (role === "seller" && account.role !== "seller") return <Navigate replace to="/" />;
  if (role === "admin" && !account.isAdmin) return <Navigate replace to="/" />;
  return <Outlet />;
}
