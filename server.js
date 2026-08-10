const express = require("express");
const path = require("path");
const crypto = require("crypto");
const { promisify } = require("util");
const nodemailer = require("nodemailer");
const { createStorage } = require("./storage");

const app = express();
const port = process.env.PORT || 3000;
const isProduction = process.env.NODE_ENV === "production";
const developmentClientOrigins = new Set([
  "http://localhost:5173",
  "http://127.0.0.1:5173"
]);
const sessionDurationMs = 8 * 60 * 60 * 1000;
const platformCommissionRate = 0.05;
const foundingSellerLimit = 20;
const foundingSellerFreeSales = 3;
const withdrawalFeeRate = 0.01;
const minimumWithdrawalUsdt = 10;
const withdrawalMarginUsdt = 0.5;
const withdrawalNetworkReserveUsdt = 1;
const maximumOrderCents = 1000000;
const depositAddress = process.env.USDT_TRC20_DEPOSIT_ADDRESS || "TDsysQyrtEBhDbLWJZiRdh6PWT8ueHxyzy";
const paypalSandboxBaseUrl = "https://api-m.sandbox.paypal.com";
const paypalSandboxEnabled = Boolean(process.env.PAYPAL_SANDBOX_CLIENT_ID && process.env.PAYPAL_SANDBOX_CLIENT_SECRET);
const paypalSandboxWebhookId = process.env.PAYPAL_SANDBOX_WEBHOOK_ID || "";
const paypalLiveEnabled = process.env.PAYPAL_LIVE_ENABLED === "true" && Boolean(process.env.PAYPAL_LIVE_CLIENT_ID && process.env.PAYPAL_LIVE_CLIENT_SECRET);
const paypalLiveWebhookId = process.env.PAYPAL_LIVE_WEBHOOK_ID || "";
const paypalProcessingFeeRate = Number(process.env.PAYPAL_PROCESSING_FEE_RATE || 0);
const paypalProcessingFeeFixedCents = Number(process.env.PAYPAL_PROCESSING_FEE_FIXED_CENTS || 0);
const minimumPaypalPaymentCents = 500;
const clientBuildPath = path.join(__dirname, "client", "dist");
const storePath = path.join(__dirname, "data", "store.json");
const storage = createStorage({ databaseUrl: process.env.DATABASE_URL, storePath, usePostgres: isProduction && Boolean(process.env.DATABASE_URL) });
const { readStore, writeStore } = storage;
const allowedGames = new Set(["Free Fire", "Roblox", "WoW", "RuneScape", "Lineage 2", "Tibia", "Albion"]);
const allowedOfferTypes = new Set(["Moneda", "Item", "Servicio", "Cuenta", "Boosting", "Recarga"]);
const scrypt = promisify(crypto.scrypt);
const requestLimits = new Map();
let mailTransport = process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASSWORD ? nodemailer.createTransport({ host: process.env.SMTP_HOST, port: Number(process.env.SMTP_PORT || 587), secure: process.env.SMTP_SECURE === "true", requireTLS: process.env.SMTP_SECURE !== "true", auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD } }) : null;
const paypalAccessTokens = new Map();

app.disable("x-powered-by");
app.use((request, response, next) => {
  response.setHeader("Content-Security-Policy", "default-src 'self'; script-src 'self' https://www.googletagmanager.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: https://images.unsplash.com; connect-src 'self' https://www.google-analytics.com https://region1.google-analytics.com; frame-ancestors 'none'; base-uri 'self'; form-action 'self'");
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  response.setHeader("X-Frame-Options", "DENY");
  response.setHeader("Permissions-Policy", "camera=(), geolocation=(), microphone=()");
  if (isProduction) response.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  next();
});
app.use(express.json());
// State files are never served, even if static-file configuration changes later.
app.use("/data", (request, response) => response.status(404).end());
app.get("/smtp-setup.html", (request, response) => sendLocalOnlyFile(request, response, "smtp-setup.html"));
app.get("/smtp-setup.css", (request, response) => sendLocalOnlyFile(request, response, "smtp-setup.css"));
app.get("/smtp-setup.js", (request, response) => sendLocalOnlyFile(request, response, "smtp-setup.js"));
app.use(express.static(clientBuildPath));
app.use("/api", (request, response, next) => {
  if (["GET", "HEAD", "OPTIONS"].includes(request.method)) return next();
  const origin = request.headers.origin;
  if (!origin) return next();
  try {
    const isSameOrigin = new URL(origin).host === request.headers.host;
    const isViteDevelopmentClient = !isProduction && developmentClientOrigins.has(origin);
    if (!isSameOrigin && !isViteDevelopmentClient) return response.status(403).json({ error: "Origen de solicitud no permitido." });
  } catch (_) {
    return response.status(403).json({ error: "Origen de solicitud no permitido." });
  }
  next();
});
app.use("/api", async (request, response, next) => {
  try {
    await storage.withRequest(() => new Promise(resolve => {
      // Keep the transaction and lock until this request has completed.
      response.once("finish", resolve);
      response.once("close", resolve);
      next();
    }));
  } catch (error) {
    next(error);
  }
});

function addNotification(store, userId, orderId, text) {
  store.notifications ??= [];
  store.notifications.unshift({ id: crypto.randomUUID(), userId, orderId, text, createdAt: new Date().toISOString(), readAt: null });
}

function toCents(value, maximumCents = maximumOrderCents) {
  if (typeof value !== "number" && typeof value !== "string") return null;
  const text = String(value).trim();
  if (!/^(?:0|[1-9]\d*)(?:\.\d{1,2})?$/.test(text)) return null;
  const number = Number(text);
  const cents = Math.round(number * 100);
  return Number.isFinite(number) && Number.isSafeInteger(cents) && cents > 0 && cents <= maximumCents && Math.abs(number - cents / 100) < 1e-9 ? cents : null;
}

function storedCents(value, maximumCents = maximumOrderCents) {
  return Number.isSafeInteger(value) && value > 0 && value <= maximumCents ? value : null;
}

function usdt(cents) {
  return Number((cents / 100).toFixed(2));
}

function usd(cents) {
  return (cents / 100).toFixed(2);
}

function paypalBuyerChargeCents(baseCents) {
  if (!Number.isFinite(paypalProcessingFeeRate) || paypalProcessingFeeRate < 0 || paypalProcessingFeeRate >= 0.2 || !Number.isSafeInteger(paypalProcessingFeeFixedCents) || paypalProcessingFeeFixedCents < 0 || paypalProcessingFeeFixedCents > 10000) return baseCents;
  const totalCents = Math.ceil((baseCents + paypalProcessingFeeFixedCents) / (1 - paypalProcessingFeeRate));
  return Number.isSafeInteger(totalCents) && totalCents >= baseCents ? totalCents : baseCents;
}

function externalUrl(request, pathname) {
  const forwardedProtocol = request.headers["x-forwarded-proto"];
  const protocol = forwardedProtocol === "https" || (!isProduction && request.protocol === "https") ? "https" : "http";
  return new URL(pathname, `${protocol}://${request.headers.host}`).toString();
}

function paypalConfig(environment) {
  if (environment === "live") return { baseUrl: "https://api-m.paypal.com", clientId: process.env.PAYPAL_LIVE_CLIENT_ID, secret: process.env.PAYPAL_LIVE_CLIENT_SECRET, webhookId: paypalLiveWebhookId };
  return { baseUrl: paypalSandboxBaseUrl, clientId: process.env.PAYPAL_SANDBOX_CLIENT_ID, secret: process.env.PAYPAL_SANDBOX_CLIENT_SECRET, webhookId: paypalSandboxWebhookId };
}

function activePaypalEnvironment() {
  return paypalLiveEnabled ? "live" : "sandbox";
}

async function paypalToken(environment) {
  const cached = paypalAccessTokens.get(environment);
  if (cached && cached.expiresAt > Date.now() + 30_000) return cached.value;
  const config = paypalConfig(environment);
  const credentials = Buffer.from(`${config.clientId}:${config.secret}`).toString("base64");
  const response = await fetch(`${config.baseUrl}/v1/oauth2/token`, { method: "POST", headers: { Authorization: `Basic ${credentials}`, "Content-Type": "application/x-www-form-urlencoded" }, body: "grant_type=client_credentials" });
  const result = await response.json().catch(() => ({}));
  if (!response.ok || !result.access_token) throw new Error(`PayPal ${environment} no autorizó la solicitud (${response.status}).`);
  paypalAccessTokens.set(environment, { value: result.access_token, expiresAt: Date.now() + Number(result.expires_in || 0) * 1000 });
  return result.access_token;
}

async function paypalRequest(environment, pathname, options = {}) {
  const token = await paypalToken(environment);
  const response = await fetch(`${paypalConfig(environment).baseUrl}${pathname}`, {
    method: options.method || "GET",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...options.headers },
    body: options.body ? JSON.stringify(options.body) : undefined
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`PayPal ${environment} rechazó la solicitud (${response.status}).`);
  return result;
}

async function paypalWebhookVerified(request, environment) {
  const config = paypalConfig(environment);
  if (!config.webhookId) return false;
  const headers = request.headers;
  const required = ["paypal-auth-algo", "paypal-cert-url", "paypal-transmission-id", "paypal-transmission-sig", "paypal-transmission-time"];
  if (required.some(name => typeof headers[name] !== "string" || !headers[name])) return false;
  const result = await paypalRequest(environment, "/v1/notifications/verify-webhook-signature", {
    method: "POST",
    body: {
      auth_algo: headers["paypal-auth-algo"],
      cert_url: headers["paypal-cert-url"],
      transmission_id: headers["paypal-transmission-id"],
      transmission_sig: headers["paypal-transmission-sig"],
      transmission_time: headers["paypal-transmission-time"],
      webhook_id: config.webhookId,
      webhook_event: request.body
    }
  });
  return result.verification_status === "SUCCESS";
}

function sellerWallet(store, sellerId) {
  store.wallets ??= [];
  let wallet = store.wallets.find(item => item.sellerId === sellerId);
  if (!wallet) {
    wallet = { id: crypto.randomUUID(), sellerId, availableCents: 0, pendingCents: 0, withdrawalAddress: "", createdAt: new Date().toISOString() };
    store.wallets.push(wallet);
  }
  return wallet;
}

function foundingSellerPromotionAvailable(store, order) {
  if (!order.foundingSeller) return false;
  return store.orders.filter(item => item.sellerId === order.sellerId && item.foundingSellerCommissionWaivedAt).length < foundingSellerFreeSales;
}

function assignFoundingSeller(store, seller) {
  store.foundingSellerIds ??= [];
  if (seller.foundingSeller) return true;
  if (store.foundingSellerIds.length >= foundingSellerLimit) return false;
  seller.foundingSeller = true;
  seller.foundingSellerAssignedAt = new Date().toISOString();
  store.foundingSellerIds.push(seller.id);
  return true;
}

function orderPaymentCents(order) {
  return storedCents(order.paymentAmountCents) || toCents(order.paymentAmountUsdt ?? order.amount);
}

