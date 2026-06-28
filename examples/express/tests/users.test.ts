import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { User } from "../src/user-module/user.model.ts";
import { UserRepository } from "../src/user-module/user.repository.ts";
import { startApp, type TestApp } from "./helpers.ts";

const HOSSAM: User = { id: "1", name: "Hossam Hamdy" };
const AHMED: User = { id: "2", name: "Ahmed Hamdy" };

const seedUsers = (app: TestApp, users: User[]) => {
  const repo = app.resolve(UserRepository);
  for (const user of users) repo.save(user);
};

const jsonPost = (body: unknown): RequestInit => ({
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify(body),
});

describe("users routes", { concurrency: true, timeout: 500 }, () => {
  it("GET /users returns the users list", async () => {
    await using app = await startApp();
    seedUsers(app, [HOSSAM, AHMED]);

    const res = await fetch(`${app.url}/users`);

    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), [HOSSAM, AHMED]);
  });

  it("GET /users/:id returns the matching user", async () => {
    await using app = await startApp();
    seedUsers(app, [AHMED]);

    const res = await fetch(`${app.url}/users/2`);

    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), AHMED);
  });

  it("GET /users/:id returns 404 for a missing user", async () => {
    await using app = await startApp();

    const res = await fetch(`${app.url}/users/999`);

    assert.equal(res.status, 404);
    const body = (await res.json()) as { message: string };
    assert.match(body.message, /999/);
  });

  it("POST /users creates a user that a later GET returns", async () => {
    await using app = await startApp();

    const res = await fetch(`${app.url}/users`, jsonPost({ name: "Grace" }));
    assert.equal(res.status, 201);
    const created = (await res.json()) as User;
    assert.equal(created.name, "Grace");
    assert.ok(created.id);

    const list = (await (await fetch(`${app.url}/users`)).json()) as User[];
    assert.ok(list.some((user) => user.id === created.id));
  });

  it("POST /users returns 400 for a missing or blank name", async () => {
    await using app = await startApp();

    const res = await fetch(`${app.url}/users`, jsonPost({ name: "   " }));

    assert.equal(res.status, 400);
    const body = (await res.json()) as { message: string };
    assert.ok(body.message);
  });

  it("POST /users returns 500 when JSON body parsing fails", async () => {
    await using app = await startApp();

    const res = await fetch(`${app.url}/users`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{ not json",
    });

    assert.equal(res.status, 500);
    const body = (await res.json()) as { message: string };
    assert.ok(body.message);
  });
});
