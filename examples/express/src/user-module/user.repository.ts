import { inject } from "injectus";

import { Database } from "../common/database.ts";
import type { User } from "./user.model.ts";

export class UserRepository {
  #db = inject(Database);

  constructor() {
    this.#db.execute(
      "CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, name TEXT NOT NULL)",
    );
  }

  save(user: User): User {
    this.#db.execute("INSERT INTO users (id, name) VALUES (?, ?)", [
      user.id,
      user.name,
    ]);
    return user;
  }

  findAll(): User[] {
    return this.#db.query<User>("SELECT id, name FROM users ORDER BY id");
  }

  findById(id: string): User | null {
    const rows = this.#db.query<User>(
      "SELECT id, name FROM users WHERE id = ?",
      [id],
    );
    return rows.at(0) ?? null;
  }
}
