import { useEffect, useState, type ReactNode } from "react";
import { api, json } from "../../lib/api";

type Summary = Record<string, number>;
type User = {
  id: string; name: string; email: string; role: "buyer" | "seller"; emailVerified: boolean; verified?: boolean; verificationRequested?: boolean; foundingSeller?: boolean; isAdmin?: boolean; offers: number; orders: number; completedOrders: number; reviews: number; wallet: { availableUsdt: number; pendingUsdt: number } | null;
};
type Seller = Pick<User, "id" | "name" | "email" | "verified" | "verificationRequested" | "offers">;
type Dispute = { id: string; buyer: string; seller: string; amount: number; paymentAmountUsdt?: number; dispute?: { reason?: string } };
type Offer = { id: string; title: string; seller: string; game: string; price: number; paused?: boolean };
type Payment = { id: string; buyer: string; seller: string; paymentAmountUsdt: number; paymentTxId?: string; paymentSubmittedAt?: string };
type PaypalPayment = { id: string; buyer: string; seller: string; saleAmountUsdt: number; buyerChargeUsd: number; merchantFeeUsd: number; platformCommissionUsdt: number; sellerNetUsdt: number; captureId: string; confirmedAt: string; status: string };
type PaypalSettlement = { id: string; buyer: string; seller: string; grossUsd: number; paypalFeeUsd: number; netUsd: number };
type Withdrawal = { id: string; seller: string; grossCents: number; feeCents: number; netCents: number; address: string; createdAt: string };

const summaryLabels: Record<string, string> = {
  activeOffers: "Ofertas activas", sellers: "Vendedores", pendingVerification: "Por verificar", openDisputes: "Disputas abiertas", orders: "Pedidos", completedOrders: "Pedidos completados", platformCommission: "Comisión GameTrade (USDT)", paypalMerchantFees: "Tarifas PayPal (USD)", netPlatformEarnings: "Ganancia GameTrade (USDT)",
};

const usdt = (value: number) => `${Number(value).toFixed(2)} USDT`;
const usd = (value: number) => `$${Number(value).toFixed(2)} USD`;
const date = (value?: string) => value ? new Date(value).toLocaleString() : "Sin fecha";
const message = (reason: unknown, fallback: string) => reason instanceof Error ? reason.message : fallback;

