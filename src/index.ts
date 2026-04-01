import closeWithGrace from "close-with-grace";
import { startProxy } from "./startProxy.js";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const cwd = dirname(__dirname);
process.chdir(cwd);

const { close } = closeWithGrace(
  {
    delay: 500,
    logger: {
      error: (...args) => {
        console.error(...args);
      },
    },
  },
  async function ({ signal, err, manual }) {
    if (err) {
      console.error(err);
    } else {
      console.error(`Shutting down... Signal: ${signal}, Manual: ${manual}`);
    }
  },
);

startProxy().catch((err) => {
  console.error("Fatal:", err);
  close();
});
