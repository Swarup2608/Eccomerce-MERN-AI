import { AppError } from "../../errors/AppError.js";
import type { AuthenticatedActor } from "../../utils/actor.js";
import { escapeRegex, toObjectId } from "../../utils/ids.js";
import { buildPagination, skipFor } from "../../utils/pagination.js";
import { CategoryModel } from "../Category/category.model.js";
import { Product } from "../Product/product.model.js";
import { User } from "../User/user.model.js";
import { USER_ROLES, USER_STATUSES } from "../User/user.validation.js";
import { ONBOARDING_STATUSES } from "../Vendor/vendor.constants.js";
import { Vendor } from "../Vendor/vendor.model.js";
import { VendorOnboarding } from "../Vendor/vendorOnboarding.model.js";
import type { ListUsersQuery, UpdateUserRoleInput, UpdateUserStatusInput } from "./admin.validation.js";

const USER_FIELDS = "firstName lastName email userName phoneNumber role status emailVerified phoneVerified lastLoginAt createdAt";
const PRIVILEGED_ROLES: string[] = [USER_ROLES.ADMIN, USER_ROLES.SUPER_ADMIN];

export async function listUsers(query: ListUsersQuery) {
    const filter: Record<string, unknown> = {};

    if (query.role) filter.role = query.role;
    if (query.status) filter.status = query.status;
    if (query.search) {
        const pattern = { $regex: escapeRegex(query.search), $options: "i" };
        filter.$or = [{ email: pattern }, { userName: pattern }, { firstName: pattern }, { lastName: pattern }];
    }

    const [users, total] = await Promise.all([
        User.find(filter).select(USER_FIELDS).sort({ createdAt: -1 }).skip(skipFor(query.page, query.limit)).limit(query.limit).lean(),
        User.countDocuments(filter),
    ]);

    return { users, pagination: buildPagination(query.page, query.limit, total) };
}

export async function getUser(userId: string) {
    const user = await User.findById(toObjectId(userId)).select(USER_FIELDS).lean();

    if (!user) {
        throw new AppError("User not found.", 404, "USER_NOT_FOUND");
    }

    const vendor = await Vendor.findOne({ userId: user._id }).select("businessName status").lean();

    return { user, vendor };
}

// authenticate re-reads the user's status on every request and refresh does the
// same, so a suspension takes effect on the user's next request.
export async function updateUserStatus(actor: AuthenticatedActor, userId: string, input: UpdateUserStatusInput) {
    if (actor.userId === userId) {
        throw new AppError("You cannot change your own account status.", 403, "SELF_MODIFICATION_FORBIDDEN");
    }

    const target = await User.findById(toObjectId(userId)).select("role").lean();

    if (!target) {
        throw new AppError("User not found.", 404, "USER_NOT_FOUND");
    }

    // Only the Super Admin may change another administrator's status.
    if (PRIVILEGED_ROLES.includes(target.role) && actor.role !== USER_ROLES.SUPER_ADMIN) {
        throw new AppError("Only the Super Admin can change an administrator's status.", 403, "FORBIDDEN");
    }

    return User.findByIdAndUpdate(target._id, { $set: { status: input.status } }, { returnDocument: "after" }).select(USER_FIELDS).lean();
}

// Role changes are Super Admin only (enforced by the route).
export async function updateUserRole(actor: AuthenticatedActor, userId: string, input: UpdateUserRoleInput) {
    if (actor.userId === userId) {
        throw new AppError("You cannot change your own role.", 403, "SELF_MODIFICATION_FORBIDDEN");
    }

    const target = await User.findById(toObjectId(userId)).select("role").lean();

    if (!target) {
        throw new AppError("User not found.", 404, "USER_NOT_FOUND");
    }

    // A vendor's role follows their seller account; changing it here would desync them.
    if (target.role === USER_ROLES.VENDOR) {
        throw new AppError("Vendor roles are managed through the seller account.", 409, "VENDOR_ROLE_MANAGED");
    }

    return User.findByIdAndUpdate(target._id, { $set: { role: input.role } }, { returnDocument: "after" }).select(USER_FIELDS).lean();
}

async function countByField(model: typeof User | typeof Vendor | typeof Product, field: string) {
    const rows = await (model as typeof User).aggregate<{ _id: string; count: number }>([{ $group: { _id: `$${field}`, count: { $sum: 1 } } }]);
    return Object.fromEntries(rows.map((row) => [row._id, row.count]));
}

export async function getDashboardStats() {
    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const [usersByRole, usersByStatus, newUsers, vendorsByStatus, pendingApplications, productsByStatus, categories, recentApplications] = await Promise.all([
        countByField(User, "role"),
        countByField(User, "status"),
        User.countDocuments({ createdAt: { $gte: since } }),
        countByField(Vendor, "status"),
        VendorOnboarding.countDocuments({ status: ONBOARDING_STATUSES.SUBMITTED }),
        countByField(Product, "status"),
        CategoryModel.countDocuments({ isActive: true }),
        VendorOnboarding.find({ status: ONBOARDING_STATUSES.SUBMITTED }).sort({ submittedAt: 1 }).limit(5).populate("vendorId", "businessName businessType").lean(),
    ]);

    return {
        users: {
            total: Object.values(usersByStatus).reduce((sum, count) => sum + count, 0),
            active: usersByStatus[USER_STATUSES.ACTIVE] ?? 0,
            newLast30Days: newUsers,
            byRole: usersByRole,
        },
        vendors: { byStatus: vendorsByStatus, pendingApplications },
        catalog: { productsByStatus, activeCategories: categories },
        recentApplications,
    };
}