function creditSellerForOrder(store, order, creditedAt) {
  if (!order.paymentConfirmedAt) return { error: "El pago debe ser confirmado manualmente antes de acreditar al vendedor." };
  if (order.walletCreditedAt) return { credited: false };
  if (order.paymentProvider === "paypal_live") return { error: "Los pagos PayPal Live requieren una conversión USD a USDT registrada por administración antes de acreditar al vendedor." };
  const grossCents = orderPaymentCents(order);
  const foundingSellerPromotion = foundingSellerPromotionAvailable(store, order);
  const commissionRate = foundingSellerPromotion ? 0 : Number(order.commissionRate ?? platformCommissionRate);
  if (!grossCents || !Number.isFinite(commissionRate) || commissionRate < 0 || commissionRate > 1) return { error: "El importe del pedido no es válido para acreditar la billetera." };
  const commissionCents = Math.round(grossCents * commissionRate);
  const paypalFeeCents = order.paymentProvider === "paypal_live" ? Number(order.paypal?.merchantFeeCents || 0) : 0;
  if (!Number.isSafeInteger(paypalFeeCents) || paypalFeeCents < 0 || paypalFeeCents > grossCents) return { error: "La comisión de PayPal no es válida para acreditar la billetera." };
  const netCents = grossCents - commissionCents - paypalFeeCents;
  const wallet = sellerWallet(store, order.sellerId);
  const availableCents = Number(wallet.availableCents || 0);
  if (!Number.isSafeInteger(availableCents) || availableCents < 0 || !Number.isSafeInteger(netCents) || netCents < 0 || !Number.isSafeInteger(availableCents + netCents)) return { error: "El saldo de la billetera no es válido." };
  order.grossCents = grossCents;
  order.commissionRate = commissionRate;
  order.commissionCents = commissionCents;
  order.paypalMerchantFeeCents = paypalFeeCents;
  order.sellerNetCents = netCents;
  order.grossUsdt = usdt(grossCents);
  order.commissionUsdt = usdt(commissionCents);
  order.paypalMerchantFeeUsdt = usdt(paypalFeeCents);
  order.sellerNetUsdt = usdt(netCents);
  wallet.availableCents = availableCents + netCents;
  if (foundingSellerPromotion) order.foundingSellerCommissionWaivedAt = creditedAt;
  order.walletCreditedAt = creditedAt;
  return { credited: true, netCents };
}

function payoutTransactionUsed(store, transactionId) {
  return (store.withdrawals || []).some(withdrawal => typeof withdrawal.payoutTxId === "string" && withdrawal.payoutTxId.toLowerCase() === transactionId) || store.orders.some(order => typeof order.refund?.transactionId === "string" && order.refund.transactionId.toLowerCase() === transactionId);
}

function paymentReference(value) {
  const reference = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (/^[a-f0-9]{64}$/.test(reference)) return { id: reference, type: "trc20" };
  if (/^\d{8,30}$/.test(reference)) return { id: `binance-internal:${reference}`, type: "binance_internal" };
  return null;
}

function settlementReferenceUsed(store, referenceId) {
  return store.orders.some(order => order.settlement?.reference === referenceId);
}

function emailFrom() {
  const address = process.env.FROM_EMAIL || process.env.SMTP_USER;
  return address.includes("<") ? address : `GameTrade <${address}>`;
}

function escapeEmailHtml(value) {
  return String(value).replace(/[&<>"]/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;" })[character]);
}

function orderUpdateEmailHtml(order, eyebrow, title, message, amount) {
  const orderUrl = `https://gametradegg.com/orders.html?order=${encodeURIComponent(order.id)}`;
  return `<!doctype html><html><body style="margin:0;padding:0;background:#eef3f0;font-family:Arial,sans-serif;color:#17222e"><div style="display:none;max-height:0;overflow:hidden">${escapeEmailHtml(message)}</div><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="padding:32px 12px"><tr><td align="center"><table role="presentation" width="600" cellspacing="0" cellpadding="0" style="max-width:600px;background:#ffffff;border-radius:14px;overflow:hidden;box-shadow:0 10px 30px rgba(23,34,46,.12)"><tr><td style="padding:25px 32px;background:#172f4a"><span style="display:inline-block;padding:8px 10px;border-radius:7px;background:#c7f25c;color:#17222e;font-size:18px;font-weight:bold">G</span><span style="margin-left:8px;color:#ffffff;font-size:22px;font-weight:bold;vertical-align:middle">GameTrade</span></td></tr><tr><td style="padding:34px 42px"><p style="margin:0 0 10px;color:#527268;font-size:11px;font-weight:bold;letter-spacing:1px">${escapeEmailHtml(eyebrow)}</p><h1 style="margin:0 0 13px;font-size:27px;line-height:1.2">${escapeEmailHtml(title)}</h1><p style="margin:0;color:#61707b;font-size:15px;line-height:1.55">${escapeEmailHtml(message)}</p><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:24px 0;border:1px solid #dce4df;border-radius:9px;background:#f8faf7"><tr><td style="padding:16px"><p style="margin:0 0 5px;color:#65717e;font-size:11px;font-weight:bold;letter-spacing:.5px">PEDIDO</p><strong style="font-size:16px">${escapeEmailHtml(order.id)}</strong></td><td style="padding:16px;text-align:right"><p style="margin:0 0 5px;color:#65717e;font-size:11px;font-weight:bold;letter-spacing:.5px">IMPORTE</p><strong style="font-size:16px;color:#416928">${escapeEmailHtml(amount)}</strong></td></tr></table><p style="margin:0 0 5px;color:#65717e;font-size:11px;font-weight:bold;letter-spacing:.5px">PRODUCTO</p><p style="margin:0 0 25px;color:#17222e;font-size:15px;font-weight:bold">${escapeEmailHtml(order.productTitle || "Oferta de GameTrade")}</p><a href="${orderUrl}" style="display:inline-block;padding:12px 18px;border-radius:7px;background:#c7f25c;color:#17222e;font-size:14px;font-weight:bold;text-decoration:none">Abrir pedido</a></td></tr><tr><td style="padding:18px 42px;background:#f6f8f6;color:#7a858d;font-size:11px;line-height:1.45">Este es un aviso transaccional de GameTrade. Nunca compartas tus contraseñas, códigos o datos financieros por chat.</td></tr></table></td></tr></table></body></html>`;
}

async function sendAdminPaymentEmail(order) {
  if (!mailTransport || !process.env.ADMIN_EMAIL) return;
  const amount = Number(order.paymentAmountUsdt).toFixed(2);
  await mailTransport.sendMail({
    from: emailFrom(),
    to: process.env.ADMIN_EMAIL.trim(),
    subject: `Pago USDT pendiente de revisión | ${order.id}`,
    text: `Se registró un pago manual de ${amount} USDT TRC20 para ${order.id}. Referencia: ${order.paymentTxId}. Revísalo y confírmalo manualmente en Administración: https://gametradegg.com/admin.html`,
    html: `<!doctype html><html><body style="margin:0;padding:0;background:#f3f6f4;font-family:Arial,sans-serif;color:#17222e"><div style="display:none;max-height:0;overflow:hidden">Hay un pago USDT pendiente de revisión manual.</div><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="padding:32px 12px"><tr><td align="center"><table role="presentation" width="600" cellspacing="0" cellpadding="0" style="max-width:600px;background:#ffffff;border-radius:14px;overflow:hidden;box-shadow:0 10px 30px rgba(23,34,46,.12)"><tr><td style="padding:25px 32px;background:#172f4a"><span style="display:inline-block;padding:8px 10px;border-radius:7px;background:#c7f25c;color:#17222e;font-size:18px;font-weight:bold">G</span><span style="margin-left:8px;color:#ffffff;font-size:22px;font-weight:bold;vertical-align:middle">GameTrade</span></td></tr><tr><td style="padding:34px 42px"><p style="margin:0 0 10px;color:#527268;font-size:11px;font-weight:bold;letter-spacing:1px">PAGO PENDIENTE</p><h1 style="margin:0 0 13px;font-size:27px;line-height:1.2">Revisa un pago USDT</h1><p style="margin:0;color:#61707b;font-size:15px;line-height:1.55">Un comprador registró un pago y requiere revisión manual antes de avisar al vendedor.</p><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:24px 0;border:1px solid #dce4df;border-radius:9px;background:#f8faf7"><tr><td style="padding:16px"><p style="margin:0 0 5px;color:#65717e;font-size:12px">PEDIDO</p><strong style="font-size:16px">${order.id}</strong></td><td style="padding:16px;text-align:right"><p style="margin:0 0 5px;color:#65717e;font-size:12px">IMPORTE</p><strong style="font-size:16px;color:#416928">${amount} USDT</strong></td></tr></table><p style="margin:0 0 7px;color:#65717e;font-size:12px">REFERENCIA DE PAGO</p><p style="margin:0 0 25px;padding:12px;border-radius:7px;background:#f2f4f2;color:#17222e;font-family:monospace;font-size:12px;word-break:break-all">${order.paymentTxId}</p><a href="https://gametradegg.com/admin.html" style="display:inline-block;padding:13px 18px;border-radius:7px;background:#c7f25c;color:#17222e;font-size:14px;font-weight:bold;text-decoration:none">Abrir Administración</a><p style="margin:24px 0 0;color:#7a858d;font-size:12px;line-height:1.5">Confirma solo después de comprobar el importe, la red TRC20 y la referencia en tu proveedor de pagos.</p></td></tr><tr><td style="padding:17px 42px;background:#f6f8f6;color:#7a858d;font-size:11px;line-height:1.45">Este es un aviso operativo de GameTrade. No compartas claves privadas, códigos 2FA ni credenciales de Binance.</td></tr></table></td></tr></table></body></html>`
  });
}

async function sendOrderUpdateEmails(store, order, update) {
  if (!mailTransport) return;
  const buyer = store.accounts.find(account => account.id === order.buyerId);
  const seller = store.accounts.find(account => account.id === order.sellerId);
  const amount = order.paymentProvider === "paypal_sandbox" ? `${order.paymentAmountUsd} USD por PayPal Sandbox` : `${Number(order.paymentAmountUsdt || order.amount).toFixed(2)} USDT`;
  const messages = update === "payment"
    ? [[buyer, `Pago confirmado | ${order.id}`, "PAGO CONFIRMADO", "Tu pago fue confirmado. El vendedor ya puede realizar la entrega."], [seller, `Pago confirmado | ${order.id}`, "PAGO CONFIRMADO", "El pago fue confirmado. Ya puedes realizar la entrega."]]
    : update === "delivery"
      ? [[buyer, `Entrega marcada | ${order.id}`, "ENTREGA MARCADA", "El vendedor marcó la entrega. Revísala y confirma solo si recibiste lo acordado."]]
      : [[buyer, `Pedido completado | ${order.id}`, "PEDIDO COMPLETADO", "Confirmaste la recepción. Gracias por usar GameTrade."], [seller, `Pedido completado | ${order.id}`, "PEDIDO COMPLETADO", `El comprador confirmó la recepción. Se acreditaron ${Number(order.sellerNetUsdt || 0).toFixed(2)} USDT en tu billetera.`]];
  await Promise.all(messages.filter(([account]) => account?.email).map(([account, subject, eyebrow, text]) => mailTransport.sendMail({ from: emailFrom(), to: account.email, subject, text: `${text} Pedido: ${order.id}. Importe: ${amount}.`, html: orderUpdateEmailHtml(order, eyebrow, subject.split(" | ")[0], text, amount) })));
}

function orderWithProduct(store, order) {
  const offer = store.offers.find(item => item.id === order.offerId);
  const review = (store.reviews || []).find(item => item.orderId === order.id && item.buyerId === order.buyerId);
  const lastMessage = (store.messages || []).filter(message => message.orderId === order.id).sort((first, second) => Date.parse(second.createdAt) - Date.parse(first.createdAt))[0];
  return {
    ...order,
    productTitle: order.productTitle || offer?.title || "Oferta no disponible",
    productGame: order.productGame || offer?.game || "Juego no disponible",
    productType: order.productType || offer?.type || "Producto",
    productDelivery: order.productDelivery || offer?.delivery || "No especificado",
    depositAddress,
    paypalSandboxAvailable: paypalLiveEnabled || paypalSandboxEnabled,
    paypalEnvironment: activePaypalEnvironment(),
    paypalMinimumUsd: usdt(minimumPaypalPaymentCents),
    paypalBuyerChargeUsd: usd(order.paypal?.buyerChargeCents || paypalBuyerChargeCents(orderPaymentCents(order))),
    paypalProcessingFeeUsd: usd(order.paypal?.processingFeeCents ?? (paypalBuyerChargeCents(orderPaymentCents(order)) - orderPaymentCents(order))),
    lastMessage: lastMessage ? { text: lastMessage.text, createdAt: lastMessage.createdAt } : null,
    reviewedByBuyer: Boolean(review),
    review: review ? { buyer: review.buyer, rating: review.rating, comment: review.comment, createdAt: review.createdAt } : null
  };
}

