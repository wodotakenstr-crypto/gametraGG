import { useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { api, json } from "../../lib/api";
import type { Account, Offer, Wallet } from "../../lib/types";
import { useAuth } from "../auth/AuthProvider";

export function SellerOffersPage() {
  const { account, refresh } = useAuth();
  const [offers, setOffers] = useState<Offer[]>([]);
  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [status, setStatus] = useState("");

  async function load() {
    try {
      const [sellerOffers, sellerWallet] = await Promise.all([api<Offer[]>("/seller/offers"), api<Wallet>("/seller/wallet")]);
      setOffers(sellerOffers); setWallet(sellerWallet); setStatus("");
    } catch (error) { setStatus(error instanceof Error ? error.message : "No se pudieron cargar las ofertas."); }
  }
  useEffect(() => { void load(); }, []);

  async function togglePause(id: string) { try { await api(`/offers/${id}/pause`, { method: "POST" }); await load(); } catch (error) { setStatus(error instanceof Error ? error.message : "No se pudo actualizar la oferta."); } }
  async function remove(id: string) { if (!window.confirm("¿Eliminar esta oferta? No podrás recuperarla.")) return; try { await api(`/offers/${id}`, { method: "DELETE" }); await load(); } catch (error) { setStatus(error instanceof Error ? error.message : "No se pudo eliminar la oferta."); } }
  async function save(event: FormEvent<HTMLFormElement>, id: string) { event.preventDefault(); try { await api(`/offers/${id}`, { method: "PATCH", ...json(Object.fromEntries(new FormData(event.currentTarget))) }); setEditing(null); await load(); } catch (error) { setStatus(error instanceof Error ? error.message : "No se pudo guardar la oferta."); } }
  async function requestVerification() { try { await api<Account>("/seller/verification", { method: "POST" }); await refresh(); setStatus("Solicitud de verificación enviada."); } catch (error) { setStatus(error instanceof Error ? error.message : "No se pudo solicitar la verificación."); } }

  return <section className="mx-auto max-w-5xl px-5 py-12">
    <p className="eyebrow">PANEL DE VENDEDOR</p><h1 className="mt-2 text-4xl font-bold">Mis ofertas</h1>
    <div className="mt-5 flex flex-wrap items-center gap-4"><Link className="wallet-summary" to="/wallet"><span>Saldo disponible</span><strong>{Number(wallet?.availableUsdt ?? 0).toFixed(2)} USDT</strong><small>Ver billetera</small></Link>{account?.verified ? <span className="text-sm text-[#426d28]">Vendedor verificado</span> : account?.verificationRequested ? <span className="text-sm text-[#65717e]">Verificación en revisión</span> : <button className="button-secondary" onClick={() => void requestVerification()}>Solicitar verificación</button>}</div>
    {status && <p className="notice-error mt-4">{status}</p>}
    <div className="mt-8 grid gap-4">{offers.map(offer => editing === offer.id ? <form className="card grid gap-3 md:grid-cols-3" key={offer.id} onSubmit={event => void save(event, offer.id)}><input className="field md:col-span-2" name="title" defaultValue={offer.title} required maxLength={80} /><input className="field" name="price" defaultValue={offer.price} required type="number" min="0.01" step="0.01" /><input className="field md:col-span-2" name="delivery" defaultValue={offer.delivery} required maxLength={30} /><div className="flex gap-2"><button className="button-primary">Guardar</button><button className="button-secondary" type="button" onClick={() => setEditing(null)}>Cancelar</button></div></form> : <article className="card flex flex-wrap items-center justify-between gap-4" key={offer.id}><div><p className="text-sm text-[#246ed4]">{offer.game} · {offer.type}</p><h2 className="font-semibold">{offer.title}</h2><p className="text-sm text-[#65717e]">${Number(offer.price).toFixed(2)} · {offer.delivery}{offer.paused ? " · Pausada" : ""}</p></div><div className="flex gap-2"><button className="button-secondary" onClick={() => setEditing(offer.id)}>Editar</button><button className="button-secondary" onClick={() => void togglePause(offer.id)}>{offer.paused ? "Reanudar" : "Pausar"}</button><button className="button-secondary" onClick={() => void remove(offer.id)}>Eliminar</button></div></article>)}{!offers.length && <div className="card text-[#65717e]">Aún no has publicado ofertas.</div>}</div>
  </section>;
}

export function WalletPage() {
  const [wallet, setWallet] = useState<Wallet | null>(null); const [status, setStatus] = useState("");
  async function load() { try { setWallet(await api<Wallet>("/seller/wallet")); } catch (error) { setStatus(error instanceof Error ? error.message : "No se pudo cargar la billetera."); } }
  useEffect(() => { void load(); }, []);
  async function address(event: FormEvent<HTMLFormElement>) { event.preventDefault(); try { await api("/seller/wallet/address", { method: "PUT", ...json(Object.fromEntries(new FormData(event.currentTarget))) }); setStatus("Dirección guardada."); await load(); } catch (error) { setStatus(error instanceof Error ? error.message : "No fue posible guardar la dirección."); } }
  async function withdrawal(event: FormEvent<HTMLFormElement>) { event.preventDefault(); try { await api("/seller/wallet/withdrawals", { method: "POST", ...json(Object.fromEntries(new FormData(event.currentTarget))) }); setStatus("Retiro solicitado."); event.currentTarget.reset(); await load(); } catch (error) { setStatus(error instanceof Error ? error.message : "No fue posible solicitar el retiro."); } }
  return <section className="mx-auto max-w-5xl px-5 py-12"><p className="eyebrow">BILLETERA DE VENDEDOR</p><h1 className="mt-2 text-4xl font-bold">Saldo USDT</h1>{status && <p className="notice-error mt-4">{status}</p>}<div className="mt-8 grid gap-4 md:grid-cols-2"><div className="card"><p className="text-[#65717e]">Disponible</p><strong className="mt-2 block text-4xl">{Number(wallet?.availableUsdt ?? 0).toFixed(2)} USDT</strong></div><div className="card"><p className="text-[#65717e]">Retenido en retiros</p><strong className="mt-2 block text-4xl">{Number(wallet?.pendingUsdt ?? 0).toFixed(2)} USDT</strong></div></div><div className="mt-5 grid gap-5 md:grid-cols-2"><form className="card space-y-4" onSubmit={address}><h2 className="text-xl font-semibold">Dirección de retiro</h2><input className="field" name="address" defaultValue={wallet?.withdrawalAddress} required maxLength={34} placeholder="Dirección TRON TRC20" /><button className="button-primary">Guardar dirección</button></form><form className="card space-y-4" onSubmit={withdrawal}><h2 className="text-xl font-semibold">Solicitar retiro</h2><p className="text-sm text-[#65717e]">Mínimo 10 USDT. La tarifa final se revisa antes del pago.</p><input className="field" name="amount" required type="number" min="10" step="0.01" placeholder="Monto USDT" /><button className="button-primary">Solicitar retiro</button></form></div><section className="card mt-5"><h2 className="text-xl font-semibold">Créditos de ventas</h2><div className="mt-4 space-y-3">{wallet?.credits.map(credit => <article className="flex flex-wrap justify-between gap-3 border-b border-[#dce1dc] pb-3 text-sm" key={credit.id}><span>{credit.productTitle}</span><span>Bruto {credit.grossUsdt.toFixed(2)} · Comisión {credit.commissionUsdt.toFixed(2)} · Neto <strong>{credit.netUsdt.toFixed(2)} USDT</strong></span></article>)}{!wallet?.credits.length && <p className="text-[#65717e]">Aún no hay ventas acreditadas.</p>}</div></section><section className="card mt-5"><h2 className="text-xl font-semibold">Retiros</h2><div className="mt-4 space-y-3">{wallet?.withdrawals.map(withdrawal => <article className="flex flex-wrap justify-between gap-3 border-b border-[#dce1dc] pb-3 text-sm" key={withdrawal.id}><span>{new Date(withdrawal.createdAt).toLocaleDateString("es")}</span><span>{(withdrawal.netCents / 100).toFixed(2)} USDT · {withdrawal.status}</span></article>)}{!wallet?.withdrawals.length && <p className="text-[#65717e]">Aún no has solicitado retiros.</p>}</div></section></section>;
}
