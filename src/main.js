import Alpine from "alpinejs";
import "./styles/tailwind.css";
import "./styles/theme.css";
import "./styles/auth.css";
import "./styles/components.css";
import "./styles/utilities.css";
import "./styles/responsive.css";
import { createAppState } from "./app/store.js";
import { exportSmartExcel, importSmartExcel, generateProfessionalAviarioPDF, generateSaleInvoicePDF } from "./services/exports.js";
import "./services/firebase.js";
import "./services/icons.js";
import "./services/i18n.js";

import html1 from './views/fragment_1.html?raw';
import html1b from './views/fragment_1b.html?raw';
import html2 from './views/fragment_2.html?raw';
import html3 from './views/fragment_3.html?raw';
import html4 from './views/fragment_4.html?raw';
import html5 from './views/fragment_5.html?raw';
import html6 from './views/fragment_6.html?raw';
import html7 from './views/fragment_7.html?raw';
import htmlInvoicePreview from './views/fragment_invoice_preview.html?raw';

const appRoot = document.getElementById("app-root");
const fragments = [
  html1,
  html1b,
  html2,
  html3,
  html4,
  html5,
  html6,
  html7,
  htmlInvoicePreview
].join("\n");
appRoot.innerHTML = fragments;

Alpine.data("aviarioApp", createAppState);
document.body.setAttribute("x-data", "aviarioApp()");
document.body.setAttribute("x-init", "init()");
window.aviarioApp = createAppState;
window.exportSmartExcel = exportSmartExcel;
window.importSmartExcel = importSmartExcel;
window.generateProfessionalAviarioPDF = generateProfessionalAviarioPDF;
window.generateSaleInvoicePDF = generateSaleInvoicePDF;

// PWA: guarda o pedido nativo de instalação quando o navegador o disponibiliza.
let deferredInstallPrompt = null;
window.pwaInstallAvailable = false;
window.addEventListener("beforeinstallprompt", (event) => {
  event.preventDefault();
  deferredInstallPrompt = event;
  window.pwaInstallAvailable = true;
  window.dispatchEvent(new CustomEvent("pwa-install-available", { detail: { available: true } }));
});

window.installAviarioPWA = async function () {
  if (!deferredInstallPrompt) {
    const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
    if (isIOS) {
      alert("Para instalar no iPhone/iPad: abra o menu Partilhar do Safari e escolha \"Adicionar ao Ecrã Principal\".");
    } else {
      alert("A instalação ainda não está disponível neste navegador. Abra o Aviário por HTTPS (por exemplo, pelo GitHub Pages) e use o menu do navegador para instalar a aplicação.");
    }
    return false;
  }

  deferredInstallPrompt.prompt();
  const choice = await deferredInstallPrompt.userChoice;
  deferredInstallPrompt = null;
  window.pwaInstallAvailable = false;
  window.dispatchEvent(new CustomEvent("pwa-install-available", { detail: { available: false, outcome: choice && choice.outcome } }));
  return choice && choice.outcome === "accepted";
};

window.addEventListener("appinstalled", () => {
  deferredInstallPrompt = null;
  window.pwaInstallAvailable = false;
  window.dispatchEvent(new CustomEvent("pwa-install-available", { detail: { available: false, installed: true } }));
});

if (location.protocol !== "http:" && location.protocol !== "https:") {
  const w = document.getElementById("file-protocol-warning");
  if (w) w.hidden = false;
}

Alpine.start();
const boot = document.getElementById("boot-screen");
if (boot) boot.remove();

if ("serviceWorker" in navigator && import.meta.env.PROD) {
  navigator.serviceWorker.register("./sw.js", { updateViaCache: "none" }).catch(() => {});
}