function recordPaypalCapture(store, order, paypalOrder, verifiedPaypalOrder, capture) {
  const amountCents = orderPaymentCents(order);
  const buyerChargeCents = order.paypal?.buyerChargeCents || amountCents;
  if (paypalOrder.status !== "COMPLETED" || capture?.status !== "COMPLETED" || capture.amount?.currency_code !== "USD" || toCents(capture.amount?.value) !== buyerChargeCents || verifiedPaypalOrder.purchase_units?.[0]?.custom_id !== order.id) {
    return { error: "PayPal no confirmó el importe esperado." };
  }
  if (store.orders.some(item => item.id !== order.id && item.paypal?.captureId === capture.id)) return { error: "Este cobro de PayPal ya está asociado a otro pedido." };
  const confirmedAt = new Date().toISOString();
  order.paypal.captureId = capture.id;
  order.paypal.capturedAt = confirmedAt;
  order.paypal.merchantFeeCents = order.paypal.environment === "live" ? (toCents(capture.seller_receivable_breakdown?.paypal_fee?.value) || 0) : 0;
  order.paymentProvider = `paypal_${order.paypal.environment}`;
  order.paymentCurrency = "USD";
  order.paymentAmountUsd = usd(buyerChargeCents);
  order.paymentTxId = `paypal:${capture.id}`;
  order.paymentConfirmedAt = confirmedAt;
  order.updatedAt = confirmedAt;
  order.status = order.paypal.environment === "live" ? "awaiting_settlement" : "awaiting_seller";
  const label = order.paypal.environment === "live" ? "PayPal" : "PayPal Sandbox";
  if (order.status === "awaiting_settlement") {
    addNotification(store, order.sellerId, order.id, `El pago ${label} del pedido ${order.id} fue confirmado. Administración debe convertir y acreditar el saldo antes de la entrega.`);
    addNotification(store, order.buyerId, order.id, `Tu pago ${label} fue confirmado. El pedido espera la liquidación de saldo antes de la entrega.`);
  } else {
    addNotification(store, order.sellerId, order.id, `El pago ${label} del pedido ${order.id} fue confirmado. Ya puedes realizar la entrega.`);
    addNotification(store, order.buyerId, order.id, `Tu pago ${label} fue confirmado. El vendedor fue avisado.`);
  }
  return { order };
}

function publicSellerProfile(store, seller) {
  const reviews = (store.reviews || []).filter(review => review.sellerId === seller.id).sort((first, second) => Date.parse(second.createdAt) - Date.parse(first.createdAt));
  const completedTrades = store.orders.filter(order => order.sellerId === seller.id && order.status === "completed").length;
  const averageRating = reviews.length ? Number((reviews.reduce((total, review) => total + review.rating, 0) / reviews.length).toFixed(1)) : null;
  const activeOffers = store.offers.filter(offer => offer.sellerId === seller.id && !offer.paused).map(offer => ({ id: offer.id, game: offer.game, type: offer.type, title: offer.title, price: offer.price, delivery: offer.delivery, verified: Boolean(offer.verified) }));
  return { id: seller.id, name: seller.name, verified: Boolean(seller.verified), createdAt: seller.createdAt, completedTrades, averageRating, reviewCount: reviews.length, activeOffers, reviews: reviews.map(review => ({ id: review.id, buyer: review.buyer, rating: review.rating, comment: review.comment, createdAt: review.createdAt })) };
}

function publicUserProfile(store, user) {
  if (user.role === "seller") {
    const seller = publicSellerProfile(store, user);
    return { ...seller, role: "seller", reviewsLabel: "Reseñas de compradores", reviews: seller.reviews.map(review => ({ ...review, author: review.buyer })) };
  }
  const reviews = (store.reviews || []).filter(review => review.buyerId === user.id).sort((first, second) => Date.parse(second.createdAt) - Date.parse(first.createdAt)).map(review => ({ id: review.id, author: store.accounts.find(account => account.id === review.sellerId)?.name || "Vendedor", rating: review.rating, comment: review.comment, createdAt: review.createdAt }));
  return { id: user.id, name: user.name, role: "buyer", verified: false, createdAt: user.createdAt, completedTrades: store.orders.filter(order => order.buyerId === user.id && order.status === "completed").length, averageRating: null, reviewCount: reviews.length, reviewsLabel: "Reseñas publicadas", reviews };
}

function cookies(request) {
  return Object.fromEntries((request.headers.cookie || "").split(";").filter(Boolean).map(item => {
    const index = item.indexOf("=");
    return [item.slice(0, index).trim(), decodeURIComponent(item.slice(index + 1))];
  }));
}

function currentAccount(request) {
  const sessionId = cookies(request).gametrade_session;
  const store = readStore();
  store.sessions ??= [];
  const session = sessionId && store.sessions.find(item => item.id === sessionId);
  if (!session) return null;
  if (Date.now() > session.expiresAt) {
    store.sessions = store.sessions.filter(item => item.id !== sessionId);
    writeStore(store);
    return null;
  }
  return store.accounts?.find(account => account.id === session.accountId) || null;
}

function isAdmin(account) {
  return Boolean(account && account.emailVerified && process.env.ADMIN_EMAIL && account.email === process.env.ADMIN_EMAIL.trim().toLowerCase());
}

function publicAccount(account) {
  return { id: account.id, name: account.name, email: account.email, role: account.role, verified: account.verified, emailVerified: Boolean(account.emailVerified), verificationRequested: Boolean(account.verificationRequested), foundingSeller: Boolean(account.foundingSeller), createdAt: account.createdAt, isAdmin: isAdmin(account) };
}

function adminAccount(request, response) {
  const account = currentAccount(request);
  if (!isAdmin(account)) {
    response.status(403).json({ error: "No tienes acceso de administrador." });
    return null;
  }
  return account;
}

function isLocalRequest(request) {
  return ["::1", "127.0.0.1", "::ffff:127.0.0.1"].includes(request.socket.remoteAddress);
}

function rateLimited(request, response, action, maximum, windowMs) {
  const forwarded = isLocalRequest(request) && typeof request.headers["x-forwarded-for"] === "string" ? request.headers["x-forwarded-for"].split(",")[0].trim() : "";
  const client = forwarded || request.socket.remoteAddress || "unknown";
  const key = `${action}:${client}`;
  const now = Date.now();
  const attempts = (requestLimits.get(key) || []).filter(timestamp => now - timestamp < windowMs);
  if (attempts.length >= maximum) {
    const seconds = Math.ceil((windowMs - (now - attempts[0])) / 1000);
    response.status(429).json({ error: `Demasiados intentos. Intenta de nuevo en ${seconds} segundos.` });
    return true;
  }
  attempts.push(now);
  requestLimits.set(key, attempts);
  return false;
}

function sendLocalOnlyFile(request, response, file) {
  if (isProduction || !isLocalRequest(request)) return response.status(404).end();
  response.sendFile(path.join(__dirname, file));
}

async function passwordHash(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const derived = await scrypt(password, salt, 64);
  return `${salt}:${derived.toString("hex")}`;
}

async function passwordMatches(password, storedHash) {
  const [salt, stored] = storedHash.split(":");
  const derived = await scrypt(password, salt, 64);
  return crypto.timingSafeEqual(Buffer.from(stored, "hex"), derived);
}

function startSession(response, store, accountId) {
  const sessionId = crypto.randomBytes(32).toString("hex");
  store.sessions = (store.sessions || []).filter(session => Date.now() <= session.expiresAt);
  store.sessions.push({ id: sessionId, accountId, expiresAt: Date.now() + sessionDurationMs });
  writeStore(store);
  response.setHeader("Set-Cookie", `gametrade_session=${sessionId}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${sessionDurationMs / 1000}${isProduction ? "; Secure" : ""}`);
}

function verificationCode() {
  return String(crypto.randomInt(100000, 1000000));
}

function verificationCodeHash(code) {
  return crypto.createHash("sha256").update(code).digest("hex");
}

function plainText(value, minimumLength, maximumLength) {
  if (typeof value !== "string") return "";
  const text = value.trim();
  return text.length >= minimumLength && text.length <= maximumLength && !/[\u0000-\u001f<>]/.test(text) ? text : "";
}

async function sendEmailVerification(account, code) {
  if (!mailTransport) {
    console.log(`Email SMTP no configurado. Código de verificación para ${account.email}: ${code}`);
    return false;
  }
  await mailTransport.sendMail({
    from: emailFrom(),
    to: account.email,
    subject: "Tu código de acceso a GameTrade",
    text: `Tu código de verificación de GameTrade es ${code}. Vence en 15 minutos. Si no creaste una cuenta, ignora este correo.`,
    html: `<!doctype html><html><body style="margin:0;padding:0;background:#eef3f0;font-family:Arial,sans-serif;color:#17222e"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="padding:32px 12px"><tr><td align="center"><table role="presentation" width="600" cellspacing="0" cellpadding="0" style="max-width:600px;background:#ffffff;border-radius:14px;overflow:hidden;box-shadow:0 10px 30px rgba(23,34,46,.12)"><tr><td style="height:185px;background:#1d4f88 url('https://images.unsplash.com/photo-1511512578047-dfb367046420?auto=format&fit=crop&w=1200&q=80') center/cover no-repeat"><div style="padding:26px;background:linear-gradient(90deg,rgba(15,35,58,.94),rgba(15,35,58,.32));height:133px"><span style="display:inline-block;padding:8px 10px;border-radius:7px;background:#c7f25c;color:#17222e;font-size:18px;font-weight:bold">G</span><span style="margin-left:8px;color:#ffffff;font-size:22px;font-weight:bold;vertical-align:middle">GameTrade</span><p style="margin:22px 0 0;color:#dbeaff;font-size:14px">Mercado seguro para jugadores</p></div></td></tr><tr><td style="padding:34px 42px"><p style="margin:0 0 10px;color:#527268;font-size:11px;font-weight:bold;letter-spacing:1px">VERIFICACIÓN DE CORREO</p><h1 style="margin:0 0 13px;font-size:28px;line-height:1.2">Confirma tu cuenta</h1><p style="margin:0;color:#61707b;font-size:15px;line-height:1.55">Usa este código para activar tu cuenta y empezar a comprar o vender en GameTrade.</p><div style="margin:27px 0;padding:17px;border:1px dashed #a9c3ad;border-radius:9px;background:#f4faed;text-align:center;color:#1c3c29;font-size:32px;font-weight:bold;letter-spacing:8px">${code}</div><p style="margin:0;color:#61707b;font-size:13px;line-height:1.5">El código vence en <strong>15 minutos</strong>. Nunca compartas este código con nadie.</p></td></tr><tr><td style="padding:18px 42px;background:#f6f8f6;color:#7a858d;font-size:11px;line-height:1.45">Si no solicitaste crear una cuenta en GameTrade, puedes ignorar este correo de forma segura.</td></tr></table></td></tr></table></body></html>`
  });
  return true;
}

