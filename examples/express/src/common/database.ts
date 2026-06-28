import {
  DatabaseSync,
  type SQLInputValue,
  type StatementResultingChanges,
} from "node:sqlite";

import { inject } from "injectus";

import { Logger } from "./logger.ts";

export class Database implements Disposable {
  #db = new DatabaseSync(":memory:");
  #logger = inject(Logger);

  query<T>(sql: string, params?: SQLInputValue[]): T[] {
    return this.#db.prepare(sql).all(...(params ?? [])) as T[];
  }

  execute(sql: string, params?: SQLInputValue[]): StatementResultingChanges {
    return this.#db.prepare(sql).run(...(params ?? []));
  }

  [Symbol.dispose](): void {
    this.#db.close();
    this.#logger.info("database connection closed");
  }
}
