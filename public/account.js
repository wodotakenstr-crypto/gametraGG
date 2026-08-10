async function submitAccount(form, endpoint, statusId) {
  const status = document.querySelector(statusId);
  const response = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(Object.fromEntries(new FormData(form))) });
  const result = await response.json();
  if (!response.ok) {
    status.textContent = result.error;
    return;
  }
  if (!result.emailVerified) {
    window.location.href = "verify-email.html";
    return;
  }
  window.location.href = result.role === "seller" ? "index.html#vender" : "index.html#mercado";
}

const inactiveMessage = new URLSearchParams(window.location.search).get("reason") === "inactive";
if (inactiveMessage) document.querySelector("#loginStatus").textContent = "Tu sesión se cerró después de 5 minutos sin actividad.";
if (new URLSearchParams(window.location.search).get("role") === "seller") document.querySelector('#registerForm select[name="role"]').value = "seller";
document.querySelector("#loginForm").addEventListener("submit", event => { event.preventDefault(); submitAccount(event.currentTarget, "/api/auth/login", "#loginStatus"); });
document.querySelector("#registerForm").addEventListener("submit", event => { event.preventDefault(); submitAccount(event.currentTarget, "/api/auth/register", "#registerStatus"); });
