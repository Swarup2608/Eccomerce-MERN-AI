import { trusted, type Types } from "mongoose";
import { HttpError } from "../../lib/http-error.js";
import { escapeRegex, skipOf, toPage, type Page, type Pagination } from "../../lib/pagination.js";
import type { AuthService } from "../auth/auth.service.js";
import { Order } from "../orders/order.model.js";
import type { AdminOrder, OrderService } from "../orders/order.service.js";
import { User } from "../users/user.model.js";
import { USER_ROLES, USER_STATUSES, type UserStatus } from "../users/user.validation.js";

export interface CustomerSummary {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  userName: string;
  phoneNumber: string | null;
  status: UserStatus;
  emailVerified: boolean;
  createdAt: Date | undefined;
  lastLoginAt: Date | null;
}

export interface CustomerDetail extends CustomerSummary {
  orderCount: number;
  totalSpent: number;
  orders: AdminOrder[];
}

const toSummary = (doc: { _id: Types.ObjectId; firstName: string; lastName: string; email: string; userName: string; phoneNumber?: string; status: UserStatus; emailVerified: boolean; createdAt?: Date; lastLoginAt?: Date | null }): CustomerSummary => ({
  id: doc._id.toString(),
  firstName: doc.firstName,
  lastName: doc.lastName,
  email: doc.email,
  userName: doc.userName,
  phoneNumber: doc.phoneNumber ?? null,
  status: doc.status,
  emailVerified: doc.emailVerified,
  createdAt: doc.createdAt,
  lastLoginAt: doc.lastLoginAt ?? null,
});

// Read-mostly customer lookup for support; only customers (never admins) are listed or changed here.
export class CustomerAdminService {
  constructor(
    private readonly orders: OrderService,
    private readonly auth: AuthService,
  ) {}

  async list(query: Pagination & { q?: string; status?: UserStatus }): Promise<Page<CustomerSummary>> {
    const filter: Record<string, unknown> = { role: USER_ROLES.USER };
    if (query.status) filter.status = query.status;
    if (query.q) {
      const pattern = new RegExp(escapeRegex(query.q), "i");
      filter.$or = [{ email: trusted({ $regex: pattern }) }, { userName: trusted({ $regex: pattern }) }, { firstName: trusted({ $regex: pattern }) }, { lastName: trusted({ $regex: pattern }) }];
    }
    const [docs, total] = await Promise.all([User.find(filter).sort({ createdAt: -1 }).skip(skipOf(query)).limit(query.limit).lean(), User.countDocuments(filter)]);
    return toPage(docs.map(toSummary), total, query);
  }

  async get(id: string): Promise<CustomerDetail> {
    const doc = await User.findOne({ _id: id, role: USER_ROLES.USER }).lean();
    if (!doc) throw new HttpError(404, "NOT_FOUND", "Customer not found");
    const [totals] = await Order.aggregate<{ count: number; spent: number }>([
      { $match: { user: doc._id, status: { $nin: ["pending_payment", "cancelled"] } } },
      { $group: { _id: null, count: { $sum: 1 }, spent: { $sum: { $subtract: ["$pricing.total", "$payment.amountRefunded"] } } } },
    ]);
    return { ...toSummary(doc), orderCount: totals?.count ?? 0, totalSpent: totals?.spent ?? 0, orders: await this.orders.listForUser(id) };
  }

  // Suspending signs the customer out everywhere (AuthService.setUserStatus revokes their sessions).
  async setStatus(id: string, status: typeof USER_STATUSES.ACTIVE | typeof USER_STATUSES.SUSPENDED, actorId: string): Promise<CustomerDetail> {
    if (!(await User.exists({ _id: id, role: USER_ROLES.USER }))) throw new HttpError(404, "NOT_FOUND", "Customer not found");
    await this.auth.setUserStatus(id, status, { userId: actorId });
    return this.get(id);
  }
}