async function sendPasswordReset(account, code) {
  if (!mailTransport) {
    console.log(`Email SMTP no configurado. Código de recuperación para ${account.email}: ${code}`);
    return false;
  }
  await mailTransport.sendMail({
    from: emailFrom(),
    to: account.email,
    subject: "Restablece tu contraseña de GameTrade",
    text: `Tu código para restablecer la contraseña es ${code}. Vence en 15 minutos. Si no solicitaste este cambio, ignora el correo.`,
    html: `<!doctype html><html><body style="margin:0;padding:0;background:#eef3f0;font-family:Arial,sans-serif;color:#17222e"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="padding:32px 12px"><tr><td align="center"><table role="presentation" width="600" cellspacing="0" cellpadding="0" style="max-width:600px;background:#ffffff;border-radius:14px;overflow:hidden;box-shadow:0 10px 30px rgba(23,34,46,.12)"><tr><td style="padding:27px 38px;background:#17395f;color:#fff"><span style="display:inline-block;padding:8px 10px;border-radius:7px;background:#c7f25c;color:#17222e;font-size:18px;font-weight:bold">G</span><span style="margin-left:8px;font-size:22px;font-weight:bold;vertical-align:middle">GameTrade</span></td></tr><tr><td style="padding:34px 42px"><p style="margin:0 0 10px;color:#527268;font-size:11px;font-weight:bold;letter-spacing:1px">RECUPERACIÓN DE CONTRASEÑA</p><h1 style="margin:0 0 13px;font-size:28px;line-height:1.2">Restablece tu acceso</h1><p style="margin:0;color:#61707b;font-size:15px;line-height:1.55">Usa este código para crear una nueva contraseña para tu cuenta.</p><div style="margin:27px 0;padding:17px;border:1px dashed #a9c3ad;border-radius:9px;background:#f4faed;text-align:center;color:#1c3c29;font-size:32px;font-weight:bold;letter-spacing:8px">${code}</div><p style="margin:0;color:#61707b;font-size:13px;line-height:1.5">El código vence en <strong>15 minutos</strong>. Si no solicitaste este cambio, ignora este correo.</p></td></tr></table></td></tr></table></body></html>`
  });
}

function invalidateAccountSessions(store, accountId) {
  store.sessions = (store.sessions || []).filter(session => session.accountId !== accountId);
  writeStore(store);
}

app.get("/api/health", (request, response) => {
  response.json({ status: "ok", service: "gametrade" });
});

app.get("/api/fees", (request, response) => {
  response.json({ commissionRate: platformCommissionRate, withdrawalFeeRate, minimumWithdrawalUsdt, withdrawalMarginUsdt, withdrawalNetworkReserveUsdt, withdrawalFeePolicy: "Estimado: max(1% del retiro, 1.00 USDT de reserva de red + 0.50 USDT de margen). La cotización real se revisa manualmente antes del pago.", withdrawalCurrency: "USDT", withdrawalNetwork: "TRC20" });
});

app.post("/api/setup/smtp", async (request, response) => {
  if (isProduction || !isLocalRequest(request)) return response.status(403).json({ error: "La configuración SMTP local no está disponible." });
  const { host, port, user, password, fromEmail, secure } = request.body;
  if (![host, user, password, fromEmail].every(value => typeof value === "string" && value.trim()) || !Number.isFinite(Number(port))) return response.status(400).json({ error: "Completa todos los datos SMTP." });
  const useSecureConnection = secure === "true";
  const candidate = nodemailer.createTransport({ host: host.trim(), port: Number(port), secure: useSecureConnection, requireTLS: !useSecureConnection, auth: { user: user.trim(), pass: password.trim() } });
  try {
    await candidate.verify();
  } catch (error) {
    console.error("Error SMTP Brevo:", error.code || error.message);
    return response.status(400).json({ error: `Brevo no pudo conectar (${error.code || "SMTP"}): ${String(error.message || "Revisa la conexión")}` });
  }
  mailTransport = candidate;
  process.env.FROM_EMAIL = fromEmail.trim();
  response.json({ configured: true });
});

app.post("/api/auth/register", async (request, response) => {
  if (rateLimited(request, response, "register", 5, 15 * 60 * 1000)) return;
  const { name, email, password, role, acceptTerms } = request.body;
  const publicName = plainText(name, 3, 30);
  const normalizedEmail = typeof email === "string" ? email.trim().toLowerCase() : "";

  if (!publicName || !/^\S+@\S+\.\S+$/.test(normalizedEmail) || typeof password !== "string" || password.length < 8 || !["buyer", "seller"].includes(role) || acceptTerms !== "on") {
    return response.status(400).json({ error: "Completa los datos y acepta las reglas del mercado." });
  }

  const store = readStore();
  store.accounts ??= [];
  if (store.accounts.some(account => account.email === normalizedEmail)) {
    return response.status(409).json({ error: "Ya existe una cuenta con ese correo." });
  }

  const code = verificationCode();
  const account = { id: crypto.randomUUID(), name: publicName, email: normalizedEmail, passwordHash: await passwordHash(password), role, verified: false, emailVerified: false, failedLoginAttempts: 0, emailVerificationAttempts: 0, emailVerificationCodeHash: verificationCodeHash(code), emailVerificationExpiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(), lastVerificationSentAt: new Date().toISOString(), termsAcceptedAt: new Date().toISOString(), createdAt: new Date().toISOString() };
  store.accounts.push(account);
  writeStore(store);
  await sendEmailVerification(account, code);
  startSession(response, store, account.id);
  response.status(201).json(publicAccount(account));
});

app.post("/api/auth/login", async (request, response) => {
  const { email, password } = request.body;
  if (rateLimited(request, response, "login", 15, 15 * 60 * 1000)) return;
  const store = readStore();
  const account = store.accounts?.find(item => item.email === String(email || "").trim().toLowerCase());
  if (account?.loginLockedAt) return response.status(423).json({ error: "Tu cuenta fue bloqueada después de tres intentos fallidos. Restablece tu contraseña para volver a entrar." });
  if (!account || typeof password !== "string" || !(await passwordMatches(password, account.passwordHash))) {
    if (account) {
      account.failedLoginAttempts = Number(account.failedLoginAttempts || 0) + 1;
      if (account.failedLoginAttempts >= 3) {
        account.loginLockedAt = new Date().toISOString();
        writeStore(store);
        return response.status(423).json({ error: "Tu cuenta fue bloqueada después de tres intentos fallidos. Usa Recuperar contraseña para desbloquearla." });
      }
      writeStore(store);
      return response.status(401).json({ error: `Correo o contraseña incorrectos. Te quedan ${3 - account.failedLoginAttempts} intentos antes del bloqueo.` });
    }
    return response.status(401).json({ error: "Correo o contraseña incorrectos." });
  }
  delete account.failedLoginAttempts;
  delete account.loginLockedAt;
  writeStore(store);
  startSession(response, store, account.id);
  response.json(publicAccount(account));
});

app.post("/api/auth/verify-email", (request, response) => {
  const account = currentAccount(request);
  const code = typeof request.body.code === "string" ? request.body.code.trim() : "";
  if (!account) return response.status(401).json({ error: "Inicia sesión para verificar tu correo." });
  if (account.emailVerified) return response.json(publicAccount(account));
  const store = readStore();
  const storedAccount = store.accounts.find(item => item.id === account.id);
  if (Number(storedAccount.emailVerificationAttempts || 0) >= 5) return response.status(429).json({ error: "Demasiados códigos incorrectos. Solicita un nuevo código." });
  if (!/^\d{6}$/.test(code) || !storedAccount.emailVerificationExpiresAt || Date.now() > Date.parse(storedAccount.emailVerificationExpiresAt) || verificationCodeHash(code) !== storedAccount.emailVerificationCodeHash) {
    storedAccount.emailVerificationAttempts = Number(storedAccount.emailVerificationAttempts || 0) + 1;
    writeStore(store);
    return response.status(400).json({ error: "El código es inválido o venció." });
  }
  storedAccount.emailVerified = true;
  delete storedAccount.emailVerificationAttempts;
  delete storedAccount.emailVerificationCodeHash;
  delete storedAccount.emailVerificationExpiresAt;
  delete storedAccount.lastVerificationSentAt;
  writeStore(store);
  response.json(publicAccount(storedAccount));
});

app.post("/api/auth/resend-verification", async (request, response) => {
  const account = currentAccount(request);
  if (!account) return response.status(401).json({ error: "Inicia sesión para solicitar un código." });
  if (account.emailVerified) return response.json(publicAccount(account));
  if (account.lastVerificationSentAt && Date.now() - Date.parse(account.lastVerificationSentAt) < 60 * 1000) return response.status(429).json({ error: "Espera un minuto antes de solicitar otro código." });
  const code = verificationCode();
  const store = readStore();
  const storedAccount = store.accounts.find(item => item.id === account.id);
  storedAccount.emailVerificationCodeHash = verificationCodeHash(code);
  storedAccount.emailVerificationExpiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();
  storedAccount.lastVerificationSentAt = new Date().toISOString();
  storedAccount.emailVerificationAttempts = 0;
  writeStore(store);
  await sendEmailVerification(storedAccount, code);
  response.json({ sent: true, smtpConfigured: Boolean(mailTransport) });
});

app.post("/api/auth/request-password-reset", async (request, response) => {
  if (rateLimited(request, response, "password-reset-request", 5, 15 * 60 * 1000)) return;
  const email = typeof request.body.email === "string" ? request.body.email.trim().toLowerCase() : "";
  const store = readStore();
  const account = store.accounts?.find(item => item.email === email);
  if (account) {
    const code = verificationCode();
    account.passwordResetCodeHash = verificationCodeHash(code);
    account.passwordResetExpiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();
    account.passwordResetAttempts = 0;
    writeStore(store);
    await sendPasswordReset(account, code);
  }
  response.json({ sent: true });
});

app.post("/api/auth/reset-password", async (request, response) => {
  if (rateLimited(request, response, "password-reset", 10, 15 * 60 * 1000)) return;
  const email = typeof request.body.email === "string" ? request.body.email.trim().toLowerCase() : "";
  const code = typeof request.body.code === "string" ? request.body.code.trim() : "";
  const password = request.body.password;
  if (!/^\d{6}$/.test(code) || typeof password !== "string" || password.length < 8) return response.status(400).json({ error: "Código o contraseña inválidos." });
  const store = readStore();
  const account = store.accounts?.find(item => item.email === email);
  if (account && Number(account.passwordResetAttempts || 0) >= 5) return response.status(429).json({ error: "Demasiados códigos incorrectos. Solicita un nuevo código." });
  if (!account || !account.passwordResetExpiresAt || Date.now() > Date.parse(account.passwordResetExpiresAt) || verificationCodeHash(code) !== account.passwordResetCodeHash) {
    if (account) {
      account.passwordResetAttempts = Number(account.passwordResetAttempts || 0) + 1;
      writeStore(store);
    }
    return response.status(400).json({ error: "El código es inválido o venció." });
  }
  account.passwordHash = await passwordHash(password);
  delete account.passwordResetCodeHash;
  delete account.passwordResetExpiresAt;
  delete account.passwordResetAttempts;
  delete account.failedLoginAttempts;
  delete account.loginLockedAt;
  writeStore(store);
  invalidateAccountSessions(store, account.id);
  response.status(204).end();
});

app.post("/api/auth/logout", (request, response) => {
  const sessionId = cookies(request).gametrade_session;
  if (sessionId) {
    const store = readStore();
    store.sessions = (store.sessions || []).filter(session => session.id !== sessionId);
    writeStore(store);
  }
  response.setHeader("Set-Cookie", "gametrade_session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0");
  response.status(204).end();
});

app.get("/api/auth/me", (request, response) => {
  const account = currentAccount(request);
  if (!account) return response.status(401).json({ error: "No hay una sesión activa." });
  response.json(publicAccount(account));
});

