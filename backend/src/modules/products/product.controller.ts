import type { RequestHandler } from "express";
import { z } from "zod";
import { currentUserId } from "../../middleware/authorize.js";
import { objectId, slugSchema } from "../../lib/pagination.js";
import type { ProductService } from "./product.service.js";
import { adminProductQuerySchema, createProductSchema, parseProductListQuery, setStatusSchema, setStockSchema, updateProductSchema } from "./product.validation.js";

export interface ProductController {
  list: RequestHandler;
  facets: RequestHandler;
  bySlug: RequestHandler;
  adminList: RequestHandler;
  adminGet: RequestHandler;
  create: RequestHandler;
  update: RequestHandler;
  setStatus: RequestHandler;
  setStock: RequestHandler;
  remove: RequestHandler;
}

const skuParam = z.string().trim().toUpperCase().regex(/^[A-Z0-9][A-Z0-9_-]{1,63}$/);

export function createProductController(service: ProductService, hasOrders: (productId: string) => Promise<boolean>): ProductController {
  return {
    list: async (req, res) => {
      res.json(await service.list(parseProductListQuery(req.query)));
    },

    facets: async (req, res) => {
      res.json(await service.facets(parseProductListQuery(req.query)));
    },

    bySlug: async (req, res) => {
      res.json({ product: await service.getActiveBySlug(slugSchema.parse(req.params.slug)) });
    },

    adminList: async (req, res) => {
      res.json(await service.adminList(adminProductQuerySchema.parse(req.query)));
    },

    adminGet: async (req, res) => {
      res.json({ product: await service.adminGet(objectId(req.params.id, "Product")) });
    },

    create: async (req, res) => {
      res.status(201).json({ product: await service.create(createProductSchema.parse(req.body), currentUserId(res.locals)) });
    },

    update: async (req, res) => {
      res.json({ product: await service.update(objectId(req.params.id, "Product"), updateProductSchema.parse(req.body), currentUserId(res.locals)) });
    },

    setStatus: async (req, res) => {
      res.json({ product: await service.setStatus(objectId(req.params.id, "Product"), setStatusSchema.parse(req.body).status, currentUserId(res.locals)) });
    },

    setStock: async (req, res) => {
      const sku = skuParam.parse(req.params.sku);
      res.json({ product: await service.setStock(objectId(req.params.id, "Product"), sku, setStockSchema.parse(req.body), currentUserId(res.locals)) });
    },

    remove: async (req, res) => {
      res.json(await service.remove(objectId(req.params.id, "Product"), currentUserId(res.locals), hasOrders));
    },
  };
}
