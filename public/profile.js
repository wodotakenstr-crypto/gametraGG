let account;

function initials(name) {
  return name.split(" ").map(part => part[0]).join("").slice(0, 2).toUpperCase();
}

async function loadProfile() {
  const response = await fetch("/api/auth/me");
  if (!response.ok) return window.location.href = "account.html";
  account = await response.json();
  document.querySelector("#profileTitle").textContent = account.name;
  document.querySelector("#profileRole").textContent = account.role === "seller" ? "Vendedor" : "Comprador";
  document.querySelector("#walletLink").hidden = account.role !== "seller";
  document.querySelector("#avatar").textContent = initials(account.name);
  document.querySelector("#nameInput").value = account.name;
  document.querySelector("#emailInput").value = account.email;
  document.querySelector("#emailStatus").textContent = account.emailVerified ? "Correo verificado" : "Correo pendiente de verificación";
  document.querySelector("#roleInput").value = account.role === "seller" ? "Vendedor" : "Comprador";
  const statsResponse = await fetch("/api/profile/stats");
  if (statsResponse.ok) {
    const stats = await statsResponse.json();
    document.querySelector("#completedPurchases").textContent = stats.completedPurchases;
    document.querySelector("#completedSales").textContent = stats.completedSales;
    document.querySelector("#receivedReviews").textContent = stats.receivedReviews;
  }
}

document.querySelector("#profileForm").addEventListener("submit", async event => { event.preventDefault(); const response = await fetch("/api/profile", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: document.querySelector("#nameInput").value }) }); const result = await response.json(); if (!response.ok) { document.querySelector("#profileStatus").textContent = result.error; return; } document.querySelector("#profileStatus").textContent = "Perfil actualizado."; loadProfile(); });
document.querySelector("#logoutButton").addEventListener("click", async () => { await fetch("/api/auth/logout", { method: "POST" }); window.location.href = "index.html"; });
loadProfile();
