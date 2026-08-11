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
    <section className="marketplace-hero">
      <div className="marketplace-intro"><p className="directory-label">MERCADO P2P PARA GAMERS</p><h1>Encuentra tu<br /><span>próximo trade.</span></h1><p>Compra y vende con jugadores reales. Cada oferta muestra precio, reputación y tiempo de entrega.</p><div className="hero-links"><a href="#mercado">Ver ofertas</a><Link to="/account?mode=register&role=seller">Empezar a vender</Link></div><div className="hero-proof"><span>Ofertas de la comunidad</span><span>Pedidos con seguimiento</span><span>Soporte ante disputas</span></div></div>
      <div className="game-directory"><div className="directory-title"><span>JUEGOS DESTACADOS</span><a href="#mercado">Ver todos los juegos</a></div><div className="directory-grid">{[["Albion Online", "Albion", ["Silver", "Gold", "Items", "Servicios"]], ["World of Warcraft", "WoW", ["Gold", "Cuentas", "Boosting", "Servicios"]], ["RuneScape", "RuneScape", ["OSRS Gold", "Cuentas", "Items", "Membresías"]], ["Lineage 2", "Lineage 2", ["Adena", "Items", "Cuentas", "Boosting"]], ["Free Fire", "Free Fire", ["Diamantes", "Recargas", "Servicios"]], ["Roblox", "Roblox", ["Robux", "Gift cards", "Items"]]].map(([name, value, links]) => <article key={String(value)}><strong>{name}</strong>{(links as string[]).map(link => <a href="#mercado" key={link} onClick={() => setGame(String(value))}>{link}</a>)}</article>)}</div></div>
      <aside className="spotlight"><div className="spotlight-ring ring-one" /><div className="spotlight-ring ring-two" /><div className="spotlight-chip chip-blue">ALBION<br /><b>SILVER</b></div><div className="spotlight-card"><small>DESTACADO HOY</small><strong>Mercado seguro<br />para gamers</strong><span>Ofertas de jugadores reales</span></div><div className="spotlight-orb" /></aside>
    </section>
    <section className="market" id="mercado"><div className="section-heading"><div><p className="eyebrow"><i />MERCADO EN VIVO</p><h2>Encuentra lo que buscas</h2></div><label className="search"><span>⌕</span><input value={query} onChange={event => setQuery(event.target.value)} type="search" placeholder="Buscar juego, moneda o servicio" /></label></div><div className="trust-strip"><strong>Pago manual en beta</strong><span>Los pagos USDT se verifican manualmente antes de que el vendedor entregue.</span><Link to="/rules">Ver reglas</Link></div><div className="game-tabs"><Filter label="Todos" active={game === "all"} onClick={() => setGame("all")} />{games.map(item => <Filter key={item} label={item} active={game === item} onClick={() => setGame(item)} />)}</div><div className="market-layout"><aside className="filters"><div className="filter-title"><span>Filtrar</span><button onClick={() => { setQuery(""); setType("all"); }}>Limpiar</button></div><fieldset><legend>Tipo de producto</legend>{types.map(item => <label key={item}><input type="radio" name="type" checked={type === item} onChange={() => setType(item)} /> {item}</label>)}</fieldset></aside><div><div className="results-header"><span>{filtered.length} ofertas disponibles</span><label className="sort-label">Tipo<select className="sort" value={type} onChange={event => setType(event.target.value)}><option value="all">Todos</option>{types.map(item => <option key={item}>{item}</option>)}</select></label></div>{error ? <p className="notice-error">{error}</p> : <OfferGrid offers={filtered} />}</div></div></section>
    <SellOfferForm onCreated={offer => setOffers(current => [offer, ...current])} />
    <section className="process" id="como-funciona"><div className="section-heading"><div><p className="eyebrow"><i />PAGO MANUAL EN BETA</p><h2>Así funciona el pago</h2></div><p>Un proceso claro desde la oferta hasta la confirmación de entrega.</p></div><div className="steps"><article><span>01</span><h3>Elige una oferta</h3><p>Compara precio, entrega y reputación del vendedor.</p></article><article><span>02</span><h3>Envía el pago</h3><p>Registra la referencia USDT o paga mediante PayPal cuando esté disponible.</p></article><article><span>03</span><h3>Confirma y recibe</h3><p>Confirma solo después de recibir lo acordado.</p></article></div></section>
  </>;
}

function Filter({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) { return <button className={active ? "game-tab active" : "game-tab"} onClick={onClick}>{label}</button>; }

function OfferGrid({ offers }: { offers: Offer[] }) {
  const { account } = useAuth();
  const navigate = useNavigate();
  async function order(offerId: string) { try { const order = await api<{ id: string }>("/orders", { method: "POST", ...json({ offerId }) }); navigate(`/orders?order=${order.id}`); } catch (error) { if (error instanceof ApiError && error.status === 401) navigate("/account"); else window.alert(error instanceof Error ? error.message : "Error inesperado"); } }
  if (!offers.length) return <p className="page-state">No hay ofertas con estos filtros.</p>;
  return <div className="offers">{offers.map(offer => <article className="offer" key={offer.id}><div><div className="offer-name">{offer.title}</div><div className="offer-game">{offer.game} · {offer.type}</div></div><div className="seller"><Link className="seller-profile-link" to={`/seller/${offer.sellerId}`}>{offer.seller}</Link>{offer.verified && <b className="verified">VERIFICADO</b>}<span>● {offer.rating || "Sin reseñas"}</span></div><div className="delivery">{offer.delivery}</div><div className="price">${Number(offer.price).toFixed(2)}</div>{offer.sellerId === account?.id ? <span className="own-offer">Tu oferta</span> : <button className="button buy" onClick={() => void order(offer.id)}>Solicitar</button>}</article>)}</div>;
}

function SellOfferForm({ onCreated }: { onCreated: (offer: Offer) => void }) {
  const { account } = useAuth(); const [status, setStatus] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); try { const result = await api<Offer>("/offers", { method: "POST", ...json(Object.fromEntries(new FormData(event.currentTarget))) }); onCreated(result); event.currentTarget.reset(); setStatus("Oferta publicada correctamente."); } catch (error) { setStatus(error instanceof Error ? error.message : "No se pudo publicar la oferta."); } }
  if (!account || account.role !== "seller" || !account.emailVerified) return <section id="vender" className="bg-[#e8edf0] px-5 py-16"><div className="mx-auto max-w-7xl"><div className="card"><h2 className="text-2xl font-bold">¿Quieres vender?</h2><p className="mt-2 text-[#52616e]">Necesitas una cuenta de vendedor con correo verificado.</p><Link className="button-primary mt-5 inline-block" to="/account?mode=register&role=seller">Crear cuenta de vendedor</Link></div></div></section>;
  return <section id="vender" className="mx-auto max-w-7xl px-5 pb-20"><form className="card grid gap-4 md:grid-cols-3" onSubmit={submit}><h2 className="md:col-span-3 text-2xl font-bold">Publicar una oferta</h2><select className="field" name="game">{games.map(item => <option key={item}>{item}</option>)}</select><select className="field" name="type">{types.map(item => <option key={item}>{item}</option>)}</select><input className="field" name="price" required type="number" min="0.01" step="0.01" placeholder="Precio USD" /><input className="field md:col-span-2" name="title" required maxLength={80} placeholder="Título de la oferta" /><input className="field" name="delivery" required maxLength={30} placeholder="Tiempo de entrega" /><button className="button-primary md:col-span-3">Publicar oferta</button>{status && <p className="md:col-span-3 text-sm text-slate-300">{status}</p>}</form></section>;
}
