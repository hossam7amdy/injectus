import { randomUUID } from "node:crypto";

import { inject } from "injectus";

import { NotFoundError } from "../common/http-error.ts";
import { Logger } from "../common/logger.ts";
import type { User } from "./user.model.ts";
import { UserRepository } from "./user.repository.ts";

export class UserService {
  #logger = inject(Logger);
  #userRepo = inject(UserRepository);

  list(): User[] {
    return this.#userRepo.findAll();
  }

  getById(id: string): User {
    const user = this.#userRepo.findById(id);
    if (!user) {
      throw new NotFoundError(`User with ID "${id}" is not found`);
    }
    return user;
  }

  create(name: string): User {
    const user: User = { id: randomUUID(), name };
    this.#userRepo.save(user);
    this.#logger.info(`created user ${user.id}`);
    return user;
  }
}
