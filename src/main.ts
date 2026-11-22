/** Entry point: starts the visualizer once the document is ready. */
import { Controller } from "./web/app/controller";

function start(): void {
  try {
    new Controller();
  } catch (error) {
    document.body.textContent = "Unable to start the score visualizer. Please reload the page.";
    throw error;
  }
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start, { once: true });
else start();
