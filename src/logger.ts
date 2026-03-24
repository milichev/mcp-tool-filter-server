import pino, { destination, Logger } from "pino";
import pretty from "pino-pretty";
import * as packageJson from "../package.json" with { type: "json" };
import { getConfig } from "./config.js";

let logger: Logger | undefined;

export function getLogger() {
  if (!logger) {
    const { logLevel, isDev } = getConfig();
    const destination = pino.destination(2); // Always stderr

    const transport = isDev
      ? pretty({
          destination,
          colorize: true,
          translateTime: "SYS:standard",
          ignore: "pid,hostname",
        })
      : pino.transport({
          target: "pino/file",
        });

    logger = pino(
      {
        level: logLevel ?? "info",
        base: { service: packageJson.default.name },
      },
      transport,
    );
  }
  return logger;
}
