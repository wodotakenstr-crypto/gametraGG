const escapeHtml = value => String(value).replace(/[&<>"]|'/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" })[character]);
const sellerId = new URLSearchParams(window.location.search).get("id");
const profileStyles = document.createElement("link");
profileStyles.rel = "stylesheet";
profileStyles.href = "profile-market.css";
document.head.append(profileStyles);

function renderCommerce(seller, isSeller) {
  const section = document.createElement("section");
  section.className = "profile-commerce";
  if (!isSeller) {
    section.innerHTML = '<h2>Perfil de comprador</h2><p>La información de contacto y las compras se mantienen privadas. Las reseñas publicadas reflejan operaciones completadas.</p>';
  } else {
    const games = [...new Set(seller.activeOffers.map(offer => offer.game))];
    const offerCards = seller.activeOffers.length ? seller.activeOffers.map(offer => `<article class="profile-offer"><div><strong>${escapeHtml(offer.title)}</strong><span>${escapeHtml(offer.game)} · ${escapeHtml(offer.type)}${offer.verified ? " · Verificado" : ""}</span></div><b>${Number(offer.price).toFixed(2)} USDT</b><small>Entrega: ${escapeHtml(offer.delivery)}</small></article>`).join("") : '<p>Este vendedor no tiene ofertas activas en este momento.</p>';
    section.innerHTML = `<div class="profile-trust"><div><span>ESTADO DE CONFIANZA</span><strong>${seller.verified ? "Vendedor verificado" : "Vendedor con perfil público"}</strong><p>${seller.reviewCount ? `${seller.reviewCount} reseña${seller.reviewCount === 1 ? "" : "s"} de compras completadas.` : "Aún está construyendo reputación con sus primeras operaciones."}</p></div><div><span>JUEGOS Y CATEGORÍAS</span><p class="profile-tags">${games.length ? games.map(game => `<b>${escapeHtml(game)}</b>`).join("") : "Sin ofertas activas"}</p></div></div><div class="profile-offers-head"><h2>Ofertas activas</h2><a href="index.html#mercado">Ver mercado</a></div><div class="profile-offers">${offerCards}</div>`;
  }
  document.querySelector(".seller-stats").after(section);
}

async function loadSeller() {
  if (!sellerId) return window.location.href = "index.html#mercado";
  const response = await fetch(`/api/users/${encodeURIComponent(sellerId)}`);
  if (!response.ok) { document.querySelector("#sellerName").textContent = "Vendedor no encontrado"; document.querySelector("#reviews").innerHTML = "<p>Este perfil no está disponible.</p>"; return; }
  const seller = await response.json();
  document.title = `${seller.name} | GameTrade`;
  document.querySelector("#sellerName").textContent = seller.name;
  const isSeller = seller.role === "seller";
  document.querySelector("#profileLabel").textContent = isSeller ? "PERFIL DE VENDEDOR" : "PERFIL DE COMPRADOR";
  document.querySelector("#sellerMeta").textContent = `${isSeller ? seller.verified ? "Vendedor verificado" : "Vendedor" : "Comprador"} · Miembro desde ${new Date(seller.createdAt).toLocaleDateString()}`;
  document.querySelector("#tradeCount").textContent = seller.completedTrades;
  document.querySelector("#averageRating").textContent = seller.averageRating ? `${seller.averageRating}/5` : "-";
  document.querySelector("#ratingLabel").textContent = isSeller ? "calificación promedio" : "sin calificación";
  document.querySelector("#reviewCount").textContent = seller.reviewCount;
  document.querySelector("#reviewLabel").textContent = isSeller ? "reseñas verificadas" : "reseñas publicadas";
  renderCommerce(seller, isSeller);
  document.querySelector("#reviewsTitle").textContent = seller.reviewsLabel;
  document.querySelector("#reviews").innerHTML = seller.reviews.length ? seller.reviews.map(review => `<article class="review"><div class="review-head"><strong>${escapeHtml(review.author)}</strong><span class="stars">${"★".repeat(review.rating)}${"☆".repeat(5 - review.rating)}</span></div><p>${escapeHtml(review.comment)}</p><time>${escapeHtml(new Date(review.createdAt).toLocaleDateString())}</time></article>`).join("") : "<p>Aún no hay reseñas de pedidos completados.</p>";
}

loadSeller();
