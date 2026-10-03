import Alpine from "alpinejs";
import "./styles/tailwind.css";
import "./styles/theme.css";
import "./styles/auth.css";
import "./styles/components.css";
import "./styles/utilities.css";
import "./styles/responsive.css";
import { createAppState } from "./app/store.js";
import { exportSmartExcel, importSmartExcel, generateProfessionalAviarioPDF, generateSaleInvoicePDF, generateFinanceReportPDF } from "./services/exports.js";
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
window.generateFinanceReportPDF = generateFinanceReportPDF;

// PWA: mantém o pedido nativo de instalação, o botão visível e a instrução correta para iOS/Android/PC.
let deferredInstallPrompt = null;
const pwaStandalone = () => {
  return (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) || window.navigator.standalone === true;
};

window.pwaInstallAvailable = false;
window.pwaInstalled = pwaStandalone();

const notifyPwaState = function(detail) {
  var payload = {
    available: !!(detail && detail.available),
    installed: !!(detail && detail.installed),
    outcome: detail && detail.outcome ? detail.outcome : null
  };
  window.dispatchEvent(new CustomEvent("pwa-install-available", { detail: payload }));
};

window.addEventListener("beforeinstallprompt", (event) => {
  event.preventDefault();
  deferredInstallPrompt = event;
  if (!window.pwaInstalled) {
    window.pwaInstallAvailable = true;
    notifyPwaState({ available: true, installed: false });
  }
});

window.installAviarioPWA = async function () {
  if (window.pwaInstalled || pwaStandalone()) {
    window.pwaInstalled = true;
    window.pwaInstallAvailable = false;
    notifyPwaState({ available: false, installed: true });
    return true;
  }

  if (!deferredInstallPrompt) {
    const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
    const isAndroid = /android/i.test(navigator.userAgent);
    if (isIOS) {
      alert("Para instalar o Aviário Inteligente Pro no iPhone/iPad: no Safari toque em Partilhar e escolha «Adicionar ao Ecrã Principal».");
    } else if (isAndroid) {
      alert("Para instalar o Aviário Inteligente Pro: abra o endereço oficial por HTTPS no Chrome e escolha «Instalar aplicação» ou «Adicionar ao ecrã principal» no menu ⋮. Se esta opção não aparecer, actualize a página e confirme que está no endereço oficial HTTPS.");
    } else {
      alert("Para instalar o Aviário Inteligente Pro: abra o endereço oficial por HTTPS no Chrome ou Edge e escolha «Instalar Aviário Pro» na barra de endereço ou «Instalar aplicação» no menu do navegador.");
    }
    return false;
  }

  try {
    deferredInstallPrompt.prompt();
    const choice = await deferredInstallPrompt.userChoice;
    deferredInstallPrompt = null;
    window.pwaInstallAvailable = false;
    if (choice && choice.outcome === "accepted") {
      window.pwaInstalled = true;
    }
    notifyPwaState({ available: false, outcome: choice && choice.outcome, installed: window.pwaInstalled });
    return choice && choice.outcome === "accepted";
  } catch (err) {
    deferredInstallPrompt = null;
    window.pwaInstallAvailable = false;
    notifyPwaState({ available: false, installed: false });
    return false;
  }
};

window.addEventListener("appinstalled", () => {
  deferredInstallPrompt = null;
  window.pwaInstallAvailable = false;
  window.pwaInstalled = true;
  notifyPwaState({ available: false, installed: true });
});

if (location.protocol !== "http:" && location.protocol !== "https:") {
  const w = document.getElementById("file-protocol-warning");
  if (w) w.hidden = false;
}

Alpine.start();
const boot = document.getElementById("boot-screen");
if (boot) boot.remove();

const canRegisterServiceWorker = "serviceWorker" in navigator && location.protocol !== "file:" && (location.protocol === "https:" || location.hostname === "localhost" || location.hostname === "127.0.0.1");
if (canRegisterServiceWorker) {
  navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" }).catch(() => {});
}