app.patch("/api/profile", (request, response) => {
  const account = currentAccount(request);
  const name = plainText(request.body.name, 3, 30);
  if (!account) return response.status(401).json({ error: "Inicia sesión para actualizar tu perfil." });
  if (!name) return response.status(400).json({ error: "El nombre debe tener entre 3 y 30 caracteres y no incluir etiquetas." });
  const store = readStore();
  const storedAccount = store.accounts.find(item => item.id === account.id);
  storedAccount.name = name;
  store.offers.forEach(offer => { if (offer.sellerId === account.id) offer.seller = name; });
  store.orders.forEach(order => { if (order.buyerId === account.id) order.buyer = name; if (order.sellerId === account.id) order.seller = name; });
  writeStore(store);
  response.json(publicAccount(storedAccount));
});

app.get("/api/profile/stats", (request, response) => {
  const account = currentAccount(request);
  if (!account) return response.status(401).json({ error: "Inicia sesión para ver tus estadísticas." });
  const store = readStore();
  const completedPurchases = store.orders.filter(order => order.buyerId === account.id && order.status === "completed").length;
  const completedSales = store.orders.filter(order => order.sellerId === account.id && order.status === "completed").length;
  const receivedReviews = (store.reviews || []).filter(review => review.sellerId === account.id);
  response.json({ completedPurchases, completedSales, receivedReviews: receivedReviews.length, averageRating: receivedReviews.length ? Number((receivedReviews.reduce((total, review) => total + review.rating, 0) / receivedReviews.length).toFixed(1)) : null });
});

app.get("/api/sellers/:sellerId", (request, response) => {
  const store = readStore();
  const seller = store.accounts.find(account => account.id === request.params.sellerId && account.role === "seller");
  if (!seller) return response.status(404).json({ error: "Vendedor no encontrado." });
  response.json(publicSellerProfile(store, seller));
});

app.get("/api/users/:userId", (request, response) => {
  const store = readStore();
  const user = store.accounts.find(account => account.id === request.params.userId);
  if (!user) return response.status(404).json({ error: "Usuario no encontrado." });
  response.json(publicUserProfile(store, user));
});

app.get("/api/notifications", (request, response) => {
  const account = currentAccount(request);
  if (!account) return response.status(401).json({ error: "Inicia sesión para ver notificaciones." });
  response.json((readStore().notifications || []).filter(notification => notification.userId === account.id && !notification.readAt));
});

app.post("/api/notifications/:notificationId/read", (request, response) => {
  const account = currentAccount(request);
  if (!account) return response.status(401).json({ error: "Inicia sesión para actualizar notificaciones." });
  const store = readStore();
  const notification = (store.notifications || []).find(item => item.id === request.params.notificationId && item.userId === account.id);
  if (!notification) return response.status(404).json({ error: "Notificación no encontrada." });
  notification.readAt ??= new Date().toISOString();
  writeStore(store);
  response.status(204).end();
});

app.get("/api/admin/summary", (request, response) => {
  if (!adminAccount(request, response)) return;
  const store = readStore();
  const orders = store.orders || [];
  const completedOrders = orders.filter(order => order.status === "completed");
  const paypalOrders = completedOrders.filter(order => order.paymentProvider === "paypal_sandbox");
  response.json({
    activeOffers: store.offers.filter(offer => !offer.paused).length,
    sellers: (store.accounts || []).filter(account => account.role === "seller").length,
    pendingVerification: (store.accounts || []).filter(account => account.role === "seller" && account.verificationRequested && !account.verified).length,
    openDisputes: orders.filter(order => order.status === "disputed").length,
    orders: orders.length,
    completedOrders: completedOrders.length,
    platformCommission: usdt(completedOrders.reduce((total, order) => total + Number(order.commissionCents || 0), 0)),
    paypalMerchantFees: usdt(paypalOrders.reduce((total, order) => total + Number(order.paypal?.merchantFeeCents || 0), 0)),
    netPlatformEarnings: usdt(completedOrders.reduce((total, order) => total + Number(order.commissionCents || 0), 0))
  });
});

app.get("/api/admin/users", (request, response) => {
  if (!adminAccount(request, response)) return;
  const store = readStore();
  response.json((store.accounts || []).map(account => {
    const orders = store.orders.filter(order => order.buyerId === account.id || order.sellerId === account.id);
    const wallet = (store.wallets || []).find(item => item.sellerId === account.id);
    return {
      ...publicAccount(account),
      offers: store.offers.filter(offer => offer.sellerId === account.id).length,
      orders: orders.length,
      completedOrders: orders.filter(order => order.status === "completed").length,
      reviews: (store.reviews || []).filter(review => review.sellerId === account.id).length,
      wallet: account.role === "seller" ? { availableUsdt: usdt(Number(wallet?.availableCents || 0)), pendingUsdt: usdt(Number(wallet?.pendingCents || 0)) } : null
    };
  }).sort((first, second) => Date.parse(second.createdAt) - Date.parse(first.createdAt)));
});

app.get("/api/admin/sellers", (request, response) => {
  if (!adminAccount(request, response)) return;
  const store = readStore();
  response.json((store.accounts || []).filter(account => account.role === "seller").map(account => ({ ...publicAccount(account), offers: store.offers.filter(offer => offer.sellerId === account.id).length })));
});

app.post("/api/admin/sellers/:sellerId/verify", (request, response) => {
  if (!adminAccount(request, response)) return;
  const store = readStore();
  const seller = store.accounts.find(account => account.id === request.params.sellerId && account.role === "seller");
  if (!seller) return response.status(404).json({ error: "Vendedor no encontrado." });
  seller.verified = true;
  seller.verificationRequested = false;
  const foundingSeller = assignFoundingSeller(store, seller);
  store.offers.forEach(offer => { if (offer.sellerId === seller.id) offer.verified = true; });
  addNotification(store, seller.id, "", foundingSeller ? `Tu perfil de vendedor fue verificado. Eres Vendedor fundador: GameTrade no cobrará comisión en tus primeras ${foundingSellerFreeSales} ventas completadas.` : "Tu perfil de vendedor fue verificado.");
  writeStore(store);
  response.json(publicAccount(seller));
});

app.get("/api/admin/disputes", (request, response) => {
  if (!adminAccount(request, response)) return;
  response.json(readStore().orders.filter(order => order.status === "disputed"));
});

app.get("/api/admin/payments", (request, response) => {
  if (!adminAccount(request, response)) return;
  response.json(readStore().orders.filter(order => order.status === "payment_submitted").map(order => ({ id: order.id, buyer: order.buyer, seller: order.seller, paymentAmountUsdt: order.paymentAmountUsdt ?? order.amount, paymentTxId: order.paymentTxId, paymentSubmittedAt: order.paymentSubmittedAt })));
});

app.get("/api/admin/paypal-payments", (request, response) => {
  if (!adminAccount(request, response)) return;
  const payments = readStore().orders
    .filter(order => ["paypal_sandbox", "paypal_live"].includes(order.paymentProvider) && order.paypal?.captureId)
    .map(order => ({ id: order.id, buyer: order.buyer, seller: order.seller, saleAmountUsdt: order.paymentAmountUsdt, buyerChargeUsd: order.paymentAmountUsd, merchantFeeUsd: usdt(Number(order.paypal?.merchantFeeCents || 0)), platformCommissionUsdt: usdt(Number(order.commissionCents || 0)), sellerNetUsdt: usdt(Number(order.sellerNetCents || 0)), captureId: order.paypal.captureId, confirmedAt: order.paymentConfirmedAt, status: order.status }))
    .sort((first, second) => Date.parse(second.confirmedAt) - Date.parse(first.confirmedAt));
  response.json(payments);
});

app.get("/api/admin/paypal-settlements", (request, response) => {
  if (!adminAccount(request, response)) return;
  response.json(readStore().orders.filter(order => order.status === "awaiting_settlement" && order.paymentProvider === "paypal_live").map(order => ({ id: order.id, buyer: order.buyer, seller: order.seller, grossUsd: order.paymentAmountUsd, paypalFeeUsd: usdt(Number(order.paypal?.merchantFeeCents || 0)), netUsd: usdt(orderPaymentCents(order) - Number(order.paypal?.merchantFeeCents || 0)) })));
});

app.post("/api/admin/paypal-settlements/:orderId", (request, response) => {
  if (!adminAccount(request, response)) return;
  const convertedCents = toCents(request.body.convertedUsdt);
  const reference = paymentReference(request.body.reference);
  if (!convertedCents || !reference) return response.status(400).json({ error: "Indica el USDT recibido y una referencia válida." });
  const store = readStore();
  const order = store.orders.find(item => item.id === request.params.orderId && item.status === "awaiting_settlement" && item.paymentProvider === "paypal_live");
  if (!order) return response.status(404).json({ error: "Pago PayPal pendiente de liquidación no encontrado." });
  if (settlementReferenceUsed(store, reference.id)) return response.status(409).json({ error: "Esta referencia de liquidación ya fue usada." });
  const netUsdCents = orderPaymentCents(order) - Number(order.paypal?.merchantFeeCents || 0);
  if (!Number.isSafeInteger(netUsdCents) || netUsdCents <= 0) return response.status(400).json({ error: "El neto USD de PayPal no es válido para liquidar." });
  const effectiveConversionRate = convertedCents / netUsdCents;
  const conversionRate = Number(effectiveConversionRate.toFixed(8));
  const foundingSellerPromotion = foundingSellerPromotionAvailable(store, order);
  const commissionRate = foundingSellerPromotion ? 0 : Number(order.commissionRate ?? platformCommissionRate);
  if (!Number.isFinite(commissionRate) || commissionRate < 0 || commissionRate > 1) return response.status(400).json({ error: "La comisión del pedido no es válida." });
  const commissionCents = Math.round(convertedCents * commissionRate);
  const sellerNetCents = convertedCents - commissionCents;
  if (sellerNetCents < 0) return response.status(400).json({ error: "El importe convertido no es válido." });
  const wallet = sellerWallet(store, order.sellerId);
  const availableCents = Number(wallet.availableCents || 0);
  if (!Number.isSafeInteger(availableCents) || availableCents < 0 || !Number.isSafeInteger(availableCents + sellerNetCents)) return response.status(400).json({ error: "El saldo de la billetera no es válido." });
  wallet.availableCents = availableCents + sellerNetCents;
  const settledAt = new Date().toISOString();
  order.settlement = { grossUsd: order.paymentAmountUsd, paypalFeeUsd: usdt(Number(order.paypal?.merchantFeeCents || 0)), netUsd: usdt(netUsdCents), convertedUsdt: usdt(convertedCents), conversionRate, reference: reference.id, settledAt, settledBy: adminAccount(request, response).id };
  order.grossCents = convertedCents;
  order.commissionRate = commissionRate;
  order.commissionCents = commissionCents;
  order.commissionUsdt = usdt(commissionCents);
  order.sellerNetCents = sellerNetCents;
  order.sellerNetUsdt = usdt(sellerNetCents);
  if (foundingSellerPromotion) order.foundingSellerCommissionWaivedAt = settledAt;
  order.walletCreditedAt = settledAt;
  order.status = "awaiting_seller";
  order.updatedAt = settledAt;
  addNotification(store, order.sellerId, order.id, `La liquidación PayPal fue convertida y se acreditaron ${order.sellerNetUsdt.toFixed(2)} USDT en tu billetera. Ya puedes realizar la entrega.`);
  addNotification(store, order.buyerId, order.id, "La liquidación del pago fue completada. El vendedor ya puede realizar la entrega.");
  writeStore(store);
  response.json(orderWithProduct(store, order));
});

