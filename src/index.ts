import { startProxy } from "./startProxy.js";

startProxy().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