export function AdminPage() {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [sellers, setSellers] = useState<Seller[]>([]);
  const [disputes, setDisputes] = useState<Dispute[]>([]);
  const [offers, setOffers] = useState<Offer[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [paypalPayments, setPaypalPayments] = useState<PaypalPayment[]>([]);
  const [paypalSettlements, setPaypalSettlements] = useState<PaypalSettlement[]>([]);
  const [withdrawals, setWithdrawals] = useState<Withdrawal[]>([]);
  const [refundHashes, setRefundHashes] = useState<Record<string, string>>({});
  const [settlements, setSettlements] = useState<Record<string, { convertedUsdt: string; reference: string }>>({});
  const [withdrawalReferences, setWithdrawalReferences] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    try {
      const [nextSummary, nextUsers, nextSellers, nextDisputes, nextOffers, nextPayments, nextPaypalPayments, nextPaypalSettlements, nextWithdrawals] = await Promise.all([
        api<Summary>("/admin/summary"), api<User[]>("/admin/users"), api<Seller[]>("/admin/sellers"), api<Dispute[]>("/admin/disputes"), api<Offer[]>("/admin/offers"), api<Payment[]>("/admin/payments"), api<PaypalPayment[]>("/admin/paypal-payments"), api<PaypalSettlement[]>("/admin/paypal-settlements"), api<Withdrawal[]>("/admin/withdrawals"),
      ]);
      setSummary(nextSummary); setUsers(nextUsers); setSellers(nextSellers); setDisputes(nextDisputes); setOffers(nextOffers); setPayments(nextPayments); setPaypalPayments(nextPaypalPayments); setPaypalSettlements(nextPaypalSettlements); setWithdrawals(nextWithdrawals);
      setError("");
      return true;
    } catch (reason) {
      setError(message(reason, "No se pudo cargar la administración."));
      return false;
    } finally { setLoading(false); }
  }

  useEffect(() => { void load(); }, []);

  async function mutate(key: string, action: () => Promise<unknown>, success: string) {
    setWorking(key); setError(""); setStatus("");
    try {
      await action();
      if (await load()) setStatus(success);
    } catch (reason) { setError(message(reason, "No se pudo completar la acción.")); }
    finally { setWorking(null); }
  }

  function resolve(dispute: Dispute, decision: "buyer" | "seller") {
    const refundTransactionId = refundHashes[dispute.id]?.trim().toLowerCase() ?? "";
    if (decision === "buyer" && !/^[a-f0-9]{64}$/.test(refundTransactionId)) {
      setError("Registra el hash TRC20 de reembolso de 64 caracteres antes de resolver a favor del comprador.");
      return;
    }
    void mutate(`dispute-${dispute.id}-${decision}`, () => api(`/admin/disputes/${dispute.id}/resolve`, { method: "POST", ...json({ decision, refundTransactionId }) }), decision === "buyer" ? "Reembolso registrado y disputa resuelta a favor del comprador." : "Disputa resuelta a favor del vendedor; el saldo fue acreditado.");
  }

  function settle(payment: PaypalSettlement) {
    const values = settlements[payment.id] ?? { convertedUsdt: "", reference: "" };
    if (!Number.isFinite(Number(values.convertedUsdt)) || Number(values.convertedUsdt) <= 0 || !values.reference.trim()) {
      setError("Indica el USDT recibido y una referencia de liquidación.");
      return;
    }
    void mutate(`settlement-${payment.id}`, () => api(`/admin/paypal-settlements/${payment.id}`, { method: "POST", ...json(values) }), "Liquidación PayPal acreditada y pedido liberado para entrega.");
  }

  function decideWithdrawal(withdrawal: Withdrawal, decision: "approve" | "reject") {
    const transactionId = withdrawalReferences[withdrawal.id]?.trim() ?? "";
    if (decision === "approve" && !transactionId) {
      setError("Registra el hash TRC20 o referencia Binance antes de aprobar el retiro.");
      return;
    }
    void mutate(`withdrawal-${withdrawal.id}-${decision}`, () => api(`/admin/withdrawals/${withdrawal.id}/${decision}`, { method: "POST", ...json({ transactionId }) }), decision === "approve" ? "Pago del retiro registrado." : "Retiro rechazado y saldo devuelto al vendedor.");
  }

  const pendingSellers = sellers.filter(seller => seller.verificationRequested && !seller.verified);

  return <section className="mx-auto max-w-7xl px-5 py-12">
    <div className="rounded-[10px] bg-[#172f4a] px-7 py-8 text-white"><p className="eyebrow text-[#c7f25c]">ADMINISTRACION</p><div className="mt-2 flex flex-wrap items-end justify-between gap-4"><div><h1 className="text-4xl font-bold">Control del mercado</h1><p className="mt-2 text-sm text-[#d1e0ee]">Moderación, verificación manual de pagos y retiros.</p></div><button className="button-secondary" disabled={loading} onClick={() => void load()}>Actualizar</button></div></div>
    {error && <p className="notice-error mt-5">{error}</p>}{status && <p className="mt-5 text-sm text-[#426d28]">{status}</p>}

    <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{summary && Object.entries(summary).map(([label, value]) => <article className="card" key={label}><p className="text-sm text-[#65717e]">{summaryLabels[label] ?? label}</p><strong className="mt-2 block text-3xl">{typeof value === "number" ? value.toFixed(Number.isInteger(value) ? 0 : 2) : value}</strong></article>)}</div>

    <AdminSection title="Usuarios registrados" description="Datos privados visibles solo para administración."><div className="space-y-3">{users.map(user => <article className="flex flex-wrap items-center justify-between gap-4 border-b border-[#dce1dc] pb-3 text-sm" key={user.id}><div><strong>{user.name}{user.isAdmin ? " · ADMIN" : ""}</strong><p className="mt-1 text-[#65717e]">{user.email} · {user.role === "seller" ? "Vendedor" : "Comprador"} · correo {user.emailVerified ? "verificado" : "sin verificar"}{user.role === "seller" ? ` · vendedor ${user.verified ? "verificado" : "nuevo"}${user.foundingSeller ? " · FUNDADOR" : ""}` : ""}</p><p className="text-[#65717e]">Ofertas: {user.offers} · Pedidos: {user.orders} · Completados: {user.completedOrders} · Reseñas: {user.reviews}{user.wallet ? ` · Saldo: ${usdt(user.wallet.availableUsdt)} · Retenido: ${usdt(user.wallet.pendingUsdt)}` : ""}</p></div></article>)}{!users.length && <Empty text="No hay usuarios registrados." />}</div></AdminSection>

    <AdminSection title="Solicitudes de vendedores" description="Verifica solo cuentas que hayan completado tu proceso de revisión."><div className="space-y-3">{pendingSellers.map(seller => <article className="flex flex-wrap items-center justify-between gap-4 border-b border-[#dce1dc] pb-3 text-sm" key={seller.id}><div><strong>{seller.name}</strong><p className="mt-1 text-[#65717e]">{seller.email} · {seller.offers} ofertas</p></div><ActionButton busy={working === `seller-${seller.id}`} onClick={() => void mutate(`seller-${seller.id}`, () => api(`/admin/sellers/${seller.id}/verify`, { method: "POST" }), "Vendedor verificado.")}>Verificar vendedor</ActionButton></article>)}{!pendingSellers.length && <Empty text="No hay solicitudes pendientes." />}</div></AdminSection>

    <AdminSection title="Pagos USDT pendientes" description="Confirma solo después de revisar manualmente el hash en TRC20."><div className="space-y-3">{payments.map(payment => <article className="flex flex-wrap items-center justify-between gap-4 border-b border-[#dce1dc] pb-3 text-sm" key={payment.id}><div><strong>{payment.id} · {usdt(payment.paymentAmountUsdt)}</strong><p className="mt-1 text-[#65717e]">{payment.buyer} / {payment.seller} · enviado {date(payment.paymentSubmittedAt)}</p><code className="mt-1 block max-w-2xl break-all text-xs text-[#65717e]">{payment.paymentTxId || "Sin referencia"}</code></div><ActionButton busy={working === `payment-${payment.id}`} onClick={() => void mutate(`payment-${payment.id}`, () => api(`/admin/payments/${payment.id}/confirm`, { method: "POST" }), "Pago USDT confirmado; el vendedor fue avisado.")}>Confirmar pago</ActionButton></article>)}{!payments.length && <Empty text="No hay pagos pendientes." />}</div></AdminSection>

    <AdminSection title="Pagos PayPal confirmados" description="Registro de capturas confirmadas por PayPal."><div className="space-y-3">{paypalPayments.map(payment => <article className="border-b border-[#dce1dc] pb-3 text-sm" key={payment.id}><strong>{payment.id} · PayPal · {usd(payment.buyerChargeUsd)} cobrados</strong><p className="mt-1 text-[#65717e]">{payment.buyer} / {payment.seller} · {payment.status} · {date(payment.confirmedAt)}</p><p className="text-[#65717e]">Venta: {usdt(payment.saleAmountUsdt)} · Tarifa PayPal: {usd(payment.merchantFeeUsd)} · Comisión GameTrade: {usdt(payment.platformCommissionUsdt)} · Neto vendedor: {usdt(payment.sellerNetUsdt)}</p><code className="text-xs text-[#65717e]">Captura: {payment.captureId}</code></article>)}{!paypalPayments.length && <Empty text="No hay pagos PayPal confirmados." />}</div></AdminSection>

    <AdminSection title="Liquidaciones PayPal Live" description="Convierte el USD neto y acredita el USDT real antes de liberar la entrega."><div className="space-y-4">{paypalSettlements.map(payment => { const values = settlements[payment.id] ?? { convertedUsdt: "", reference: "" }; return <article className="border-b border-[#dce1dc] pb-4 text-sm" key={payment.id}><strong>{payment.id} · USD neto: {usd(payment.netUsd)}</strong><p className="mt-1 text-[#65717e]">{payment.buyer} / {payment.seller} · Bruto: {usd(payment.grossUsd)} · Comisión PayPal: {usd(payment.paypalFeeUsd)}</p><div className="mt-3 flex flex-wrap gap-2"><input className="field w-40" type="number" min="0.01" step="0.01" value={values.convertedUsdt} onChange={event => setSettlements(current => ({ ...current, [payment.id]: { ...values, convertedUsdt: event.target.value } }))} placeholder="USDT recibido" /><input className="field min-w-[16rem] flex-1" maxLength={80} value={values.reference} onChange={event => setSettlements(current => ({ ...current, [payment.id]: { ...values, reference: event.target.value } }))} placeholder="Hash TRC20 o referencia Binance" /><ActionButton busy={working === `settlement-${payment.id}`} onClick={() => settle(payment)}>Acreditar liquidación</ActionButton></div></article>; })}{!paypalSettlements.length && <Empty text="No hay liquidaciones PayPal Live pendientes." />}</div></AdminSection>

    <AdminSection title="Retiros solicitados" description="Al aprobar, envía el pago externamente y registra su referencia."><div className="space-y-4">{withdrawals.map(withdrawal => <article className="border-b border-[#dce1dc] pb-4 text-sm" key={withdrawal.id}><strong>{withdrawal.seller} · {usdt(withdrawal.grossCents / 100)}</strong><p className="mt-1 break-all text-[#65717e]">Dirección TRC20: {withdrawal.address} · Neto estimado: {usdt(withdrawal.netCents / 100)} · solicitado {date(withdrawal.createdAt)}</p><div className="mt-3 flex flex-wrap gap-2"><input className="field min-w-[16rem] flex-1" maxLength={80} value={withdrawalReferences[withdrawal.id] ?? ""} onChange={event => setWithdrawalReferences(current => ({ ...current, [withdrawal.id]: event.target.value }))} placeholder="Hash TRC20 o referencia Binance" /><ActionButton busy={working === `withdrawal-${withdrawal.id}-approve`} onClick={() => decideWithdrawal(withdrawal, "approve")}>Registrar pago enviado</ActionButton><button className="button-secondary" disabled={working !== null} onClick={() => decideWithdrawal(withdrawal, "reject")}>Rechazar y devolver</button></div></article>)}{!withdrawals.length && <Empty text="No hay retiros pendientes." />}</div></AdminSection>

    <AdminSection title="Disputas abiertas" description="Resuelve según las evidencias y reglas del mercado."><div className="space-y-4">{disputes.map(dispute => <article className="border-b border-[#dce1dc] pb-4 text-sm" key={dispute.id}><strong>{dispute.id} · {usdt(dispute.paymentAmountUsdt ?? dispute.amount)}</strong><p className="mt-1 text-[#65717e]">{dispute.buyer} vs. {dispute.seller} · {dispute.dispute?.reason || "Sin motivo indicado"}</p><div className="mt-3 flex flex-wrap gap-2"><input className="field min-w-[16rem] flex-1" maxLength={64} value={refundHashes[dispute.id] ?? ""} onChange={event => setRefundHashes(current => ({ ...current, [dispute.id]: event.target.value }))} placeholder="Hash TRC20 de reembolso (64 caracteres)" /><ActionButton busy={working === `dispute-${dispute.id}-buyer`} onClick={() => resolve(dispute, "buyer")}>Registrar reembolso</ActionButton><button className="button-secondary" disabled={working !== null} onClick={() => resolve(dispute, "seller")}>Resolver a vendedor</button></div><p className="mt-2 text-xs text-[#65717e]">El reembolso requiere un hash TRC20 válido; resolver a vendedor acredita su saldo.</p></article>)}{!disputes.length && <Empty text="No hay disputas abiertas." />}</div></AdminSection>

    <AdminSection title="Moderación de ofertas" description="Pausa temporalmente ofertas que requieran revisión."><div className="space-y-3">{offers.map(offer => <article className="flex flex-wrap items-center justify-between gap-4 border-b border-[#dce1dc] pb-3 text-sm" key={offer.id}><div><strong>{offer.title}</strong><p className="mt-1 text-[#65717e]">{offer.seller} · {offer.game} · ${Number(offer.price).toFixed(2)} · {offer.paused ? "Pausada" : "Activa"}</p></div><button className="button-secondary" disabled={working !== null} onClick={() => void mutate(`offer-${offer.id}`, () => api(`/admin/offers/${offer.id}/pause`, { method: "POST" }), offer.paused ? "Oferta reanudada." : "Oferta pausada.")}>{working === `offer-${offer.id}` ? "Actualizando..." : offer.paused ? "Reanudar" : "Pausar"}</button></article>)}{!offers.length && <Empty text="No hay ofertas." />}</div></AdminSection>
  </section>;
}

function AdminSection({ title, description, children }: { title: string; description: string; children: ReactNode }) {
  return <section className="card mt-8"><div className="flex flex-wrap items-end justify-between gap-3"><div><h2 className="text-xl font-semibold">{title}</h2><p className="mt-1 text-sm text-[#65717e]">{description}</p></div></div><div className="mt-4">{children}</div></section>;
}

function ActionButton({ busy, children, onClick }: { busy: boolean; children: ReactNode; onClick: () => void }) {
  return <button className="button-primary" disabled={busy} onClick={onClick}>{busy ? "Procesando..." : children}</button>;
}

function Empty({ text }: { text: string }) { return <p className="text-sm text-[#65717e]">{text}</p>; }