app.post("/api/admin/payments/:orderId/confirm", async (request, response) => {
  if (!adminAccount(request, response)) return;
  const store = readStore();
  const order = store.orders.find(item => item.id === request.params.orderId && item.status === "payment_submitted");
  if (!order) return response.status(404).json({ error: "Pago pendiente no encontrado." });
  if (!orderPaymentCents(order)) return response.status(409).json({ error: "El importe del pedido no es válido para confirmar el pago." });
  order.status = "awaiting_seller";
  order.paymentConfirmedAt = new Date().toISOString();
  order.updatedAt = order.paymentConfirmedAt;
  addNotification(store, order.sellerId, order.id, `El pago USDT del pedido ${order.id} fue confirmado manualmente. Ya puedes realizar la entrega.`);
  addNotification(store, order.buyerId, order.id, `Tu pago USDT del pedido ${order.id} fue confirmado manualmente. El vendedor fue avisado.`);
  writeStore(store);
  try { await sendOrderUpdateEmails(store, order, "payment"); } catch (error) { console.error("No se pudo enviar el recibo de pago manual:", error.message); }
  response.json(orderWithProduct(store, order));
});

app.get("/api/admin/withdrawals", (request, response) => {
  if (!adminAccount(request, response)) return;
  const store = readStore();
  response.json((store.withdrawals || []).filter(withdrawal => withdrawal.status === "requested").map(withdrawal => ({ ...withdrawal, seller: store.accounts.find(account => account.id === withdrawal.sellerId)?.name || "Vendedor no disponible" })));
});

app.post("/api/admin/withdrawals/:withdrawalId/:decision", (request, response) => {
  if (!adminAccount(request, response)) return;
  if (!["approve", "reject"].includes(request.params.decision)) return response.status(400).json({ error: "Acción no válida." });
  const store = readStore();
  const withdrawal = (store.withdrawals || []).find(item => item.id === request.params.withdrawalId && item.status === "requested");
  if (!withdrawal) return response.status(404).json({ error: "Retiro pendiente no encontrado." });
  const reference = paymentReference(request.body.transactionId);
  if (request.params.decision === "approve" && !reference) return response.status(400).json({ error: "Registra un hash TRC20 de 64 caracteres o la referencia numérica de una transferencia interna de Binance antes de aprobar el retiro." });
  if (request.params.decision === "approve" && payoutTransactionUsed(store, reference.id)) return response.status(409).json({ error: "Esta referencia ya fue usada para un retiro o reembolso." });
  const wallet = sellerWallet(store, withdrawal.sellerId);
  const grossCents = Number(withdrawal.grossCents);
  if (!Number.isSafeInteger(grossCents) || grossCents <= 0 || Number(wallet.pendingCents || 0) < grossCents) return response.status(409).json({ error: "El saldo retenido del retiro no es válido." });
  wallet.pendingCents -= grossCents;
  withdrawal.status = request.params.decision === "approve" ? "approved_manual_payout" : "rejected";
  withdrawal.updatedAt = new Date().toISOString();
  if (request.params.decision === "approve") {
    withdrawal.approvedAt = withdrawal.updatedAt;
    withdrawal.payoutTxId = reference.id;
    withdrawal.payoutReferenceType = reference.type;
    withdrawal.payoutNote = "Pago manual registrado después de enviar la transferencia mediante Binance.";
    addNotification(store, withdrawal.sellerId, "", `Tu retiro de ${usdt(grossCents).toFixed(2)} USDT fue aprobado como pago manual.`);
  } else {
    wallet.availableCents = Number(wallet.availableCents || 0) + grossCents;
    withdrawal.rejectedAt = withdrawal.updatedAt;
    addNotification(store, withdrawal.sellerId, "", `Tu retiro de ${usdt(grossCents).toFixed(2)} USDT fue rechazado y el saldo fue devuelto a tu billetera.`);
  }
  writeStore(store);
  response.json(withdrawal);
});

app.post("/api/admin/disputes/:orderId/resolve", (request, response) => {
  const admin = adminAccount(request, response);
  if (!admin) return;
  const { decision } = request.body;
  if (!["buyer", "seller"].includes(decision)) return response.status(400).json({ error: "Decisión no válida." });
  const store = readStore();
  const order = store.orders.find(item => item.id === request.params.orderId && item.status === "disputed");
  if (!order) return response.status(404).json({ error: "Disputa no encontrada." });
  if (!order.paymentConfirmedAt) return response.status(409).json({ error: "Solo se pueden resolver disputas de pedidos con pago confirmado manualmente." });
  const resolvedAt = new Date().toISOString();
  if (decision === "buyer") {
    const transactionId = typeof request.body.refundTransactionId === "string" ? request.body.refundTransactionId.trim().toLowerCase() : "";
    const refundCents = orderPaymentCents(order);
    if (!/^[a-f0-9]{64}$/.test(transactionId)) return response.status(400).json({ error: "Registra el hash TRC20 de reembolso de 64 caracteres antes de resolver a favor del comprador." });
    if (!refundCents) return response.status(409).json({ error: "El importe del pedido no es válido para registrar el reembolso." });
    if (payoutTransactionUsed(store, transactionId)) return response.status(409).json({ error: "Este hash ya fue usado para un retiro o reembolso." });
    // This record is only created while the order is disputed and is never edited afterwards.
    order.refund = { transactionId, amountCents: refundCents, amountUsdt: usdt(refundCents), currency: "USDT", network: "TRC20", paidAt: resolvedAt, recordedBy: admin.id };
  } else {
    const credit = creditSellerForOrder(store, order, resolvedAt);
    if (credit.error) return response.status(409).json({ error: credit.error });
  }
  order.status = decision === "buyer" ? "resolved_buyer" : "resolved_seller";
  order.resolvedAt = resolvedAt;
  order.resolution = decision;
  addNotification(store, order.buyerId, order.id, decision === "buyer" ? `La disputa ${order.id} fue resuelta a tu favor. Se registró el reembolso TRC20.` : `La disputa ${order.id} fue resuelta a favor del vendedor.`);
  addNotification(store, order.sellerId, order.id, decision === "seller" ? `La disputa ${order.id} fue resuelta a tu favor. Se acreditó tu billetera.` : `La disputa ${order.id} fue resuelta a favor del comprador.`);
  writeStore(store);
  response.json(order);
});

app.get("/api/admin/offers", (request, response) => {
  if (!adminAccount(request, response)) return;
  response.json(readStore().offers);
});

app.post("/api/admin/offers/:offerId/pause", (request, response) => {
  if (!adminAccount(request, response)) return;
  const store = readStore();
  const offer = store.offers.find(item => item.id === request.params.offerId);
  if (!offer) return response.status(404).json({ error: "Oferta no encontrada." });
  offer.paused = !offer.paused;
  writeStore(store);
  response.json(offer);
});

app.get("/api/notifications/recent", (request, response) => {
  const account = currentAccount(request);
  if (!account) return response.status(401).json({ error: "Inicia sesión para ver notificaciones." });
  response.json((readStore().notifications || []).filter(notification => notification.userId === account.id).slice(0, 5));
});

app.get("/api/offers", (request, response) => {
  response.json(readStore().offers.filter(offer => !offer.paused));
});

app.get("/api/seller/offers", (request, response) => {
  const account = currentAccount(request);
  if (!account || account.role !== "seller") return response.status(403).json({ error: "Inicia sesión como vendedor." });
  response.json(readStore().offers.filter(offer => offer.sellerId === account.id));
});

app.get("/api/seller/wallet", (request, response) => {
  const account = currentAccount(request);
  if (!account || account.role !== "seller") return response.status(403).json({ error: "Inicia sesión como vendedor." });
  const store = readStore();
  const wallet = sellerWallet(store, account.id);
  writeStore(store);
  const credits = store.orders.filter(order => order.sellerId === account.id && order.walletCreditedAt).map(order => ({ id: order.id, productTitle: order.productTitle, grossUsdt: order.grossUsdt ?? order.paymentAmountUsdt, commissionUsdt: order.commissionUsdt ?? 0, paypalMerchantFeeUsdt: order.paypalMerchantFeeUsdt ?? 0, netUsdt: order.sellerNetUsdt ?? 0, creditedAt: order.walletCreditedAt })).sort((a, b) => Date.parse(b.creditedAt) - Date.parse(a.creditedAt));
  response.json({ availableUsdt: usdt(Number(wallet.availableCents || 0)), pendingUsdt: usdt(Number(wallet.pendingCents || 0)), withdrawalAddress: wallet.withdrawalAddress || "", credits, withdrawals: (store.withdrawals || []).filter(withdrawal => withdrawal.sellerId === account.id).sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt)) });
});

app.put("/api/seller/wallet/address", (request, response) => {
  const account = currentAccount(request);
  const address = typeof request.body.address === "string" ? request.body.address.trim() : "";
  if (!account || account.role !== "seller") return response.status(403).json({ error: "Inicia sesión como vendedor." });
  if (!/^T[1-9A-HJ-NP-Za-km-z]{33}$/.test(address)) return response.status(400).json({ error: "Ingresa una dirección TRON TRC20 válida." });
  const store = readStore();
  const wallet = sellerWallet(store, account.id);
  wallet.withdrawalAddress = address;
  wallet.updatedAt = new Date().toISOString();
  writeStore(store);
  response.json({ withdrawalAddress: address });
});

app.post("/api/seller/wallet/withdrawals", (request, response) => {
  const account = currentAccount(request);
  if (!account || account.role !== "seller") return response.status(403).json({ error: "Inicia sesión como vendedor." });
  const grossCents = toCents(request.body.amount);
  if (!grossCents || grossCents < minimumWithdrawalUsdt * 100) return response.status(400).json({ error: `El retiro mínimo es ${minimumWithdrawalUsdt} USDT.` });
  const store = readStore();
  const wallet = sellerWallet(store, account.id);
  if (!/^T[1-9A-HJ-NP-Za-km-z]{33}$/.test(wallet.withdrawalAddress || "")) return response.status(400).json({ error: "Configura una dirección TRC20 válida antes de solicitar un retiro." });
  if (Number(wallet.availableCents || 0) < grossCents) return response.status(400).json({ error: "No tienes saldo disponible suficiente." });
  const feeCents = Math.max(Math.ceil(grossCents * withdrawalFeeRate), Math.round((withdrawalNetworkReserveUsdt + withdrawalMarginUsdt) * 100));
  if (grossCents <= feeCents) return response.status(400).json({ error: "El importe debe cubrir la tarifa estimada." });
  wallet.availableCents -= grossCents;
  wallet.pendingCents = Number(wallet.pendingCents || 0) + grossCents;
  store.withdrawals ??= [];
  const withdrawal = { id: crypto.randomUUID(), sellerId: account.id, grossCents, feeCents, netCents: grossCents - feeCents, address: wallet.withdrawalAddress, status: "requested", createdAt: new Date().toISOString() };
  store.withdrawals.unshift(withdrawal);
  writeStore(store);
  response.status(201).json(withdrawal);
});

app.post("/api/seller/verification", (request, response) => {
  const account = currentAccount(request);
  if (!account || account.role !== "seller") return response.status(403).json({ error: "Inicia sesión como vendedor." });
  if (!account.emailVerified) return response.status(403).json({ error: "Verifica tu correo antes de solicitar verificación de vendedor." });
  const store = readStore();
  const storedAccount = store.accounts.find(item => item.id === account.id);
  storedAccount.verificationRequested = true;
  writeStore(store);
  response.json(publicAccount(storedAccount));
});

app.post("/api/offers", (request, response) => {
  const account = currentAccount(request);
  if (!account || account.role !== "seller") {
    return response.status(403).json({ error: "Inicia sesión con una cuenta de vendedor para publicar." });
  }
  if (!account.emailVerified) return response.status(403).json({ error: "Verifica tu correo antes de publicar ofertas." });

  const { game, type, title, price, delivery } = request.body;
  const normalizedTitle = plainText(title, 1, 80);
  const normalizedDelivery = plainText(delivery, 1, 30);
  const priceCents = toCents(price);

  if (!allowedGames.has(game) || !allowedOfferTypes.has(type) || !normalizedTitle || !normalizedDelivery || !priceCents) {
    return response.status(400).json({ error: "Completa todos los datos de la oferta con un precio válido." });
  }

  const store = readStore();
  const offer = {
    id: crypto.randomUUID(),
    game: game.trim(),
    type: type.trim(),
    title: normalizedTitle,
    seller: account.name,
    rating: "Nuevo vendedor",
    delivery: normalizedDelivery,
    price: usdt(priceCents),
    priceCents,
    verified: account.verified,
    sellerId: account.id,
    paused: false
  };

  store.offers.unshift(offer);
  writeStore(store);
  response.status(201).json(offer);
});

