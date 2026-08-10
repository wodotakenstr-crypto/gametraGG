import { Route, Routes } from "react-router-dom";
import { AppShell } from "../components/AppShell";
import { RequireAuth } from "../components/RequireAuth";
import { AccountPage, LegalPage, NotFoundPage, ProfilePage, SellerProfilePage, VerifyEmailPage } from "../features/account/pages";
import { AdminPage } from "../features/admin/AdminPage";
import { HomePage } from "../features/marketplace/HomePage";
import { OrdersPage } from "../features/orders/OrdersPage";
import { SellerOffersPage, WalletPage } from "../features/seller/pages";

export function App() {
  return <Routes>
    <Route element={<AppShell />}>
      <Route index element={<HomePage />} />
      <Route path="marketplace" element={<HomePage />} />
      <Route path="account" element={<AccountPage />} />
      <Route path="verify-email" element={<VerifyEmailPage />} />
      <Route path="forgot-password" element={<AccountPage reset />} />
      <Route path="seller/:sellerId" element={<SellerProfilePage />} />
      <Route path="rules" element={<LegalPage title="Reglas del mercado" />} />
      <Route path="privacy" element={<LegalPage title="Privacidad" />} />
      <Route path="refunds" element={<LegalPage title="Compras y reembolsos" />} />
      <Route path="support" element={<LegalPage title="Ayuda y soporte" />} />
      <Route element={<RequireAuth />}>
        <Route path="profile" element={<ProfilePage />} />
        <Route path="orders" element={<OrdersPage />} />
      </Route>
      <Route element={<RequireAuth role="seller" />}>
        <Route path="seller/offers" element={<SellerOffersPage />} />
        <Route path="wallet" element={<WalletPage />} />
      </Route>
      <Route element={<RequireAuth role="admin" />}><Route path="admin" element={<AdminPage />} /></Route>
      <Route path="*" element={<NotFoundPage />} />
    </Route>
  </Routes>;
}
