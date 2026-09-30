document.getElementById("retry").addEventListener("click", () => location.reload());
window.addEventListener("online", () => {
  document.getElementById("connection-status").textContent = "Связь появилась. Нажмите «Попробовать снова», чтобы открыть приложение.";
});
