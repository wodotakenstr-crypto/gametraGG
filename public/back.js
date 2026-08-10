document.querySelectorAll("[data-back]").forEach(button => {
  button.addEventListener("click", () => {
    if (window.history.length > 1) window.history.back();
    else window.location.href = "index.html";
  });
});
