import type { RequestHandler } from "express";
import { currentUserId } from "../../middleware/authorize.js";
import { objectId, slugSchema } from "../../lib/pagination.js";
import type { CategoryService } from "./category.service.js";
import { createCategorySchema, updateCategorySchema } from "./category.validation.js";

export interface CategoryController {
  tree: RequestHandler;
  bySlug: RequestHandler;
  adminList: RequestHandler;
  adminGet: RequestHandler;
  create: RequestHandler;
  update: RequestHandler;
  remove: RequestHandler;
}

export function createCategoryController(service: CategoryService): CategoryController {
  return {
    tree: async (_req, res) => {
      res.json({ categories: await service.tree() });
    },

    bySlug: async (req, res) => {
      res.json({ category: await service.getActiveBySlug(slugSchema.parse(req.params.slug)) });
    },

    adminList: async (_req, res) => {
      res.json({ categories: await service.list(), tree: await service.tree({ includeInactive: true }) });
    },

    adminGet: async (req, res) => {
      res.json({ category: await service.getById(objectId(req.params.id, "Category")) });
    },

    create: async (req, res) => {
      res.status(201).json({ category: await service.create(createCategorySchema.parse(req.body), currentUserId(res.locals)) });
    },

    update: async (req, res) => {
      res.json({ category: await service.update(objectId(req.params.id, "Category"), updateCategorySchema.parse(req.body), currentUserId(res.locals)) });
    },

    remove: async (req, res) => {
      await service.remove(objectId(req.params.id, "Category"), currentUserId(res.locals));
      res.status(204).end();
    },
  };
}
