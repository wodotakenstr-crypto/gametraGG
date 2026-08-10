let idleLimit = 5 * 60 * 1000;
let lastActivity = Date.now();
let idleTimer;

async function endIdleSession() {
  await fetch("/api/auth/logout", { method: "POST" }).catch(() => {});
  window.location.href = "account.html?reason=inactive";
}

function checkIdleTime() {
  const remaining = idleLimit - (Date.now() - lastActivity);
  if (remaining <= 0) {
    endIdleSession();
    return;
  }
  window.clearTimeout(idleTimer);
  idleTimer = window.setTimeout(checkIdleTime, remaining);
}

function registerActivity() {
  lastActivity = Date.now();
  checkIdleTime();
}

["pointerdown", "pointermove", "keydown", "touchstart", "scroll"].forEach(event => {
  document.addEventListener(event, registerActivity, { passive: true });
});
document.addEventListener("visibilitychange", () => { if (!document.hidden) checkIdleTime(); });
fetch("/api/auth/me").then(response => response.ok ? response.json() : null).then(account => {
  if (account?.isAdmin) idleLimit = 60 * 60 * 1000;
  checkIdleTime();
}).catch(checkIdleTime);