app.patch("/api/offers/:offerId", (request, response) => {
  const account = currentAccount(request);
  const { title, price, delivery } = request.body;
  const normalizedTitle = plainText(title, 1, 80);
  const normalizedDelivery = plainText(delivery, 1, 30);
  const priceCents = toCents(price);
  const store = readStore();
  const offer = store.offers.find(item => item.id === request.params.offerId);
  if (!account || account.role !== "seller" || !offer || offer.sellerId !== account.id) return response.status(404).json({ error: "Oferta no encontrada." });
  if (!normalizedTitle || !normalizedDelivery || !priceCents) return response.status(400).json({ error: "Completa título, precio y entrega correctamente." });
  offer.title = normalizedTitle;
  offer.price = usdt(priceCents);
  offer.priceCents = priceCents;
  offer.delivery = normalizedDelivery;
  offer.updatedAt = new Date().toISOString();
  writeStore(store);
  response.json(offer);
});

app.post("/api/offers/:offerId/pause", (request, response) => {
  const account = currentAccount(request);
  const store = readStore();
  const offer = store.offers.find(item => item.id === request.params.offerId);
  if (!account || account.role !== "seller" || !offer || offer.sellerId !== account.id) return response.status(404).json({ error: "Oferta no encontrada." });
  offer.paused = !offer.paused;
  writeStore(store);
  response.json(offer);
});

app.delete("/api/offers/:offerId", (request, response) => {
  const account = currentAccount(request);
  const store = readStore();
  const index = store.offers.findIndex(item => item.id === request.params.offerId);
  const offer = store.offers[index];
  if (!account || account.role !== "seller" || !offer || offer.sellerId !== account.id) return response.status(404).json({ error: "Oferta no encontrada." });
  if (store.orders.some(order => order.offerId === offer.id)) return response.status(409).json({ error: "No puedes eliminar una oferta que ya tiene pedidos." });
  store.offers.splice(index, 1);
  writeStore(store);
  response.status(204).end();
});

app.get("/api/orders", (request, response) => {
  const account = currentAccount(request);
  if (!account) return response.status(401).json({ error: "Inicia sesión para ver tus pedidos." });
  const store = readStore();
  const orders = store.orders.filter(order => order.buyerId === account.id || order.sellerId === account.id).map(order => orderWithProduct(store, order));
  response.json(orders);
});

app.post("/api/orders", (request, response) => {
  const account = currentAccount(request);
  if (!account || account.role !== "buyer") {
    return response.status(403).json({ error: "Inicia sesión con una cuenta de comprador para solicitar una oferta." });
  }
  if (!account.emailVerified) return response.status(403).json({ error: "Verifica tu correo antes de crear un pedido." });

  const { offerId } = request.body;
  const store = readStore();
  const offer = store.offers.find(item => item.id === offerId);

  if (!offer || !offer.sellerId) {
    return response.status(404).json({ error: "Oferta no encontrada." });
  }
  if (offer.paused) return response.status(409).json({ error: "Esta oferta está pausada y no acepta pedidos." });

  if (offer.sellerId === account.id) {
    return response.status(400).json({ error: "No puedes solicitar tu propia oferta." });
  }

  const seller = store.accounts.find(item => item.id === offer.sellerId);

  const paymentAmountCents = storedCents(offer.priceCents) || toCents(offer.price);
  if (!paymentAmountCents) return response.status(409).json({ error: "El precio de la oferta no es válido para crear un pedido." });

  const order = {
    id: `GT-${crypto.randomUUID().slice(0, 8).toUpperCase()}`,
    offerId: offer.id,
    buyerId: account.id,
    buyer: account.name,
    sellerId: offer.sellerId,
    seller: offer.seller,
    amount: usdt(paymentAmountCents),
    currency: "USDT",
    paymentAmountUsdt: usdt(paymentAmountCents),
    paymentAmountCents,
    commissionRate: platformCommissionRate,
    foundingSeller: Boolean(seller?.foundingSeller),
    productTitle: offer.title,
    productGame: offer.game,
    productType: offer.type,
    productDelivery: offer.delivery,
    status: "awaiting_payment",
    createdAt: new Date().toISOString()
  };

  store.orders.unshift(order);
  store.messages ??= [];
  store.messages.unshift({ id: crypto.randomUUID(), orderId: order.id, senderId: account.id, sender: account.name, text: `Hola, solicité ${offer.title}. ¿Cuándo puedes realizar la entrega?`, createdAt: order.createdAt });
  addNotification(store, account.id, order.id, `Pedido ${order.id} creado. Envía ${order.paymentAmountUsdt.toFixed(2)} USDT por TRC20 y registra el hash de transacción.`);
  writeStore(store);
  response.status(201).json(orderWithProduct(store, order));
});

function participantOrder(request, response) {
  const store = readStore();
  const order = store.orders.find(item => item.id === request.params.orderId);
  const account = currentAccount(request);

  if (!account || !order || (order.buyerId !== account.id && order.sellerId !== account.id)) {
    response.status(404).json({ error: "Pedido no encontrado." });
    return null;
  }
  return { store, order, account };
}

app.get("/api/orders/:orderId/messages", (request, response) => {
  const participant = participantOrder(request, response);
  if (!participant) return;
  response.json(participant.store.messages?.filter(message => message.orderId === participant.order.id) || []);
});

app.post("/api/orders/:orderId/messages", (request, response) => {
  const participant = participantOrder(request, response);
  const text = plainText(request.body.text, 1, 1000);
  if (!participant) return;
  if (!text || text.length > 1000) return response.status(400).json({ error: "Escribe un mensaje de hasta 1000 caracteres." });

  const message = { id: crypto.randomUUID(), orderId: participant.order.id, senderId: participant.account.id, sender: participant.account.name, text, createdAt: new Date().toISOString() };
  participant.store.messages ??= [];
  participant.store.messages.push(message);
  addNotification(participant.store, participant.order.buyerId === participant.account.id ? participant.order.sellerId : participant.order.buyerId, participant.order.id, `Nuevo mensaje de ${participant.account.name}.`);
  writeStore(participant.store);
  response.status(201).json(message);
});

app.post("/api/orders/:orderId/deliver", async (request, response) => {
  const participant = participantOrder(request, response);
  if (!participant) return;
  if (participant.order.sellerId !== participant.account.id) {
    return response.status(403).json({ error: "Solo el vendedor puede marcar la entrega." });
  }
  if (participant.order.status !== "awaiting_seller") return response.status(400).json({ error: "El pedido no se puede actualizar." });
  participant.order.status = "delivered";
  participant.order.updatedAt = new Date().toISOString();
  participant.order.deliveredAt = participant.order.updatedAt;
  addNotification(participant.store, participant.order.buyerId, participant.order.id, `El vendedor marcó la entrega del pedido ${participant.order.id}. Revisa y confirma solo si recibiste lo acordado.`);
  writeStore(participant.store);
  try { await sendOrderUpdateEmails(participant.store, participant.order, "delivery"); } catch (error) { console.error("No se pudo enviar el aviso de entrega:", error.message); }
  response.json(orderWithProduct(participant.store, participant.order));
});

app.post("/api/orders/:orderId/payment", async (request, response) => {
  const participant = participantOrder(request, response);
  const reference = paymentReference(request.body.transactionId);
  if (!participant) return;
  if (participant.order.buyerId !== participant.account.id) return response.status(403).json({ error: "Solo el comprador puede registrar el pago." });
  if (participant.order.status !== "awaiting_payment") return response.status(400).json({ error: "El pedido no está esperando un pago." });
  if (!orderPaymentCents(participant.order)) return response.status(409).json({ error: "El importe del pedido no es válido para registrar el pago." });
  if (!reference) return response.status(400).json({ error: "Ingresa un hash TRC20 de 64 caracteres o la referencia numérica de una transferencia interna de Binance." });
  if (participant.store.orders.some(order => order.paymentTxId && order.paymentTxId.toLowerCase() === reference.id)) return response.status(409).json({ error: "Esta referencia de pago ya fue registrada." });
  participant.order.paymentTxId = reference.id;
  participant.order.paymentReferenceType = reference.type;
  participant.order.paymentSubmittedAt = new Date().toISOString();
  participant.order.updatedAt = participant.order.paymentSubmittedAt;
  participant.order.status = "payment_submitted";
  const admin = participant.store.accounts.find(isAdmin);
  if (admin) addNotification(participant.store, admin.id, participant.order.id, `Pago USDT enviado para ${participant.order.id}. Requiere confirmación manual.`);
  addNotification(participant.store, participant.order.buyerId, participant.order.id, `Tu referencia de pago fue enviada. Espera la verificación manual de administración.`);
  writeStore(participant.store);
  try { await sendAdminPaymentEmail(participant.order); } catch (error) { console.error("No se pudo enviar el aviso de pago al administrador:", error.message); }
  response.json(orderWithProduct(participant.store, participant.order));
});

app.post("/api/orders/:orderId/paypal/create", async (request, response) => {
  const participant = participantOrder(request, response);
  if (!participant) return;
  const environment = activePaypalEnvironment();
  if (!(environment === "live" ? paypalLiveEnabled : paypalSandboxEnabled)) return response.status(503).json({ error: "PayPal no está configurado." });
  if (participant.order.buyerId !== participant.account.id) return response.status(403).json({ error: "Solo el comprador puede iniciar el pago." });
  if (!participant.account.emailVerified) return response.status(403).json({ error: "Verifica tu correo antes de pagar." });
  if (participant.order.status !== "awaiting_payment") return response.status(400).json({ error: "El pedido no está esperando un pago." });
  const amountCents = orderPaymentCents(participant.order);
  if (!amountCents) return response.status(409).json({ error: "El importe del pedido no es válido para PayPal." });
  if (amountCents < minimumPaypalPaymentCents) return response.status(400).json({ error: `PayPal está disponible para pedidos desde ${usd(minimumPaypalPaymentCents)} USD.` });
  const buyerChargeCents = paypalBuyerChargeCents(amountCents);
  const preferCard = request.body?.method === "card";

  try {
    const state = crypto.randomUUID();
    const returnUrl = externalUrl(request, `/paypal-return.html?order=${encodeURIComponent(participant.order.id)}&state=${encodeURIComponent(state)}`);
    const paypalOrder = await paypalRequest(environment, "/v2/checkout/orders", {
      method: "POST",
      headers: { "PayPal-Request-Id": `gametrade-${participant.order.id}-${state}` },
      body: {
        intent: "CAPTURE",
        purchase_units: [{ reference_id: participant.order.id, custom_id: participant.order.id, description: `GameTrade ${participant.order.id}`, amount: { currency_code: "USD", value: usd(buyerChargeCents) } }],
        application_context: { brand_name: "GameTrade", landing_page: preferCard ? "GUEST_CHECKOUT" : "LOGIN", user_action: "PAY_NOW", shipping_preference: "NO_SHIPPING", return_url: returnUrl, cancel_url: `${returnUrl}&cancel=1` }
      }
    });
    const approval = paypalOrder.links?.find(link => link.rel === "payer-action" || link.rel === "approve")?.href;
    if (!paypalOrder.id || !approval) throw new Error("PayPal Sandbox no devolvió un enlace de aprobación.");
    participant.order.paypal = { environment, orderId: paypalOrder.id, state, baseAmountCents: amountCents, buyerChargeCents, processingFeeCents: buyerChargeCents - amountCents, feePaidBy: "buyer", createdAt: new Date().toISOString() };
    participant.order.updatedAt = participant.order.paypal.createdAt;
    writeStore(participant.store);
    response.json({ approvalUrl: approval });
  } catch (error) {
    console.error("No se pudo crear el pedido PayPal Sandbox:", error.message);
    response.status(502).json({ error: "No se pudo iniciar PayPal Sandbox. Intenta de nuevo." });
  }
});

