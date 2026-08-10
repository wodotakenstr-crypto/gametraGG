let account;

async function loadAccount() {
  const response = await fetch("/api/auth/me");
  if (!response.ok) return window.location.href = "account.html";
  account = await response.json();
  if (account.emailVerified) return window.location.href = account.role === "seller" ? "index.html#vender" : "index.html#mercado";
  document.querySelector("#emailText").textContent = `Enviamos un código a ${account.email}`;
}

document.querySelector("#verifyForm").addEventListener("submit", async event => { event.preventDefault(); const response = await fetch("/api/auth/verify-email", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code: document.querySelector("#codeInput").value }) }); const result = await response.json(); if (!response.ok) { document.querySelector("#status").textContent = result.error; return; } window.location.href = result.role === "seller" ? "index.html#vender" : "index.html#mercado"; });
document.querySelector("#resendButton").addEventListener("click", async () => { const response = await fetch("/api/auth/resend-verification", { method: "POST" }); const result = await response.json(); document.querySelector("#status").textContent = response.ok ? result.smtpConfigured ? "Código reenviado." : "El correo SMTP aún no está configurado." : result.error; });
loadAccount();
