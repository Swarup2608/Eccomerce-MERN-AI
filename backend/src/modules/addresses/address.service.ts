import { Schema, model, trusted, type Types } from "mongoose";
import { z } from "zod";
import { HttpError } from "../../lib/http-error.js";

export const MAX_ADDRESSES = 10;

export const INDIAN_STATES = [
  "Andhra Pradesh", "Arunachal Pradesh", "Assam", "Bihar", "Chhattisgarh", "Goa", "Gujarat", "Haryana", "Himachal Pradesh", "Jharkhand", "Karnataka", "Kerala",
  "Madhya Pradesh", "Maharashtra", "Manipur", "Meghalaya", "Mizoram", "Nagaland", "Odisha", "Punjab", "Rajasthan", "Sikkim", "Tamil Nadu", "Telangana", "Tripura",
  "Uttar Pradesh", "Uttarakhand", "West Bengal", "Andaman and Nicobar Islands", "Chandigarh", "Dadra and Nagar Haveli and Daman and Diu", "Delhi", "Jammu and Kashmir",
  "Ladakh", "Lakshadweep", "Puducherry",
] as const;

export type IndianState = (typeof INDIAN_STATES)[number];

export interface IAddress {
  user: Types.ObjectId;
  fullName: string;
  // 10-digit Indian mobile number, stored without the +91 prefix.
  phone: string;
  line1: string;
  line2: string;
  landmark: string;
  city: string;
  state: IndianState;
  postalCode: string;
  country: "IN";
  isDefault: boolean;
  createdAt?: Date;
  updatedAt?: Date;
}

const addressSchema = new Schema<IAddress>(
  {
    user: { type: Schema.Types.ObjectId, ref: "User", required: true },
    fullName: { type: String, required: true, trim: true, maxlength: 80 },
    phone: { type: String, required: true, match: /^[6-9]\d{9}$/ },
    line1: { type: String, required: true, trim: true, maxlength: 120 },
    line2: { type: String, default: "", trim: true, maxlength: 120 },
    landmark: { type: String, default: "", trim: true, maxlength: 80 },
    city: { type: String, required: true, trim: true, maxlength: 60 },
    state: { type: String, enum: INDIAN_STATES, required: true },
    postalCode: { type: String, required: true, match: /^[1-9]\d{5}$/ },
    country: { type: String, enum: ["IN"], default: "IN", required: true },
    isDefault: { type: Boolean, default: false },
  },
  { timestamps: true, versionKey: false },
);

addressSchema.index({ user: 1, isDefault: -1, updatedAt: -1 });

export const Address = model<IAddress>("Address", addressSchema);

const text = (max: number) => z.string().trim().min(1).max(max);

export const addressInputSchema = z
  .object({
    fullName: text(80),
    phone: z.string().trim().transform((value) => value.replace(/[\s-]/g, "").replace(/^(\+91|0)/, "")).pipe(z.string().regex(/^[6-9]\d{9}$/, "Enter a 10-digit Indian mobile number")),
    line1: text(120),
    line2: z.string().trim().max(120).default(""),
    landmark: z.string().trim().max(80).default(""),
    city: text(60),
    state: z.enum(INDIAN_STATES, { message: "Choose a state or union territory" }),
    postalCode: z.string().trim().regex(/^[1-9]\d{5}$/, "Enter a 6-digit PIN code"),
    isDefault: z.boolean().default(false),
  })
  .strict();

export type AddressInput = z.infer<typeof addressInputSchema>;

export const updateAddressSchema = addressInputSchema.partial().strict();

export interface PublicAddress {
  id: string;
  fullName: string;
  phone: string;
  line1: string;
  line2: string;
  landmark: string;
  city: string;
  state: IndianState;
  postalCode: string;
  country: "IN";
  isDefault: boolean;
}

type AddressDoc = IAddress & { _id: Types.ObjectId };

export const toPublicAddress = (doc: AddressDoc): PublicAddress => ({
  id: doc._id.toString(),
  fullName: doc.fullName,
  phone: doc.phone,
  line1: doc.line1,
  line2: doc.line2,
  landmark: doc.landmark,
  city: doc.city,
  state: doc.state,
  postalCode: doc.postalCode,
  country: doc.country,
  isDefault: doc.isDefault,
});

const notFound = (): HttpError => new HttpError(404, "NOT_FOUND", "Address not found");

// Every query is scoped by the signed-in user, so one customer can never read or change another's addresses.
export class AddressService {
  async list(userId: string): Promise<PublicAddress[]> {
    const docs = await Address.find({ user: userId }).sort({ isDefault: -1, updatedAt: -1 }).lean<AddressDoc[]>();
    return docs.map(toPublicAddress);
  }

  async get(userId: string, id: string): Promise<PublicAddress> {
    const doc = await Address.findOne({ _id: id, user: userId }).lean<AddressDoc>();
    if (!doc) throw notFound();
    return toPublicAddress(doc);
  }

  async create(userId: string, input: AddressInput): Promise<PublicAddress> {
    const count = await Address.countDocuments({ user: userId });
    if (count >= MAX_ADDRESSES) throw new HttpError(422, "ADDRESS_LIMIT", `You can save at most ${MAX_ADDRESSES} addresses`);
    // The first address is always the default.
    const isDefault = input.isDefault || count === 0;
    const doc = await Address.create({ ...input, user: userId, isDefault });
    if (isDefault) await this.unsetOtherDefaults(userId, doc._id);
    return toPublicAddress(doc.toObject());
  }

  async update(userId: string, id: string, input: z.infer<typeof updateAddressSchema>): Promise<PublicAddress> {
    const current = await Address.findOne({ _id: id, user: userId }).lean<AddressDoc>();
    if (!current) throw notFound();
    // The default can only move to another address, not be switched off, so there is always one.
    const update = { ...input, isDefault: current.isDefault || input.isDefault === true };
    const doc = await Address.findOneAndUpdate({ _id: id, user: userId }, { $set: update }, { returnDocument: "after", runValidators: true }).lean<AddressDoc>();
    if (!doc) throw notFound();
    if (doc.isDefault && !current.isDefault) await this.unsetOtherDefaults(userId, doc._id);
    return toPublicAddress(doc);
  }

  async remove(userId: string, id: string): Promise<void> {
    const doc = await Address.findOneAndDelete({ _id: id, user: userId }).lean<AddressDoc>();
    if (!doc) throw notFound();
    if (doc.isDefault) {
      const next = await Address.findOne({ user: userId }).sort({ updatedAt: -1 }).lean<AddressDoc>();
      if (next) await Address.updateOne({ _id: next._id }, { $set: { isDefault: true } });
    }
  }

  private async unsetOtherDefaults(userId: string, keep: Types.ObjectId): Promise<void> {
    await Address.updateMany({ user: userId, _id: trusted({ $ne: keep }) }, { $set: { isDefault: false } });
  }
}
