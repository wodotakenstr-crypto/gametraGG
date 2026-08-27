import { FormEvent, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { divIcon, latLngBounds } from "leaflet";
import { MapContainer, Marker, Popup, TileLayer } from "react-leaflet";
import "leaflet/dist/leaflet.css";

type PaymentMethod = "Efectivo" | "Transferencia" | "Tarjeta";
type OrderStatus = "Nuevo" | "En ruta" | "Entregado";
type OrderItem = { product: string; quantity: number; unitPrice: number };

type Order = {
  id: number;
  client: string;
  address: string;
  comuna: string;
  phone: string;
  product: string;
  quantity: number;
  total: number;
  payment: PaymentMethod;
  status: OrderStatus;
  time: string;
  note?: string;
  items?: OrderItem[];
};

type Client = { name: string; phone: string; address: string; comuna: string };
type InventoryItem = { id: string; name: string; category: string; stock: number; unit: string; minimum: number; price?: number; availableForSale?: boolean };
type DriverLocation = { latitude: number; longitude: number; updatedAt: string } | null;
type SharedWaterState = { orders: Order[]; clients: Client[]; inventory: InventoryItem[]; expenses: { name: string; value: number }[]; driverLocation: DriverLocation; monthlyClosures?: MonthlyClosure[] };
type DeliveryAlert = { id: number; message: string; createdAt: string };
type ProductOption = { name: string; price: number; stock: number; unlimited: boolean };
type MonthlyClosure = { id: string; period: string; closedAt: string; orders: Order[]; expenses: { name: string; value: number }[] };

const clients: Client[] = [
  { name: "María José González", phone: "+56 9 8765 4312", address: "Los Castaños 184", comuna: "La Florida" },
  { name: "Panadería El Trigal", phone: "+56 9 6321 9834", address: "Av. Vicuña Mackenna 5890", comuna: "Macul" },
  { name: "Rodrigo Sepúlveda", phone: "+56 9 7456 2109", address: "Pasaje El Molino 72", comuna: "Ñuñoa" },
  { name: "Clínica Santa Isabel", phone: "+56 2 2345 9087", address: "Av. Irarrázaval 3980", comuna: "Ñuñoa" },
];

const defaultProducts = [
  { name: "Recarga 20 litros", price: 3500 },
  { name: "Recarga 10 litros", price: 2200 },
  { name: "Recarga 5 litros", price: 1400 },
];
const removedProductNames = new Set(["Bidón", "Dispensador", "Tapas de seguridad", "Sellos termoencogibles"]);
const removeDiscontinuedProducts = (items: InventoryItem[]) => items.filter((item) => !removedProductNames.has(item.name));
const unlimitedProducts = new Set(["Recarga 20 litros", "Recarga 10 litros", "Recarga 5 litros"]);
const isUnlimitedProduct = (name: string) => unlimitedProducts.has(name);
const inventoryOnlyProducts: InventoryItem[] = [
  { id: "bidon-20-litros", name: "Bidón 20 litros", category: "Productos", stock: 0, unit: "unidades", minimum: 0, price: 2000 },
  { id: "bidon-10-litros", name: "Bidón 10 litros", category: "Productos", stock: 0, unit: "unidades", minimum: 0, price: 1500 },
  { id: "dispensador-de-mesa", name: "Dispensador de mesa", category: "Productos", stock: 0, unit: "unidades", minimum: 0, price: 7000 },
  { id: "dispensador-usb-premium", name: "Dispensador USB premium", category: "Productos", stock: 0, unit: "unidades", minimum: 0, price: 7000 },
  { id: "dispensador-basico-usb", name: "Dispensador básico USB", category: "Productos", stock: 0, unit: "unidades", minimum: 0, price: 4000 },
  { id: "dispensador-bidon-oculto", name: "Dispensador con bidón oculto", category: "Productos", stock: 0, unit: "unidades", minimum: 0, price: 115000 },
  { id: "dispensador-sobremesa-fria-caliente", name: "Dispensador sobremesa agua fría y caliente", category: "Productos", stock: 0, unit: "unidades", minimum: 0, price: 47000 },
  { id: "dispensador-frigobar", name: "Dispensador frigobar", category: "Productos", stock: 0, unit: "unidades", minimum: 0, price: 95000 },
  { id: "dispensador-sobremesa-basico", name: "Dispensador sobremesa agua fría, caliente básico", category: "Productos", stock: 0, unit: "unidades", minimum: 0, price: 45000 },
  { id: "dispensador-sobremesa-tres-temperaturas", name: "Dispensador sobremesa agua fría, caliente y temperatura ambiente", category: "Productos", stock: 0, unit: "unidades", minimum: 0, price: 75000 },
  { id: "dispensador-manual", name: "Dispensador manual", category: "Productos", stock: 0, unit: "unidades", minimum: 0, price: 3000 },
];

const initialOrders: Order[] = [];

const initialInventory: InventoryItem[] = [
  { id: "recarga-20", name: "Recarga 20 litros", category: "Productos", stock: 48, unit: "bidones", minimum: 12, price: 3500 },
  { id: "recarga-10", name: "Recarga 10 litros", category: "Productos", stock: 31, unit: "bidones", minimum: 10, price: 2200 },
  { id: "recarga-5", name: "Recarga 5 litros", category: "Productos", stock: 22, unit: "bidones", minimum: 8, price: 1400 },
  ...inventoryOnlyProducts,
];
const ensureInventoryOnlyProducts = (items: InventoryItem[]) => [...items, ...inventoryOnlyProducts.filter((product) => !items.some((item) => item.id === product.id))];

const depot = { name: "Local De la Roca", address: "Orlando Letelier 9613, Peñalolén", latitude: -33.4796626, longitude: -70.5332919 };
const sisterHome = { name: "Casa de mi hermana", address: "33°31'47.1\"S 70°46'54.8\"W", latitude: -33.5297546, longitude: -70.7818832 };

const money = (value: number) => new Intl.NumberFormat("es-CL", { style: "currency", currency: "CLP", maximumFractionDigits: 0 }).format(value);
const currentDateLong = () => new Intl.DateTimeFormat("es-CL", { weekday: "long", day: "numeric", month: "long" }).format(new Date()).toUpperCase();
const currentDateShort = () => new Intl.DateTimeFormat("es-CL", { day: "numeric", month: "short", year: "numeric" }).format(new Date()).replace(".", "");
const loadSaved = <T,>(key: string, fallback: T): T => { try { const saved = localStorage.getItem(key); return saved ? JSON.parse(saved) as T : fallback; } catch { return fallback; } };
const getOrderItems = (order: Order): OrderItem[] => order.items?.length ? order.items : [{ product: order.product, quantity: order.quantity, unitPrice: order.total / order.quantity }];
const pagePaths: Record<string, string> = { Resumen: "/", Pedidos: "/pedidos", Clientes: "/clientes", Inventario: "/inventario", Reparto: "/reparto", Repartidor: "/repartidor", Reportes: "/reportes" };
const pageForPath = (path: string) => Object.entries(pagePaths).find(([, value]) => value === path)?.[0] ?? "Resumen";

function Icon({ name, size = 20 }: { name: string; size?: number }) {
  const paths: Record<string, string> = {
    grid: "M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z",
    calendar: "M5 4v3m14-3v3M4 9h16M5 5h14a1 1 0 0 1 1 1v13H4V6a1 1 0 0 1 1-1zM8 13h3m-3 3h5",
    truck: "M3 6h11v10H3zM14 10h3l3 3v3h-6zM6 19a2 2 0 1 0 0-4 2 2 0 0 0 0 4m10 0a2 2 0 1 0 0-4 2 2 0 0 0 0 4",
    chart: "M4 20V10m5 10V4m5 16v-7m5 7V7",
    settings: "M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zm0-13.5v2m0 16v2M4.2 4.2l1.4 1.4m12.8 12.8 1.4 1.4M2 12h2m16 0h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4",
    search: "m20 20-4.2-4.2m2.2-5.3a7.5 7.5 0 1 1-15 0 7.5 7.5 0 0 1 15 0z",
    bell: "M18 9a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9m-8.5 12h5",
    plus: "M12 5v14M5 12h14",
    pin: "M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0zm-8 2.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z",
    phone: "M6.6 3.5 9 6.2 7.5 8.5a15 15 0 0 0 8 8l2.3-1.5 2.7 2.4-1.5 2.4c-.6.9-1.7 1.3-2.7 1A20 20 0 0 1 3.2 7.7c-.3-1 .1-2.1 1-2.7z",
    chevron: "m8 10 4 4 4-4",
    dots: "M5 12h.01M12 12h.01M19 12h.01",
    receipt: "M6 3h12v18l-3-2-3 2-3-2-3 2zm3 5h6m-6 4h6",
    wallet: "M4 6h14a2 2 0 0 1 2 2v10H4a2 2 0 0 1-2-2V6a3 3 0 0 1 3-3h12v3M16 12h2",
    users: "M16 20v-1.5a4.5 4.5 0 0 0-4.5-4.5h-4A4.5 4.5 0 0 0 3 18.5V20m11-15a3 3 0 1 1-6 0 3 3 0 0 1 6 0zm3 8a4 4 0 0 1 4 4v3m-4-14a3 3 0 0 1 0 6",
    box: "M4 7.5 12 3l8 4.5v9L12 21l-8-4.5zm0 0 8 4.5m8-4.5-8 4.5m0 9v-9",
    home: "m3 10 9-7 9 7v10h-6v-6H9v6H3z",
    motorbike: "M5 17a3 3 0 1 0 0-6 3 3 0 0 0 0 6m14 0a3 3 0 1 0 0-6 3 3 0 0 0 0 6M8 14h5l2-4h3m-9 4 2-5h4m-4 0-2-2H7",
    check: "m5 12 4.2 4.2L19 6.5",
  };
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d={paths[name]} /></svg>;
}

const comunaCoordinates: Record<string, [number, number]> = { "La Florida": [-33.533, -70.597], Macul: [-33.49, -70.6], "Ñuñoa": [-33.456, -70.598] };
const mapIcon = (className: string, path: string) => divIcon({ className: "", html: `<span class="live-map-pin ${className}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="${path}" /></svg></span>`, iconSize: [42, 42], iconAnchor: [21, 42] });
const depotIcon = mapIcon("depot", "m3 10 9-7 9 7v10h-6v-6H9v6H3z");
const sisterHomeIcon = mapIcon("sister-home", "m3 10 9-7 9 7v10h-6v-6H9v6H3z");
const driverIcon = mapIcon("driver", "M5 17a3 3 0 1 0 0-6 3 3 0 0 0 0 6m14 0a3 3 0 1 0 0-6 3 3 0 0 0 0 6M8 14h5l2-4h3m-9 4 2-5h4m-4 0-2-2H7");
const destinationIcon = mapIcon("destination", "M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8m0 5.5a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3");

function LiveRouteMap({ driverLocation, nextStop }: { driverLocation: DriverLocation; nextStop?: Order }) {
  const destination = nextStop ? comunaCoordinates[nextStop.comuna] ?? [-33.456, -70.598] : [depot.latitude, depot.longitude] as [number, number];
  const driver = driverLocation ? [driverLocation.latitude, driverLocation.longitude] as [number, number] : [depot.latitude, depot.longitude] as [number, number];
  const points: [number, number][] = [[depot.latitude, depot.longitude], [sisterHome.latitude, sisterHome.longitude], driver, destination];
  return <div className="live-route-map"><MapContainer key={points.flat().join("-")} bounds={latLngBounds(points)} boundsOptions={{ padding: [40, 40] }} scrollWheelZoom><TileLayer attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" /><Marker position={[depot.latitude, depot.longitude]} icon={depotIcon}><Popup><b>Local De la Roca</b><br />{depot.address}</Popup></Marker><Marker position={[sisterHome.latitude, sisterHome.longitude]} icon={sisterHomeIcon}><Popup><b>{sisterHome.name}</b><br />{sisterHome.address}</Popup></Marker>{driverLocation && <Marker position={driver} icon={driverIcon}><Popup><b>Repartidor en moto</b><br />GPS actualizado</Popup></Marker>}{nextStop && <Marker position={destination} icon={destinationIcon}><Popup><b>{nextStop.client}</b><br />{nextStop.address}, {nextStop.comuna}</Popup></Marker>}</MapContainer></div>;
}

function DeliveryProgress({ order }: { order?: Order }) {
  const activeStep = order?.status === "Entregado" ? 4 : order?.status === "En ruta" ? 3 : order ? 1 : 0;
  const steps = ["Creado", "Asignado", "Recogido", "En ruta", "Entregado"];
  return <section className="delivery-progress"><div className="progress-summary"><div><p>ENTREGA EN CURSO</p><h2>{order?.client ?? "Sin entrega activa"}</h2><span>{order ? `${order.address}, ${order.comuna}` : "No hay pedidos pendientes"}</span></div><div className="scooter-badge"><Icon name="motorbike" size={34} /></div></div><div className="journey-steps">{steps.map((step, index) => <div className={index <= activeStep ? "done" : ""} key={step}><i>{index < activeStep ? <Icon name="check" size={14} /> : index + 1}</i><b>{step}</b></div>)}</div></section>;
}

function PricingCatalog({ inventory, onChange }: { inventory: InventoryItem[]; onChange: (id: string, price: number) => void }) {
  const sellable = inventory.filter((item) => isUnlimitedProduct(item.name));
  return <section className="pricing-catalog"><div><p className="section-kicker">LISTA DE PRECIOS</p><h2>Precios de venta</h2><span>Actualiza precios por comuna o promoción antes de crear el pedido.</span></div><div className="pricing-list">{sellable.map((item) => <label key={item.id}><span><b>{item.name}</b><small>{isUnlimitedProduct(item.name) ? "Stock ilimitado" : `Stock: ${item.stock} ${item.unit}`}</small></span><input aria-label={`Precio de ${item.name}`} type="number" min="0" value={item.price ?? defaultProducts.find((product) => product.name === item.name)?.price ?? 0} onChange={(event) => onChange(item.id, Number(event.target.value))} /><em>{money(item.price ?? defaultProducts.find((product) => product.name === item.name)?.price ?? 0)}</em></label>)}</div></section>;
}

function RiderPaymentsInCards({ orders, onChange }: { orders: Order[]; onChange: (id: number, payment: PaymentMethod) => void }) {
  const pending = orders.filter((order) => order.status !== "Entregado");
  const [cards, setCards] = useState<HTMLElement[]>([]);
  useEffect(() => {
    const frame = requestAnimationFrame(() => setCards(Array.from(document.querySelectorAll<HTMLElement>(".rider-orders article")).map((card) => {
      const existing = card.querySelector<HTMLElement>(".rider-payment-slot");
      if (existing) return existing;
      const slot = document.createElement("div");
      slot.className = "rider-payment-slot";
      card.querySelector(".rider-action")?.before(slot);
      return slot;
    })));
    return () => cancelAnimationFrame(frame);
  }, [orders]);
  return <>{pending.map((order, index) => cards[index] && createPortal(<div className="rider-payment" key={order.id}><b>Método de cobro</b><select aria-label={`Método de pago de ${order.client}`} value={order.payment} onChange={(event) => onChange(order.id, event.target.value as PaymentMethod)}><option>Efectivo</option><option>Tarjeta</option><option>Transferencia</option></select></div>, cards[index]))}</>;
}

function InventoryEditors({ inventory, onChange }: { inventory: InventoryItem[]; onChange: (id: string, stock: number) => void }) {
  const [slots, setSlots] = useState<HTMLElement[]>([]);
  useEffect(() => {
    const frame = requestAnimationFrame(() => setSlots(Array.from(document.querySelectorAll<HTMLElement>(".inventory-list article")).filter((_, index) => !isUnlimitedProduct(inventory[index]?.name ?? "")).map((card) => {
      let slot = card.querySelector<HTMLElement>(".inventory-editor-slot");
      if (!slot) { slot = document.createElement("div"); slot.className = "inventory-editor-slot"; card.querySelector(".inventory-quantity")?.replaceWith(slot); }
      return slot;
    })));
    return () => cancelAnimationFrame(frame);
  }, [inventory]);
  return <>{inventory.filter((item) => !isUnlimitedProduct(item.name)).map((item, index) => slots[index] && createPortal(<><strong className="inventory-price">{money(item.price ?? 0)}</strong><input className="inventory-stock-input" aria-label={`Cantidad de ${item.name}`} type="number" min="0" value={item.stock} onChange={(event) => onChange(item.id, Number(event.target.value))} /></>, slots[index], item.id))}</>;
}

function OrderProductEditors({ products, cartItems, onAdd, onPriceChange, onNameChange, onCreate, onRemove }: { products: ProductOption[]; cartItems: OrderItem[]; onAdd: (product: ProductOption) => void; onPriceChange: (name: string, price: number) => void; onNameChange: (name: string, nextName: string) => void; onCreate: (name: string, price: number, stock: number) => void; onRemove: (name: string) => void }) {
  const [slot, setSlot] = useState<HTMLElement | null>(null);
  const [draftNames, setDraftNames] = useState<Record<string, string>>({});
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [newPrice, setNewPrice] = useState(0);
  const [newStock, setNewStock] = useState(1);
  useEffect(() => {
    const frame = requestAnimationFrame(() => setSlot(document.querySelector<HTMLElement>(".product-options")));
    return () => cancelAnimationFrame(frame);
  }, []);
  if (!slot) return null;
  return createPortal(<div className="order-product-editors"><button type="button" className="add-specific-product" onClick={() => setCreating((visible) => !visible)}>+ Agregar producto específico</button>{creating && <form className="specific-product-form" onSubmit={(event) => { event.preventDefault(); if (!newName.trim() || newPrice < 0 || newStock < 1) return; onCreate(newName.trim(), newPrice, newStock); setNewName(""); setNewPrice(0); setNewStock(1); setCreating(false); }}><input required placeholder="Nombre del producto" value={newName} onChange={(event) => setNewName(event.target.value)} /><input required type="number" min="0" placeholder="Precio" value={newPrice || ""} onChange={(event) => setNewPrice(Number(event.target.value))} /><input required type="number" min="1" placeholder="Stock" value={newStock} onChange={(event) => setNewStock(Number(event.target.value))} /><button type="submit">Agregar</button></form>}{products.map((item) => { const selected = cartItems.find((cartItem) => cartItem.product === item.name); return <div className={`order-product-editor ${selected ? "added" : ""}`} key={item.name}><button type="button" className="remove-product" aria-label={`Dejar de vender ${item.name}`} onClick={() => onRemove(item.name)}>×</button><input aria-label={`Nombre de ${item.name}`} value={draftNames[item.name] ?? item.name} onChange={(event) => setDraftNames((names) => ({ ...names, [item.name]: event.target.value }))} onBlur={() => onNameChange(item.name, draftNames[item.name] ?? item.name)} /><div><span>$</span><input aria-label={`Precio de ${item.name}`} type="number" min="0" value={item.price} onChange={(event) => onPriceChange(item.name, Number(event.target.value))} /><button type="button" aria-label={`Agregar ${item.name}`} disabled={!item.unlimited && item.stock <= 0} onClick={() => onAdd(item)}>{selected ? `✓ ${selected.quantity}` : "+"}</button></div></div>; })}</div>, slot);
}

function MonthlyCloseControl({ closures, onClose }: { closures: MonthlyClosure[]; onClose: () => void }) {
  const [header, setHeader] = useState<HTMLElement | null>(null);
  const [reports, setReports] = useState<HTMLElement | null>(null);
  useEffect(() => {
    const frame = requestAnimationFrame(() => { setHeader(document.querySelector<HTMLElement>(".admin-heading")); setReports(document.querySelector<HTMLElement>(".reports-section")); });
    return () => cancelAnimationFrame(frame);
  }, []);
  return <>{header && createPortal(<button className="monthly-close-button" type="button" onClick={onClose}>Cerrar mes · día 5</button>, header)}{reports && closures.length > 0 && createPortal(<div className="monthly-closures"><p className="section-kicker">HISTORIAL</p><h3>Cierres mensuales</h3>{closures.map((closure) => <div key={closure.id}><b>{closure.period}</b><span>{closure.orders.length} pedidos · {money(closure.orders.reduce((sum, order) => sum + order.total, 0))}</span></div>)}</div>, reports)}</>;
}

export function App() {
  const [orders, setOrders] = useState(() => loadSaved<Order[]>("agua-clara-orders", initialOrders));
  const [clientList, setClientList] = useState(() => loadSaved<Client[]>("agua-clara-clients", clients));
  const [activeSection, setActiveSection] = useState(() => pageForPath(window.location.pathname));
  const [clientSearch, setClientSearch] = useState("");
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const [address, setAddress] = useState("");
  const [comuna, setComuna] = useState("");
  const [phone, setPhone] = useState("");
  const [newClient, setNewClient] = useState<Client>({ name: "", phone: "", address: "", comuna: "" });
  const [clientFilter, setClientFilter] = useState("");
  const [inventory, setInventory] = useState(() => ensureInventoryOnlyProducts(removeDiscontinuedProducts(loadSaved<InventoryItem[]>("agua-clara-inventory", initialInventory))));
  const products = inventory.filter((item) => item.category === "Productos" && item.availableForSale !== false).map((item) => ({ name: item.name, price: item.price ?? defaultProducts.find((product) => product.name === item.name)?.price ?? 0, stock: item.stock, unlimited: isUnlimitedProduct(item.name) }));
  const [newItem, setNewItem] = useState({ name: "", category: "Insumos", stock: "", unit: "unidades", minimum: "" });
  const [driverLocation, setDriverLocation] = useState<DriverLocation>(() => loadSaved<DriverLocation>("agua-clara-driver-location", null));
  const [sharedLoaded, setSharedLoaded] = useState(false);
  const [deliveryAlerts, setDeliveryAlerts] = useState<DeliveryAlert[]>([]);
  const [showAlerts, setShowAlerts] = useState(false);
  const previousOrders = useRef<Order[] | null>(null);
  const locationWatch = useRef<number | null>(null);
  const [product, setProduct] = useState(products[0]?.name ?? "");
  const [quantity, setQuantity] = useState(1);
  const [cartItems, setCartItems] = useState<OrderItem[]>([]);
  const [payment, setPayment] = useState<PaymentMethod>("Efectivo");
  const [note, setNote] = useState("");
  const [expense, setExpense] = useState(0);
  const [expenseName, setExpenseName] = useState("");
  const [expenses, setExpenses] = useState(() => loadSaved("agua-clara-expenses", [{ name: "Combustible", value: 18000 }, { name: "Estacionamiento", value: 2500 }]));
  const [monthlyClosures, setMonthlyClosures] = useState<MonthlyClosure[]>(() => loadSaved("agua-clara-monthly-closures", []));

  useEffect(() => { localStorage.setItem("agua-clara-orders", JSON.stringify(orders)); }, [orders]);
  useEffect(() => { localStorage.setItem("agua-clara-clients", JSON.stringify(clientList)); }, [clientList]);
  useEffect(() => { localStorage.setItem("agua-clara-expenses", JSON.stringify(expenses)); }, [expenses]);
  useEffect(() => { localStorage.setItem("agua-clara-inventory", JSON.stringify(inventory)); }, [inventory]);
  useEffect(() => { localStorage.setItem("agua-clara-driver-location", JSON.stringify(driverLocation)); }, [driverLocation]);
  useEffect(() => { localStorage.setItem("agua-clara-monthly-closures", JSON.stringify(monthlyClosures)); }, [monthlyClosures]);
  useEffect(() => { const onPopState = () => setActiveSection(pageForPath(window.location.pathname)); window.addEventListener("popstate", onPopState); return () => window.removeEventListener("popstate", onPopState); }, []);
  useEffect(() => {
    const applyState = (state: SharedWaterState | null) => {
      if (!state) return;
      setOrders((current) => JSON.stringify(current) === JSON.stringify(state.orders) ? current : state.orders);
      setClientList((current) => JSON.stringify(current) === JSON.stringify(state.clients) ? current : state.clients);
       const cleanedInventory = ensureInventoryOnlyProducts(removeDiscontinuedProducts(state.inventory));
       setInventory((current) => JSON.stringify(current) === JSON.stringify(cleanedInventory) ? current : cleanedInventory);
      setExpenses((current) => JSON.stringify(current) === JSON.stringify(state.expenses) ? current : state.expenses);
       setDriverLocation((current) => JSON.stringify(current) === JSON.stringify(state.driverLocation) ? current : state.driverLocation);
       setMonthlyClosures((current) => JSON.stringify(current) === JSON.stringify(state.monthlyClosures ?? []) ? current : state.monthlyClosures ?? []);
    };
    const loadState = async () => { try { const response = await fetch("/api/water/state"); if (response.ok) applyState(await response.json() as SharedWaterState | null); } finally { setSharedLoaded(true); } };
    void loadState();
    const interval = window.setInterval(() => { void fetch("/api/water/state").then((response) => response.ok ? response.json() : null).then(applyState).catch(() => undefined); }, 5000);
    return () => window.clearInterval(interval);
  }, []);
  useEffect(() => {
    if (activeSection !== "Repartidor" || !navigator.geolocation) return;
    const updateLocation = (position: GeolocationPosition) => setDriverLocation({ latitude: position.coords.latitude, longitude: position.coords.longitude, updatedAt: new Date().toISOString() });
    locationWatch.current = navigator.geolocation.watchPosition(updateLocation, undefined, { enableHighAccuracy: true, maximumAge: 5000, timeout: 20000 });
    return () => { if (locationWatch.current !== null) { navigator.geolocation.clearWatch(locationWatch.current); locationWatch.current = null; } };
  }, [activeSection]);
  useEffect(() => {
    const headerDate = document.querySelector<HTMLElement>(".date-line");
    if (headerDate) headerDate.textContent = currentDateLong();
    const reportButton = document.querySelector<HTMLElement>(".admin-heading .outline-button");
    if (reportButton) Array.from(reportButton.childNodes).filter((node) => node.nodeType === Node.TEXT_NODE).forEach((node) => { node.textContent = ` ${currentDateShort()} `; });
  }, [activeSection]);
  useEffect(() => {
    if (!sharedLoaded) return;
     const state: SharedWaterState = { orders, clients: clientList, inventory, expenses, driverLocation, monthlyClosures };
    const timeout = window.setTimeout(() => { void fetch("/api/water/state", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(state) }).catch(() => undefined); }, 400);
    return () => window.clearTimeout(timeout);
   }, [orders, clientList, inventory, expenses, driverLocation, monthlyClosures, sharedLoaded]);
  useEffect(() => {
    const previous = previousOrders.current;
    previousOrders.current = orders;
    if (!sharedLoaded || !previous || activeSection === "Repartidor") return;
    const updates = orders.flatMap((order) => {
      const oldOrder = previous.find((item) => item.id === order.id);
      return oldOrder && oldOrder.status !== order.status ? [`${order.client}: ${order.status === "En ruta" ? "el repartidor inició la entrega" : "pedido entregado"}.`] : [];
    });
    if (!updates.length) return;
    const alert = { id: Date.now(), message: updates[0], createdAt: new Date().toISOString() };
    setDeliveryAlerts((items) => [alert, ...items].slice(0, 5));
    if ("Notification" in window && Notification.permission === "granted") new Notification("De la Roca", { body: alert.message });
  }, [orders, sharedLoaded, activeSection]);
  useEffect(() => {
    document.querySelector<HTMLIFrameElement>(".driver-map iframe")?.setAttribute("allowfullscreen", "true");
  }, [activeSection, driverLocation]);
  useEffect(() => {
    document.querySelectorAll<HTMLElement>(".rider-products span, .route-content .order-products span").forEach((item) => { item.style.color = "#000"; item.style.fontWeight = "800"; });
  }, [activeSection, orders]);

  const currentProduct = products.find((item) => item.name === product)!;
  const draftTotal = currentProduct.price * quantity;
  const cartTotal = cartItems.reduce((total, item) => total + item.quantity * item.unitPrice, 0);
  const delivered = orders.filter((order) => order.status === "Entregado");
  const totals = (method: PaymentMethod) => delivered.filter((order) => order.payment === method).reduce((sum, order) => sum + order.total, 0);
  const salesTotal = delivered.reduce((sum, order) => sum + order.total, 0);
  const expensesTotal = expenses.reduce((sum, item) => sum + item.value, 0);
  const nextStop = orders.find((order) => order.status !== "Entregado");

  function selectClient(client: Client) { setSelectedClient(client); setClientSearch(client.name); setAddress(client.address); setComuna(client.comuna); setPhone(client.phone); }
  function addOrder(event: FormEvent) {
    event.preventDefault();
    if (!clientSearch.trim() || !address.trim() || !comuna.trim() || !phone.trim()) return;
    const client = { name: clientSearch.trim(), phone: phone.trim(), address: address.trim(), comuna: comuna.trim() };
    const items = cartItems.length ? cartItems : [{ product, quantity, unitPrice: currentProduct.price }];
    const total = items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);
    if (!clientList.some((item) => item.phone === client.phone)) setClientList((items) => [client, ...items]);
    setOrders((previous) => [{ id: Math.max(...previous.map((order) => order.id)) + 1, client: client.name, phone: client.phone, address: client.address, comuna: client.comuna, product: items[0].product, quantity: items.reduce((sum, item) => sum + item.quantity, 0), total, items, payment, status: "Nuevo", time: "Pendiente", note }, ...previous]);
    setNote(""); setQuantity(1); setCartItems([]); setClientSearch(""); setSelectedClient(null); setAddress(""); setComuna(""); setPhone("");
  }
   function addProductToCart(itemToAdd: ProductOption = currentProduct, amount = quantity) { const inventoryItem = inventory.find((item) => item.name === itemToAdd.name); const existingQuantity = cartItems.find((item) => item.product === itemToAdd.name)?.quantity ?? 0; if (inventoryItem && !isUnlimitedProduct(inventoryItem.name) && existingQuantity + amount > inventoryItem.stock) return; setCartItems((items) => { const existing = items.find((item) => item.product === itemToAdd.name); return existing ? items.map((item) => item.product === itemToAdd.name ? { ...item, quantity: item.quantity + amount } : item) : [...items, { product: itemToAdd.name, quantity: amount, unitPrice: itemToAdd.price }]; }); setQuantity(1); }
  function removeCartItem(productName: string) { setCartItems((items) => items.filter((item) => item.product !== productName)); }
  function changeCartQuantity(productName: string, change: number) { setCartItems((items) => items.flatMap((item) => item.product !== productName ? [item] : item.quantity + change > 0 ? [{ ...item, quantity: item.quantity + change }] : [])); }
  function shareDriverLocation() {
    if (!navigator.geolocation) return;
    if (locationWatch.current !== null) navigator.geolocation.clearWatch(locationWatch.current);
    const updateLocation = (position: GeolocationPosition) => setDriverLocation({ latitude: position.coords.latitude, longitude: position.coords.longitude, updatedAt: new Date().toISOString() });
    locationWatch.current = navigator.geolocation.watchPosition(updateLocation, undefined, { enableHighAccuracy: true, maximumAge: 15000, timeout: 20000 });
  }
  async function enableAlerts() {
    setShowAlerts((visible) => !visible);
    if ("Notification" in window && Notification.permission === "default") await Notification.requestPermission();
  }
  function expandDriverMap() { void document.querySelector<HTMLElement>(".live-route-map")?.requestFullscreen?.(); }
   function addExpense(event: FormEvent) {
    event.preventDefault();
    if (!expenseName || expense <= 0) return;
    setExpenses((items) => [...items, { name: expenseName, value: expense }]); setExpenseName(""); setExpense(0);
   }
   function closeMonthlyPeriod() {
     const now = new Date();
     const periodDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
     const period = new Intl.DateTimeFormat("es-CL", { month: "long", year: "numeric" }).format(periodDate);
     if (monthlyClosures.some((closure) => closure.period === period)) return;
     if (!window.confirm(`¿Cerrar definitivamente ${period}? Se archivarán sus pedidos y gastos.`)) return;
     setMonthlyClosures((closures) => [...closures, { id: `${period}-${Date.now()}`, period, closedAt: now.toISOString(), orders, expenses }]);
     setOrders([]); setExpenses([]); setDriverLocation(null);
   }
  function addClient(event: FormEvent) {
    event.preventDefault();
    if (!newClient.name.trim() || !newClient.phone.trim() || !newClient.address.trim() || !newClient.comuna.trim()) return;
    setClientList((items) => {
      const withoutSamePhone = items.filter((item) => item.phone !== newClient.phone.trim());
      return [{ name: newClient.name.trim(), phone: newClient.phone.trim(), address: newClient.address.trim(), comuna: newClient.comuna.trim() }, ...withoutSamePhone];
    });
    setNewClient({ name: "", phone: "", address: "", comuna: "" });
  }
  function addInventoryItem(event: FormEvent) {
    event.preventDefault();
    if (!newItem.name.trim() || !newItem.stock || !newItem.minimum) return;
    setInventory((items) => [{ id: `${newItem.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${Date.now()}`, name: newItem.name.trim(), category: newItem.category, stock: Number(newItem.stock), unit: newItem.unit.trim() || "unidades", minimum: Number(newItem.minimum), price: 0 }, ...items]);
    setNewItem({ name: "", category: "Insumos", stock: "", unit: "unidades", minimum: "" });
  }
   function adjustInventory(id: string, change: number) { setInventory((items) => items.map((item) => item.id === id && !isUnlimitedProduct(item.name) ? { ...item, stock: Math.max(0, item.stock + change) } : item)); }
   function updateInventoryQuantity(id: string, stock: number) { setInventory((items) => items.map((item) => item.id === id ? { ...item, stock: Math.max(0, stock) } : item)); }
   function updateProductPrice(id: string, price: number) { setInventory((items) => items.map((item) => item.id === id ? { ...item, price: Math.max(0, price) } : item)); }
   function updateOrderProductPrice(name: string, price: number) { const item = inventory.find((productItem) => productItem.name === name); if (item) updateProductPrice(item.id, price); }
   function updateProductName(name: string, nextName: string) { const trimmedName = nextName.trim(); if (!trimmedName) return; if (isUnlimitedProduct(name)) { unlimitedProducts.delete(name); unlimitedProducts.add(trimmedName); } setInventory((items) => items.map((item) => item.name === name ? { ...item, name: trimmedName } : item)); setProduct((current) => current === name ? trimmedName : current); setCartItems((items) => items.map((item) => item.product === name ? { ...item, product: trimmedName } : item)); }
   function addSpecificProduct(name: string, price: number, stock: number) { setInventory((items) => [...items, { id: `${name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${Date.now()}`, name, category: "Productos", stock, unit: "unidades", minimum: 0, price, availableForSale: true }]); }
   function removeProductFromSale(name: string) { if (!window.confirm(`¿Dejar de vender ${name}?`)) return; const nextProduct = products.find((item) => item.name !== name); setInventory((items) => items.map((item) => item.name === name ? { ...item, availableForSale: false } : item)); setCartItems((items) => items.filter((item) => item.product !== name)); setProduct((current) => current === name ? nextProduct?.name ?? "" : current); }
  function advanceOrder(id: number) {
    const order = orders.find((item) => item.id === id);
    if (order?.status === "En ruta" && !window.confirm(`Confirmar entrega de ${order.client}?`)) return;
     if (order?.status === "En ruta") setInventory((stock) => stock.map((item) => { const deliveredItem = getOrderItems(order).find((orderItem) => orderItem.product === item.name); return deliveredItem && !isUnlimitedProduct(item.name) ? { ...item, stock: Math.max(0, item.stock - deliveredItem.quantity) } : item; }));
    setOrders((items) => items.map((order) => order.id !== id ? order : { ...order, status: order.status === "Nuevo" ? "En ruta" : order.status === "En ruta" ? "Entregado" : "Entregado" }));
  }
  function updateOrderPayment(id: number, payment: PaymentMethod) { setOrders((items) => items.map((order) => order.id === id ? { ...order, payment } : order)); }
  function goTo(section: string) { const path = pagePaths[section]; if (path && window.location.pathname !== path) window.history.pushState({}, "", path); setActiveSection(section); window.scrollTo({ top: 0, behavior: "smooth" }); }

  const navItems = [["grid", "Resumen"], ["calendar", "Pedidos"], ["users", "Clientes"], ["box", "Inventario"], ["truck", "Reparto"], ["chart", "Reportes"]];
  const visibleClients = clientSearch ? clientList.filter((client) => `${client.name} ${client.phone}`.toLowerCase().includes(clientSearch.toLowerCase()) && client.name !== selectedClient?.name) : [];

  return <div className={`water-app ${activeSection === "Repartidor" ? "rider-mode" : ""}`}>
    <aside className="sidebar">
      <a className="water-brand" href="#top" onClick={() => goTo("Resumen")}><span className="drop-mark">&#9670;</span><span>DE LA<br /><b>ROCA</b></span></a>
      <nav className="main-menu">{navItems.map(([icon, label]) => <button key={label} className={activeSection === label ? "active" : ""} onClick={() => goTo(label)}><Icon name={icon} /><span>{label}</span>{label === "Pedidos" && <b className="menu-count">{orders.filter((order) => order.status === "Nuevo").length}</b>}</button>)}</nav>
      <div className="sidebar-bottom"><button><Icon name="settings" /><span>Configuración</span></button><div className="user-card"><div className="avatar">CM</div><div><strong>Carolina Muñoz</strong><small>Administradora</small></div><Icon name="chevron" size={16} /></div></div>
    </aside>

    <main className="workspace" id="top">
      <header className="top-header"><div><p className="date-line">MARTES, 25 DE AGOSTO</p><h1>{activeSection === "Resumen" ? "Buenos días, Carolina" : activeSection}</h1></div><div className="header-tools"><div className="alert-control"><button className="notification" aria-label="Notificaciones de reparto" onClick={() => void enableAlerts()}><Icon name="bell" />{deliveryAlerts.length > 0 && <i />}</button>{showAlerts && <div className="delivery-alerts"><b>Actividad de reparto</b>{deliveryAlerts.length ? deliveryAlerts.map((alert) => <p key={alert.id}>{alert.message}</p>) : <p>Activa las notificaciones y recibirás avisos cuando el repartidor cambie el estado de un pedido.</p>}</div>}</div><button className="new-order" onClick={() => goTo("Pedidos")}><Icon name="plus" /> Nuevo pedido</button></div></header>

      {activeSection === "Repartidor" && <section className="rider-page"><header><div className="rider-brand"><span className="drop-mark">&#9670;</span><span>DE LA <b>ROCA</b></span></div><div><p>RUTA DE HOY</p><h1>Mis entregas</h1></div><button className="share-location" onClick={shareDriverLocation}><Icon name="pin" size={17} /> Compartir ubicación</button></header><div className="rider-status"><i className="online-dot" /> Tu ubicación se actualiza para administración {driverLocation && <span>· Última actualización: {new Date(driverLocation.updatedAt).toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit" })}</span>}</div><div className="rider-orders">{orders.filter((order) => order.status !== "Entregado").map((order, index) => <article key={order.id}><div className="rider-order-head"><span>PARADA {index + 1} · #{order.id}</span><b className={`status ${order.status.toLowerCase().replace(" ", "-")}`}>{order.status}</b></div><h2>{order.client}</h2><a className="rider-address" target="_blank" rel="noreferrer" href={`https://waze.com/ul?q=${encodeURIComponent(`${order.address}, ${order.comuna}, Chile`)}&navigate=yes`}><Icon name="pin" /> <span><b>{order.address}</b>{order.comuna}</span><em>Abrir Waze</em></a><a className="rider-phone" href={`tel:${order.phone.replace(/\s/g, "")}`}><Icon name="phone" /> {order.phone}</a><div className="rider-products">{getOrderItems(order).map((item) => <span key={item.product}>{item.quantity} × {item.product}</span>)}<strong>{money(order.total)}</strong></div>{order.note && <p className="rider-note">Nota: {order.note}</p>}<button className="rider-action" onClick={() => advanceOrder(order.id)}>{order.status === "Nuevo" ? "Iniciar entrega" : "Confirmar entrega"}</button></article>)}</div></section>}

      {activeSection === "Resumen" && <><section className="metric-row"><article><span className="metric-icon blue"><Icon name="receipt" /></span><div><small>PEDIDOS DE HOY</small><strong>{orders.length}</strong><em>+3 desde ayer</em></div></article><article><span className="metric-icon yellow"><Icon name="truck" /></span><div><small>EN REPARTO</small><strong>{orders.filter((order) => order.status === "En ruta").length}</strong><em>1 por asignar</em></div></article><article><span className="metric-icon green"><Icon name="wallet" /></span><div><small>VENTA DEL DÍA</small><strong>{money(salesTotal)}</strong><em>Pedidos entregados</em></div></article></section><section className="summary-grid"><article className="panel"><p className="section-kicker">PRÓXIMAS ENTREGAS</p><h2>Pedidos pendientes</h2>{orders.filter((order) => order.status !== "Entregado").slice(0, 3).map((order) => <button className="summary-order" key={order.id} onClick={() => goTo("Reparto")}><span>{order.time}</span><b>{order.client}</b><small>{order.comuna} · {money(order.total)}</small></button>)}</article><article className="panel"><p className="section-kicker">CAJA DEL DÍA</p><h2>Resumen rápido</h2><div className="summary-money"><span>Ventas entregadas</span><b>{money(salesTotal)}</b><span>Gastos registrados</span><b className="expense-number">− {money(expensesTotal)}</b><strong>Neto del día <em>{money(salesTotal - expensesTotal)}</em></strong></div><button className="text-button summary-link" onClick={() => goTo("Reportes")}>Ver cierre y reportes</button></article></section></>}

      {activeSection === "Clientes" && <section className="clients-page"><div className="clients-intro"><div><p className="section-kicker">AGENDA DE CONTACTOS</p><h2>Clientes</h2><p>Guarda los datos una vez y selecciónalos al crear cada pedido.</p></div><span>{clientList.length} clientes registrados</span></div><div className="clients-grid"><form className="panel client-form" onSubmit={addClient}><h3>Agregar cliente</h3><label className="form-label">Nombre o negocio <span>*</span><input value={newClient.name} onChange={(event) => setNewClient((client) => ({ ...client, name: event.target.value }))} placeholder="Ej: Ana Pérez" /></label><label className="form-label">Teléfono <span>*</span><input value={newClient.phone} onChange={(event) => setNewClient((client) => ({ ...client, phone: event.target.value }))} placeholder="+56 9 0000 0000" /></label><label className="form-label">Dirección <span>*</span><input value={newClient.address} onChange={(event) => setNewClient((client) => ({ ...client, address: event.target.value }))} placeholder="Calle y número" /></label><label className="form-label">Comuna <span>*</span><input value={newClient.comuna} onChange={(event) => setNewClient((client) => ({ ...client, comuna: event.target.value }))} placeholder="Ej: Ñuñoa" /></label><button className="submit-order" disabled={!newClient.name || !newClient.phone || !newClient.address || !newClient.comuna}><Icon name="plus" /> Guardar cliente</button></form><div className="panel contact-list"><div className="panel-heading"><div><p className="section-kicker">CONTACTOS GUARDADOS</p><h2>Selecciona para pedir</h2></div></div><div className="search-field"><Icon name="search" size={18} /><input value={clientFilter} onChange={(event) => setClientFilter(event.target.value)} placeholder="Buscar por nombre o teléfono" /></div><div className="contact-results">{clientList.filter((client) => `${client.name} ${client.phone} ${client.comuna}`.toLowerCase().includes(clientFilter.toLowerCase())).map((client) => <button key={client.phone} onClick={() => { selectClient(client); goTo("Pedidos"); }}><span className="client-initial">{client.name.charAt(0)}</span><span><b>{client.name}</b><small>{client.phone}</small><small><Icon name="pin" size={12} /> {client.address}, {client.comuna}</small></span><span className="select-contact">Usar en pedido</span></button>)}</div></div></div></section>}

      {activeSection === "Inventario" && <section className="inventory-page"><div className="clients-intro"><div><p className="section-kicker">ADMINISTRACIÓN DE BODEGA</p><h2>Inventario de insumos</h2><p>Controla productos e insumos necesarios para el reparto.</p></div><span>{inventory.filter((item) => item.stock <= item.minimum).length} con stock bajo</span></div><div className="inventory-grid"><div className="inventory-list">{inventory.map((item) => <article className={`inventory-item ${item.stock <= item.minimum ? "low-stock" : ""}`} key={item.id}><span className="inventory-icon"><Icon name="box" /></span><div><small>{item.category}</small><h3>{item.name}</h3><p>Mínimo: {item.minimum} {item.unit}</p></div><div className="inventory-quantity"><strong>{item.stock}</strong><span>{item.unit}</span></div><div className="stock-actions"><button onClick={() => adjustInventory(item.id, -1)}>−</button><button onClick={() => adjustInventory(item.id, 1)}>+</button></div></article>)}</div><form className="panel inventory-form" onSubmit={addInventoryItem}><h3>Agregar insumo</h3><label className="form-label">Nombre <span>*</span><input value={newItem.name} onChange={(event) => setNewItem((item) => ({ ...item, name: event.target.value }))} placeholder="Ej: Etiquetas" /></label><label className="form-label">Tipo <select value={newItem.category} onChange={(event) => setNewItem((item) => ({ ...item, category: event.target.value }))}><option>Insumos</option><option>Productos</option></select></label><div className="field-grid"><label className="form-label">Stock inicial <span>*</span><input type="number" value={newItem.stock} onChange={(event) => setNewItem((item) => ({ ...item, stock: event.target.value }))} /></label><label className="form-label">Stock mínimo <span>*</span><input type="number" value={newItem.minimum} onChange={(event) => setNewItem((item) => ({ ...item, minimum: event.target.value }))} /></label></div><label className="form-label">Unidad <input value={newItem.unit} onChange={(event) => setNewItem((item) => ({ ...item, unit: event.target.value }))} placeholder="unidades" /></label><button className="submit-order" disabled={!newItem.name || !newItem.stock || !newItem.minimum}><Icon name="plus" /> Guardar insumo</button></form></div></section>}

      {(activeSection === "Pedidos" || activeSection === "Reparto") && <div className="page-layout">
        {activeSection === "Pedidos" && <section className="panel schedule-panel" id="new-order"><div className="panel-heading"><div><p className="section-kicker">AGENDA</p><h2>Nuevo pedido</h2></div><span className="required">* Campos obligatorios</span></div>
          <form onSubmit={addOrder}>
            <label className="form-label">Buscar cliente <span>*</span><div className="search-field"><Icon name="search" size={18} /><input value={clientSearch} onChange={(event) => { setClientSearch(event.target.value); setSelectedClient(null); }} placeholder="Nombre o teléfono del cliente" /></div></label>
            {visibleClients.length > 0 && <div className="client-results">{visibleClients.map((client) => <button type="button" key={client.phone} onClick={() => selectClient(client)}><span className="client-initial">{client.name.charAt(0)}</span><span><b>{client.name}</b><small>{client.phone} · {client.comuna}</small></span></button>)}</div>}
            {selectedClient && <div className="selected-client"><span className="client-initial">{selectedClient.name.charAt(0)}</span><div><b>{selectedClient.name}</b><small><Icon name="pin" size={13} /> Contacto seleccionado</small></div><button type="button" onClick={() => { setSelectedClient(null); setClientSearch(""); setAddress(""); setComuna(""); setPhone(""); }}>Cambiar</button></div>}
            <div className="address-grid"><label className="form-label">Dirección <span>*</span><input value={address} onChange={(event) => setAddress(event.target.value)} placeholder="Calle y número" /></label><label className="form-label">Comuna <span>*</span><input value={comuna} onChange={(event) => setComuna(event.target.value)} placeholder="Ej: La Florida" /></label><label className="form-label">Teléfono <span>*</span><input value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="+56 9 0000 0000" /></label></div>
            <div className="product-picker"><div><b>Productos disponibles</b><span>Pulsa + para agregar varios al pedido</span></div><div className="product-options">{products.map((item) => <button type="button" key={item.name} onClick={() => addProductToCart(item, 1)}><span><b>{item.name}</b><small>{money(item.price)}</small></span><i><Icon name="plus" size={15} /></i></button>)}</div></div>
            <div className="order-cart"><div><b>Productos del pedido</b><span>{cartItems.length} artículos</span></div>{cartItems.length === 0 ? <p className="empty-cart">Selecciona uno o más productos de la lista.</p> : cartItems.map((item) => <div className="cart-row" key={item.product}><span>{item.product}</span><div className="cart-quantity"><button type="button" onClick={() => changeCartQuantity(item.product, -1)}>−</button><b>{item.quantity}</b><button type="button" onClick={() => changeCartQuantity(item.product, 1)}>+</button></div><b>{money(item.quantity * item.unitPrice)}</b><button type="button" aria-label={`Quitar ${item.product}`} onClick={() => removeCartItem(item.product)}>×</button></div>)}</div>
            <div className="field-grid"><label className="form-label">Método de pago <span>*</span><select value={payment} onChange={(event) => setPayment(event.target.value as PaymentMethod)}><option>Efectivo</option><option>Transferencia</option><option>Tarjeta</option></select></label><label className="form-label">Total <div className="total-field">{money(cartItems.length ? cartTotal : draftTotal)}</div></label></div>
            <label className="form-label">Nota para el repartidor <textarea value={note} onChange={(event) => setNote(event.target.value)} placeholder="Ej: llamar al llegar, portón verde..." /></label>
            <button className="submit-order" disabled={!clientSearch.trim() || !address.trim() || !comuna.trim() || !phone.trim() || !cartItems.length}><Icon name="plus" /> Agendar pedido</button>
          </form>
        </section>}

        {activeSection === "Reparto" && <><LiveRouteMap driverLocation={driverLocation} nextStop={nextStop} /><DeliveryProgress order={nextStop} /></>}

        {activeSection === "Reparto" && <button className="full-map-button" onClick={expandDriverMap}><Icon name="pin" size={16} /> Ver mapa grande</button>}

        {activeSection === "Reparto" && <section className="route-landmarks"><div><p className="section-kicker">PUNTOS DE LA RUTA</p><h2>Seguimiento del reparto</h2></div><div className="route-landmark-list"><a className="route-landmark depot" target="_blank" rel="noreferrer" href={`https://www.google.com/maps?q=${depot.latitude},${depot.longitude}`}><span><Icon name="home" size={19} /></span><div><small>ORIGEN</small><b>{depot.name}</b><em>{depot.address}</em></div></a><i className="route-connector" /><div className="route-landmark driver-marker"><span><Icon name="motorbike" size={21} /></span><div><small>REPARTIDOR EN VIVO</small><b>José Ramírez · Moto 02</b><em>{driverLocation ? `GPS actualizado ${new Date(driverLocation.updatedAt).toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit" })}` : "Esperando ubicación GPS"}</em></div></div><i className="route-connector" /><div className="route-landmark destination"><span><Icon name="pin" size={20} /></span><div><small>PRÓXIMA ENTREGA</small><b>{nextStop?.client ?? "Sin entregas pendientes"}</b><em>{nextStop ? `${nextStop.address}, ${nextStop.comuna}` : ""}</em></div></div></div></section>}

        {activeSection === "Reparto" && <section className="panel route-panel" id="reparto"><div className="panel-heading"><div><p className="section-kicker">EN VIVO <span className="live-dot" /></p><h2>Reparto de hoy</h2></div><a className="text-button" target="_blank" rel="noreferrer" href="/repartidor">Abrir anexo repartidor</a></div><div className="driver"><div className="driver-photo">JR</div><div><b>José Ramírez</b><small><i className="online-dot" /> En ruta · Camioneta 02</small></div><a href="tel:+56987654312"><Icon name="phone" size={17} /></a></div>{driverLocation ? <><a className="driver-location" target="_blank" rel="noreferrer" href={`https://www.google.com/maps?q=${driverLocation.latitude},${driverLocation.longitude}`}><Icon name="pin" size={15} /> Ubicación actualizada · {new Date(driverLocation.updatedAt).toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit" })}</a><div className="driver-map"><iframe title="Ubicación actual del repartidor" src={`https://www.google.com/maps?q=${driverLocation.latitude},${driverLocation.longitude}&z=15&output=embed`} /></div></> : <div className="location-pending"><Icon name="pin" size={15} /> Esperando que el repartidor comparta su ubicación.</div>}<div className="route-list">{orders.filter((order) => order.status !== "Entregado").map((order, index) => <article className="route-stop" key={order.id}><span className="route-line"><i>{index + 1}</i></span><div className="route-content"><div><small>{order.time} · #{order.id}</small><span className={`status ${order.status.toLowerCase().replace(" ", "-")}`}>{order.status}</span></div><b>{order.client}</b><p><Icon name="pin" size={14} /> {order.address}, {order.comuna}</p><a className="route-phone" href={`tel:${order.phone.replace(/\s/g, "")}`}><Icon name="phone" size={14} /> {order.phone}</a><div className="order-detail"><span className="order-products">{getOrderItems(order).map((item) => <span key={item.product}>{item.quantity} × {item.product}</span>)}</span><strong>{money(order.total)}</strong></div>{order.note && <div className="order-note">“{order.note}”</div>}<button className="advance-button" onClick={() => advanceOrder(order.id)}>{order.status === "Nuevo" ? "Enviar a reparto" : "Confirmar entrega"}</button></div></article>)}</div></section>}
      </div>}

      {activeSection === "Reportes" && <><section className="admin-section"><div className="admin-heading"><div><p className="section-kicker">ADMINISTRACIÓN PRIVADA</p><h2>Cierre de caja · Hoy</h2></div><button className="outline-button"><Icon name="calendar" size={17} /> 25 ago. 2026 <Icon name="chevron" size={15} /></button></div><div className="cash-grid"><article className="cash-card"><div><span className="payment-symbol cash">$</span><small>EFECTIVO RECIBIDO</small></div><strong>{money(totals("Efectivo"))}</strong><p>{delivered.filter((order) => order.payment === "Efectivo").length} pedidos entregados</p></article><article className="cash-card"><div><span className="payment-symbol transfer">↗</span><small>TRANSFERENCIAS</small></div><strong>{money(totals("Transferencia"))}</strong><p>{delivered.filter((order) => order.payment === "Transferencia").length} pedidos entregados</p></article><article className="cash-card"><div><span className="payment-symbol card">▣</span><small>TARJETA</small></div><strong>{money(totals("Tarjeta"))}</strong><p>{delivered.filter((order) => order.payment === "Tarjeta").length} pedidos entregados</p></article><article className="cash-card total-card"><small>TOTAL VENTAS</small><strong>{money(salesTotal)}</strong><p>Solo pedidos entregados</p></article></div>
        <div className="admin-orders"><h3>Pedidos registrados</h3><div className="table-wrap"><table><thead><tr><th>Cliente</th><th>Producto</th><th>Cant.</th><th>Precio</th><th>Total</th><th>Pago</th><th>Estado</th></tr></thead><tbody>{orders.map((order) => <tr key={order.id}><td><b>{order.client}</b><small>{order.phone}</small></td><td>{getOrderItems(order).map((item) => <small className="table-product" key={item.product}>{item.product}</small>)}</td><td>{getOrderItems(order).map((item) => <small className="table-product" key={item.product}>{item.quantity}</small>)}</td><td>{getOrderItems(order).map((item) => <small className="table-product" key={item.product}>{money(item.unitPrice)}</small>)}</td><td><b>{money(order.total)}</b></td><td>{order.payment}</td><td><span className={`status ${order.status.toLowerCase().replace(" ", "-")}`}>{order.status}</span></td></tr>)}</tbody></table></div></div>
        <div className="expenses-box"><div className="expense-header"><div><h3>Gastos del día</h3><p>Registra los egresos para obtener el cierre real.</p></div><strong>{money(expensesTotal)}</strong></div><div className="expense-items">{expenses.map((item, index) => <div key={`${item.name}-${index}`}><span>{item.name}</span><b>− {money(item.value)}</b><button type="button" aria-label={`Eliminar ${item.name}`} onClick={() => setExpenses((items) => items.filter((_, itemIndex) => itemIndex !== index))}>×</button></div>)}</div><form className="expense-form" onSubmit={addExpense}><input value={expenseName} onChange={(event) => setExpenseName(event.target.value)} placeholder="Ej: Compra de hielo" /><input value={expense || ""} onChange={(event) => setExpense(Number(event.target.value))} type="number" placeholder="Monto" /><button type="submit"><Icon name="plus" size={16} /> Agregar gasto</button></form><div className="net-total"><span>Total después de gastos</span><strong>{money(salesTotal - expensesTotal)}</strong></div></div>
      </section>
      <section className="reports-section"><div><p className="section-kicker">REPORTES</p><h2>Resumen de operación</h2><p>Controla el estado de los pedidos y la forma de pago del día.</p></div><div className="report-grid"><article><small>PEDIDOS NUEVOS</small><strong>{orders.filter((order) => order.status === "Nuevo").length}</strong></article><article><small>EN RUTA</small><strong>{orders.filter((order) => order.status === "En ruta").length}</strong></article><article><small>ENTREGADOS</small><strong>{delivered.length}</strong></article><article><small>TICKET PROMEDIO</small><strong>{money(orders.length ? orders.reduce((total, order) => total + order.total, 0) / orders.length : 0)}</strong></article></div></section></>}
     </main>
     {activeSection === "Inventario" && <InventoryEditors inventory={inventory} onChange={updateInventoryQuantity} />}
     {activeSection === "Pedidos" && <OrderProductEditors products={products} cartItems={cartItems} onAdd={addProductToCart} onPriceChange={updateOrderProductPrice} onNameChange={updateProductName} onCreate={addSpecificProduct} onRemove={removeProductFromSale} />}
     {activeSection === "Reportes" && <MonthlyCloseControl closures={monthlyClosures} onClose={closeMonthlyPeriod} />}
     {activeSection === "Repartidor" && <section className="rider-live-map"><LiveRouteMap driverLocation={driverLocation} nextStop={nextStop} /></section>}
     {activeSection === "Repartidor" && <RiderPaymentsInCards orders={orders} onChange={updateOrderPayment} />}
  </div>;
}
