import { Router } from "express";
import { objectId } from "../../lib/pagination.js";
import { currentUserId } from "../../middleware/authorize.js";
import type { OrderService } from "./order.service.js";
import { adminOrdersQuerySchema, cancelOrderSchema, checkoutSchema, customerOrdersQuerySchema, razorpayVerifySchema, refundSchema, updateStatusSchema } from "./order.validation.js";

// Mounted at /api/v1/orders behind the customer guard.
export function orderRoutes(service: OrderService): Router {
  const router = Router();
  router.get("/", async (req, res) => {
    res.json(await service.listForCustomer(currentUserId(res.locals), customerOrdersQuerySchema.parse(req.query)));
  });
  // Places the order from the signed-in customer's cart.
  router.post("/", async (req, res) => {
    const result = await service.checkout(currentUserId(res.locals), checkoutSchema.parse(req.body));
    res.status(201).json(result);
  });
  router.get("/:id", async (req, res) => {
    res.json({ order: await service.getForCustomer(currentUserId(res.locals), objectId(req.params.id, "Order")) });
  });
  router.post("/:id/pay", async (req, res) => {
    res.json(await service.pay(currentUserId(res.locals), objectId(req.params.id, "Order")));
  });
  router.post("/:id/payments/razorpay/verify", async (req, res) => {
    res.json({ order: await service.verifyRazorpay(currentUserId(res.locals), objectId(req.params.id, "Order"), razorpayVerifySchema.parse(req.body)) });
  });
  router.post("/:id/cancel", async (req, res) => {
    res.json({ order: await service.cancelByCustomer(currentUserId(res.locals), objectId(req.params.id, "Order"), cancelOrderSchema.parse(req.body).reason) });
  });
  return router;
}

// Mounted at /api/v1/admin/orders behind the admin guard.
export function adminOrderRoutes(service: OrderService): Router {
  const router = Router();
  router.get("/", async (req, res) => {
    res.json(await service.adminList(adminOrdersQuerySchema.parse(req.query)));
  });
  router.get("/:id", async (req, res) => {
    res.json({ order: await service.adminGet(objectId(req.params.id, "Order")) });
  });
  router.patch("/:id/status", async (req, res) => {
    res.json({ order: await service.updateStatus(objectId(req.params.id, "Order"), updateStatusSchema.parse(req.body), currentUserId(res.locals)) });
  });
  router.post("/:id/refund", async (req, res) => {
    res.json({ order: await service.refund(objectId(req.params.id, "Order"), refundSchema.parse(req.body), currentUserId(res.locals)) });
  });
  return router;
}
