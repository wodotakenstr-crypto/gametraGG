import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ApiError, api, json } from "../../lib/api";
import type { Offer } from "../../lib/types";
import { useAuth } from "../auth/AuthProvider";

const games = ["Free Fire", "Roblox", "WoW", "RuneScape", "Lineage 2", "Tibia", "Albion"];
const types = ["Moneda", "Item", "Servicio", "Cuenta", "Boosting", "Recarga"];

export function HomePage() {
  const [offers, setOffers] = useState<Offer[]>([]);
  const [query, setQuery] = useState("");
  const [game, setGame] = useState("all");
  const [type, setType] = useState("all");
  const [error, setError] = useState("");

  useEffect(() => { api<Offer[]>("/offers").then(setOffers).catch(() => setError("No se pudieron cargar las ofertas.")); }, []);
  const filtered = offers.filter(offer => (game === "all" || offer.game === game) && (type === "all" || offer.type === type) && `${offer.title} ${offer.game} ${offer.seller}`.toLowerCase().includes(query.toLowerCase()));

  return <>
    <section className="mx-auto grid max-w-7xl gap-0 overflow-hidden bg-[#e9e8e0] lg:grid-cols-[1.15fr_.85fr]">
      <div className="px-7 py-16 md:px-14 md:py-20"><p className="eyebrow">MERCADO P2P PARA GAMERS</p><h1 className="mt-4 text-5xl font-bold leading-[.98] tracking-[-4px] md:text-7xl">Compra. Vende.<br /><em className="font-normal text-[#647c92]">Juega tranquilo.</em></h1><p className="mt-6 max-w-xl text-lg leading-relaxed text-[#65717e]">Compra y vende con jugadores reales. Cada oferta muestra precio, reputación y tiempo de entrega.</p><div className="mt-8 flex gap-4"><a className="button-primary" href="#offers">Explorar ofertas</a><Link className="pt-3 text-sm font-semibold" to="/account?mode=register&role=seller">Empezar a vender <span className="text-orange">→</span></Link></div></div>
      <aside className="relative overflow-hidden bg-[#dfe9e2] p-8 md:p-12"><div className="absolute -right-20 -top-20 h-72 w-72 rounded-full border border-[#ffffff80] shadow-[0_0_0_42px_#ffffff35,0_0_0_84px_#ffffff20]" /><p className="eyebrow relative">PAGO EN BETA</p><h2 className="relative mt-4 text-3xl font-semibold tracking-[-1.5px]">Seguimiento claro<br />en cada pedido.</h2><ol className="relative mt-8 space-y-4 text-sm leading-relaxed text-[#52616e]"><li>01 · Elige una oferta</li><li>02 · Envía USDT TRC20</li><li>03 · Confirma y recibe</li></ol><span className="absolute bottom-0 right-7 text-[120px] font-bold leading-none tracking-[-16px] text-[#c7f25c]/45">GT</span></aside>
    </section>
    <section id="offers" className="mx-auto max-w-7xl px-5 py-20"><div className="mb-8 flex flex-col gap-4 md:flex-row md:items-end md:justify-between"><div><p className="eyebrow">MERCADO EN VIVO</p><h2 className="mt-2 text-4xl font-bold tracking-[-2px]">Encuentra lo que buscas</h2></div><input className="field md:w-80" value={query} onChange={event => setQuery(event.target.value)} placeholder="Buscar juego, servicio o vendedor" /></div><div className="mb-6 flex flex-wrap gap-2"><Filter label="Todos" active={game === "all"} onClick={() => setGame("all")} />{games.map(item => <Filter key={item} label={item} active={game === item} onClick={() => setGame(item)} />)}<select className="field ml-auto w-auto" value={type} onChange={event => setType(event.target.value)}><option value="all">Todos los tipos</option>{types.map(item => <option key={item}>{item}</option>)}</select></div>{error ? <p className="notice-error">{error}</p> : <OfferGrid offers={filtered} />}</section>
    <SellOfferForm onCreated={offer => setOffers(current => [offer, ...current])} />
  </>;
}

function Filter({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) { return <button className={active ? "filter active" : "filter"} onClick={onClick}>{label}</button>; }

function OfferGrid({ offers }: { offers: Offer[] }) {
  const { account } = useAuth();
  const navigate = useNavigate();
  async function order(offerId: string) { try { const order = await api<{ id: string }>("/orders", { method: "POST", ...json({ offerId }) }); navigate(`/orders?order=${order.id}`); } catch (error) { if (error instanceof ApiError && error.status === 401) navigate("/account"); else window.alert(error instanceof Error ? error.message : "Error inesperado"); } }
  if (!offers.length) return <p className="page-state">No hay ofertas con estos filtros.</p>;
  return <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{offers.map(offer => <article className="card" key={offer.id}><div className="flex items-start justify-between gap-4"><div><p className="text-sm text-market-blue">{offer.game} · {offer.type}</p><h3 className="mt-1 text-lg font-semibold">{offer.title}</h3></div><strong className="text-xl">${Number(offer.price).toFixed(2)}</strong></div><p className="mt-5 text-sm text-[#65717e]">{offer.delivery} · <Link className="text-ink hover:text-market-blue" to={`/seller/${offer.sellerId}`}>{offer.seller}</Link>{offer.verified && " · Verificado"}</p>{offer.sellerId === account?.id ? <p className="mt-5 text-sm text-[#65717e]">Tu oferta</p> : <button className="button-primary mt-5 w-full" onClick={() => void order(offer.id)}>Solicitar</button>}</article>)}</div>;
}

function SellOfferForm({ onCreated }: { onCreated: (offer: Offer) => void }) {
  const { account } = useAuth(); const [status, setStatus] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); try { const result = await api<Offer>("/offers", { method: "POST", ...json(Object.fromEntries(new FormData(event.currentTarget))) }); onCreated(result); event.currentTarget.reset(); setStatus("Oferta publicada correctamente."); } catch (error) { setStatus(error instanceof Error ? error.message : "No se pudo publicar la oferta."); } }
  if (!account || account.role !== "seller" || !account.emailVerified) return <section className="bg-[#e8edf0] px-5 py-16"><div className="mx-auto max-w-7xl"><div className="card"><h2 className="text-2xl font-bold">¿Quieres vender?</h2><p className="mt-2 text-[#52616e]">Necesitas una cuenta de vendedor con correo verificado.</p><Link className="button-primary mt-5 inline-block" to="/account?mode=register&role=seller">Crear cuenta de vendedor</Link></div></div></section>;
  return <section className="mx-auto max-w-7xl px-5 pb-20"><form className="card grid gap-4 md:grid-cols-3" onSubmit={submit}><h2 className="md:col-span-3 text-2xl font-bold">Publicar una oferta</h2><select className="field" name="game">{games.map(item => <option key={item}>{item}</option>)}</select><select className="field" name="type">{types.map(item => <option key={item}>{item}</option>)}</select><input className="field" name="price" required type="number" min="0.01" step="0.01" placeholder="Precio USD" /><input className="field md:col-span-2" name="title" required maxLength={80} placeholder="Título de la oferta" /><input className="field" name="delivery" required maxLength={30} placeholder="Tiempo de entrega" /><button className="button-primary md:col-span-3">Publicar oferta</button>{status && <p className="md:col-span-3 text-sm text-slate-300">{status}</p>}</form></section>;
}
