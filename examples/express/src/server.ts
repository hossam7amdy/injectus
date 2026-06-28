import { promisify } from "node:util";

import { createApp } from "./app.ts";
import { Logger } from "./common/logger.ts";

const app = createApp();
const logger = app.resolve(Logger);

const server = app.listen(3000, () => {
  logger.info("listening on http://localhost:3000");
});

const closeServer = promisify(server.close.bind(server));

// Graceful shutdown: stop accepting connections, then dispose the root injector
// so app-lifetime singletons release their resources.
async function shutdown(signal: string): Promise<void> {
  logger.info(`\n${signal} received, shutting down`);
  await closeServer();
  await app.dispose();
  process.exit(0);
}

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));
