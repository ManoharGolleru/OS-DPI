/* ------------------------------------------------------------------
   PWA helper – registers the Service Worker once and lets the app
   poke it for updates.  ONLY referenced from start.js
------------------------------------------------------------------- */

import { html } from "uhtml";
import "css/serviceWorker.css";

/** @type {ServiceWorkerRegistration | undefined} */
let registration;

/* ── API called from start.js after every render ──────────────── */
export function workerCheckForUpdate() {
  registration?.update().catch(console.error);
}

/* ── internal ─────────────────────────────────────────────────── */
function showUpdateButton() {
  document.body.classList.add("update-available");
}

if (import.meta.env.PROD && "serviceWorker" in navigator) {
  window.addEventListener("load", async () => {
    try {
      /*  ABSOLUTE path avoids /session/<id>/service-worker.js mistakes */
      registration = await navigator.serviceWorker.register("/service-worker.js", {
        scope: "/",               // may control the whole origin
      });

      /* missed-event safety net */
      if (registration.waiting) showUpdateButton();

      registration.addEventListener("updatefound", () => {
        const sw = registration.installing;
        if (sw)
          sw.addEventListener("statechange", () => {
            if (registration.waiting && navigator.serviceWorker.controller) {
              showUpdateButton();
            }
          });
      });

      navigator.serviceWorker.addEventListener("controllerchange", () => {
        window.location.reload();
      });
    } catch (err) {
      console.error("SW registration failed:", err);
    }
  });
}

/* ── optional UI element ──────────────────────────────────────── */
export function workerUpdateButton() {
  return html`<button
    id="update-available-button"
    @click=${() => {
      if (registration?.waiting) registration.waiting.postMessage("SKIP_WAITING");
    }}
    title="Click to update the app"
  >
    Update
  </button>`;
}
