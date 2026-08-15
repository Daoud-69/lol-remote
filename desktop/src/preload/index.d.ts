import type { Api } from "./index.js";

declare global {
  interface Window {
    api: Api;
  }
}
