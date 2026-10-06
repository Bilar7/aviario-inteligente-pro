import Alpine from "alpinejs";
import "./styles/tailwind.css";
import "./styles/theme.css";
import "./styles/auth.css";
import "./styles/components.css";
import "./styles/utilities.css";
import "./styles/responsive.css";
import { createAppState } from "./app/store.js";
import { APP_LOGO_PATH } from "./services/branding.js";
import * as exportsService from './services/exports.js';
import "./services/firebase.js";
import "./services/icons.js";
import "./services/i18n.js";

window.AVIARIO_LOGO = APP_LOGO_PATH;
window.ICONS.logo = '<img src="' + APP_LOGO_PATH + '" alt="" class="w-full h-full object-contain">';
const publicBaseUrl = new URL(import.meta.env.BASE_URL, location.href);
document.documentElement.style.setProperty('--aviary-background-image', 'url("' + new URL('assets/aviary-background.jpg', publicBaseUrl).href + '")');
const manifestLink = document.createElement('link');
manifestLink.rel = 'manifest';
manifestLink.href = new URL('manifest.json', publicBaseUrl).href;
document.head.appendChild(manifestLink);
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
window.exportSmartExcel = (...args) => Promise.resolve().then(() => exportsService.exportSmartExcel(...args));
window.exportDailyControlExcel = (...args) => Promise.resolve().then(() => exportsService.exportDailyControlExcel(...args));
window.exportFinanceExcel = (...args) => Promise.resolve().then(() => exportsService.exportFinanceExcel(...args));
window.generateProfessionalAviarioPDF = (...args) => Promise.resolve().then(() => exportsService.generateProfessionalAviarioPDF(...args));
window.generateSaleInvoicePDF = (...args) => Promise.resolve().then(() => exportsService.generateSaleInvoicePDF(...args));
window.generateFinanceReportPDF = (...args) => Promise.resolve().then(() => exportsService.generateFinanceReportPDF(...args));
window.generateOperationalArchivePDF = (...args) => Promise.resolve().then(() => exportsService.generateOperationalArchivePDF(...args));

// Não interceptar beforeinstallprompt: o navegador controla a apresentação da instalação.
window.addEventListener('appinstalled', () => {
  window.pwaInstalled = true;
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
  const hasPreviousController = Boolean(navigator.serviceWorker.controller);
  if (hasPreviousController) {
    let reloadingForWorkerUpdate = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (reloadingForWorkerUpdate) return;
      reloadingForWorkerUpdate = true;
      window.location.reload();
    });
  }
  navigator.serviceWorker.register('./sw.js', { scope: './', updateViaCache: 'none' })
    .then(registration => registration.update().catch(() => {}))
    .catch(() => {});
}
