import { Router } from "express";

import { UserService } from "./user.service.ts";

const usersRouter = Router();

usersRouter.get("/", (req, res) => {
  const service = req.scope.resolve(UserService);
  res.json(service.list());
});

usersRouter.get("/:id", (req, res) => {
  const service = req.scope.resolve(UserService);
  res.json(service.getById(req.params.id));
});

usersRouter.post("/", (req, res) => {
  const service = req.scope.resolve(UserService);
  res.status(201).json(service.create(req.body?.name));
});

export { usersRouter };
