import { Router } from "express";
import { objectId } from "../../lib/pagination.js";
import { currentUserId } from "../../middleware/authorize.js";
import { addressInputSchema, updateAddressSchema, type AddressService } from "./address.service.js";

// Mounted at /api/v1/addresses behind the customer guard.
export function addressRoutes(service: AddressService): Router {
  const router = Router();
  router.get("/", async (_req, res) => {
    res.json({ addresses: await service.list(currentUserId(res.locals)) });
  });
  router.post("/", async (req, res) => {
    res.status(201).json({ address: await service.create(currentUserId(res.locals), addressInputSchema.parse(req.body)) });
  });
  router.patch("/:id", async (req, res) => {
    res.json({ address: await service.update(currentUserId(res.locals), objectId(req.params.id, "Address"), updateAddressSchema.parse(req.body)) });
  });
  router.delete("/:id", async (req, res) => {
    await service.remove(currentUserId(res.locals), objectId(req.params.id, "Address"));
    res.status(204).end();
  });
  return router;
}
