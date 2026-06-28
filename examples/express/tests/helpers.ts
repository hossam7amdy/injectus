import { once } from "node:events";
import type { AddressInfo } from "node:net";
import { promisify } from "node:util";

import { createAppInjector } from "../src/app.injector.ts";
import { type Application, createApp } from "../src/app.ts";
import { Logger } from "../src/common/logger.ts";

const silentLogger: Logger = {
  info() {},
  error() {},
};

export interface TestApp extends Application, AsyncDisposable {
  readonly url: string;
}

export async function startApp(): Promise<TestApp> {
  const injector = createAppInjector([
    { provide: Logger, useValue: silentLogger },
  ]);
  const app = createApp(injector);

  const host = "127.0.0.1";
  const server = app.listen(0, host);
  await once(server, "listening");
  const { port } = server.address() as AddressInfo;

  return Object.assign(app, {
    url: `http://${host}:${port}`,
    async [Symbol.asyncDispose]() {
      // Drop undici keep-alive sockets so close() resolves promptly.
      server.closeAllConnections();
      await promisify(server.close.bind(server))();
      await app.dispose();
    },
  });
}