app.post("/api/orders/:orderId/paypal/capture", async (request, response) => {
  const participant = participantOrder(request, response);
  if (!participant) return;
  if (!participant.order.paypal?.environment) return response.status(409).json({ error: "El pedido no tiene un pago PayPal activo." });
  if (participant.order.buyerId !== participant.account.id) return response.status(403).json({ error: "Solo el comprador puede confirmar este pago." });
  if (participant.order.status === "awaiting_seller" && participant.order.paypal?.captureId) return response.json(orderWithProduct(participant.store, participant.order));
  if (participant.order.status !== "awaiting_payment") return response.status(400).json({ error: "El pedido no está esperando un pago." });
  const paypal = participant.order.paypal;
  if (!paypal || !["sandbox", "live"].includes(paypal.environment) || request.body.state !== paypal.state || request.body.token !== paypal.orderId) return response.status(400).json({ error: "El retorno de PayPal no coincide con este pedido." });

  try {
    const paypalOrder = await paypalRequest(paypal.environment, `/v2/checkout/orders/${encodeURIComponent(paypal.orderId)}/capture`, { method: "POST", headers: { "PayPal-Request-Id": `gametrade-capture-${participant.order.id}` } });
    const verifiedPaypalOrder = await paypalRequest(paypal.environment, `/v2/checkout/orders/${encodeURIComponent(paypal.orderId)}`);
    const capture = paypalOrder.purchase_units?.[0]?.payments?.captures?.[0];
    const captureDetails = capture?.id ? await paypalRequest(paypal.environment, `/v2/payments/captures/${encodeURIComponent(capture.id)}`) : capture;
    const recorded = recordPaypalCapture(participant.store, participant.order, paypalOrder, verifiedPaypalOrder, captureDetails);
    if (recorded.error) return response.status(409).json({ error: `${recorded.error} El pedido seguirá pendiente.` });
    writeStore(participant.store);
    try { await sendOrderUpdateEmails(participant.store, participant.order, "payment"); } catch (error) { console.error("No se pudo enviar el recibo PayPal:", error.message); }
    response.json(orderWithProduct(participant.store, participant.order));
  } catch (error) {
    console.error("No se pudo capturar el pago PayPal Sandbox:", error.message);
    response.status(502).json({ error: "No se pudo confirmar PayPal Sandbox. Vuelve a Mis pedidos e inténtalo de nuevo." });
  }
});

app.post("/api/paypal/webhook", async (request, response) => {
  if ((!paypalSandboxEnabled || !paypalSandboxWebhookId) && (!paypalLiveEnabled || !paypalLiveWebhookId)) return response.status(503).json({ error: "Webhook PayPal no configurado." });
  try {
    let environment = null;
    for (const candidate of ["live", "sandbox"]) {
      if ((candidate === "live" ? paypalLiveEnabled && paypalLiveWebhookId : paypalSandboxEnabled && paypalSandboxWebhookId) && await paypalWebhookVerified(request, candidate)) { environment = candidate; break; }
    }
    if (!environment) return response.status(400).json({ error: "Firma de webhook PayPal inválida." });
    const store = readStore();
    store.paypalWebhookEvents ??= [];
    const eventId = typeof request.body.id === "string" ? request.body.id : "";
    if (!eventId) return response.status(400).json({ error: "Webhook PayPal sin identificador." });
    if (store.paypalWebhookEvents.some(event => event.id === eventId)) return response.status(204).end();
    if (request.body.event_type !== "PAYMENT.CAPTURE.COMPLETED") {
      store.paypalWebhookEvents.push({ id: eventId, type: request.body.event_type || "unknown", receivedAt: new Date().toISOString() });
      store.paypalWebhookEvents = store.paypalWebhookEvents.slice(-1000);
      writeStore(store);
      return response.status(204).end();
    }
    const paypalOrderId = request.body.resource?.supplementary_data?.related_ids?.order_id;
    const captureId = request.body.resource?.id;
    const order = store.orders.find(item => item.paypal?.orderId === paypalOrderId && item.paypal.environment === environment);
    if (!order || typeof captureId !== "string") {
      store.paypalWebhookEvents.push({ id: eventId, type: request.body.event_type, receivedAt: new Date().toISOString(), unmatched: true });
      store.paypalWebhookEvents = store.paypalWebhookEvents.slice(-1000);
      writeStore(store);
      return response.status(204).end();
    }
    if (order.paypal?.captureId === captureId) {
      store.paypalWebhookEvents.push({ id: eventId, type: request.body.event_type, receivedAt: new Date().toISOString() });
      store.paypalWebhookEvents = store.paypalWebhookEvents.slice(-1000);
      writeStore(store);
      return response.status(204).end();
    }
    if (order.status !== "awaiting_payment") return response.status(409).json({ error: "El pedido no admite esta captura PayPal." });
    const paypalOrder = await paypalRequest(environment, `/v2/checkout/orders/${encodeURIComponent(paypalOrderId)}`);
    const capture = paypalOrder.purchase_units?.[0]?.payments?.captures?.find(item => item.id === captureId);
    const recorded = recordPaypalCapture(store, order, paypalOrder, paypalOrder, capture);
    if (recorded.error) return response.status(409).json({ error: recorded.error });
    store.paypalWebhookEvents.push({ id: eventId, type: request.body.event_type, receivedAt: new Date().toISOString() });
    store.paypalWebhookEvents = store.paypalWebhookEvents.slice(-1000);
    writeStore(store);
    try { await sendOrderUpdateEmails(store, order, "payment"); } catch (error) { console.error("No se pudo enviar el recibo PayPal por webhook:", error.message); }
    response.status(204).end();
  } catch (error) {
    console.error("No se pudo procesar el webhook PayPal Sandbox:", error.message);
    response.status(502).json({ error: "No se pudo procesar el webhook PayPal Sandbox." });
  }
});

app.post("/api/orders/:orderId/confirm", async (request, response) => {
  const participant = participantOrder(request, response);
  if (!participant) return;
  if (participant.order.buyerId !== participant.account.id) {
    return response.status(403).json({ error: "Solo el comprador puede confirmar la recepción." });
  }
  if (participant.order.status !== "delivered") {
    return response.status(400).json({ error: "El pedido debe estar marcado como entregado antes de confirmarlo." });
  }
  const completedAt = new Date().toISOString();
  const credit = creditSellerForOrder(participant.store, participant.order, completedAt);
  if (credit.error) return response.status(409).json({ error: credit.error });
  participant.order.status = "completed";
  participant.order.completedAt = completedAt;
  participant.order.updatedAt = completedAt;
  addNotification(participant.store, participant.order.sellerId, participant.order.id, `El comprador confirmó la recepción del pedido ${participant.order.id}. Se acreditaron ${participant.order.sellerNetUsdt?.toFixed(2) || ""} USDT en tu billetera.`);
  writeStore(participant.store);
  try { await sendOrderUpdateEmails(participant.store, participant.order, "completed"); } catch (error) { console.error("No se pudo enviar el recibo de pedido completado:", error.message); }
  response.json(orderWithProduct(participant.store, participant.order));
});

app.post("/api/orders/:orderId/review", (request, response) => {
  const participant = participantOrder(request, response);
  const rating = Number(request.body.rating);
  const comment = plainText(request.body.comment, 3, 500);
  if (!participant) return;
  if (participant.order.buyerId !== participant.account.id) return response.status(403).json({ error: "Solo el comprador puede dejar una reseña." });
  if (participant.order.status !== "completed") return response.status(400).json({ error: "Puedes dejar una reseña después de completar el pedido." });
  if (!Number.isInteger(rating) || rating < 1 || rating > 5 || !comment) return response.status(400).json({ error: "Escribe una calificación de 1 a 5 y un comentario de 3 a 500 caracteres." });
  participant.store.reviews ??= [];
  if (participant.store.reviews.some(review => review.orderId === participant.order.id && review.buyerId === participant.account.id)) return response.status(409).json({ error: "Ya dejaste una reseña para este pedido." });
  const review = { id: crypto.randomUUID(), orderId: participant.order.id, sellerId: participant.order.sellerId, buyerId: participant.account.id, buyer: participant.account.name, rating, comment, createdAt: new Date().toISOString() };
  participant.store.reviews.unshift(review);
  addNotification(participant.store, participant.order.sellerId, participant.order.id, `Recibiste una reseña de ${participant.account.name}.`);
  writeStore(participant.store);
  response.status(201).json(review);
});

app.post("/api/orders/:orderId/dispute", (request, response) => {
  const participant = participantOrder(request, response);
  const reason = plainText(request.body.reason, 1, 1000);
  if (!participant) return;
  if (participant.order.buyerId !== participant.account.id) {
    return response.status(403).json({ error: "Solo el comprador puede abrir una disputa." });
  }
  if (!["awaiting_seller", "delivered"].includes(participant.order.status)) {
    return response.status(400).json({ error: "Este pedido no admite una disputa en su estado actual." });
  }
  if (Date.now() - Date.parse(participant.order.createdAt) < 30 * 60 * 1000) {
    return response.status(400).json({ error: "La disputa estará disponible 30 minutos después de crear el pedido." });
  }
  if (!reason || reason.length > 1000) {
    return response.status(400).json({ error: "Indica el motivo de la disputa en hasta 1000 caracteres." });
  }

  participant.order.status = "disputed";
  participant.order.dispute = { reason, openedAt: new Date().toISOString(), openedBy: participant.account.id };
  addNotification(participant.store, participant.order.sellerId, participant.order.id, `El comprador abrió una disputa en el pedido ${participant.order.id}.`);
  writeStore(participant.store);
  response.json(orderWithProduct(participant.store, participant.order));
});

// React Router owns all non-API routes once the Vite client has been built.
app.get("/{*splat}", (request, response, next) => {
  if (request.path.startsWith("/api")) return next();
  response.sendFile(path.join(clientBuildPath, "index.html"), error => {
    if (error) next(error);
  });
});

app.use((error, request, response, next) => {
  storage.failRequest(error);
  console.error("Error de GameTrade:", error.message);
  if (!response.headersSent) response.status(500).json({ error: "Ocurrió un error interno. Intenta de nuevo." });
});

async function startServer() {
  if (isProduction) {
    const required = ["DATABASE_URL", "ADMIN_EMAIL", "SMTP_HOST", "SMTP_USER", "SMTP_PASSWORD", "FROM_EMAIL", "USDT_TRC20_DEPOSIT_ADDRESS"];
    const missing = required.filter(name => !process.env[name]?.trim());
    if (missing.length) throw new Error(`Faltan secretos de producción: ${missing.join(", ")}`);
    if (!/^T[1-9A-HJ-NP-Za-km-z]{33}$/.test(depositAddress)) throw new Error("USDT_TRC20_DEPOSIT_ADDRESS no es una dirección TRC20 válida.");
    await storage.verify();
    await mailTransport.verify();
  }
  const listening = () => {
    console.log(`GameTrade disponible en http://localhost:${port}`);
  };
  if (isProduction) app.listen(port, "127.0.0.1", listening);
  else app.listen(port, listening);
}

if (require.main === module) {
  startServer().catch(error => {
    console.error("GameTrade no pudo iniciar:", error.message);
    process.exit(1);
  });
}

module.exports = { assignFoundingSeller, creditSellerForOrder, foundingSellerLimit, foundingSellerFreeSales };
