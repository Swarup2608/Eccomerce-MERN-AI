import { Schema, model, type Types } from "mongoose";

export const UPLOAD_STATUSES = ["pending", "attached"] as const;

export type UploadStatus = (typeof UPLOAD_STATUSES)[number];

// One presigned upload. It stays "pending" until a product references it; pending ones older than a day are removed
// from the bucket by `npm run cleanup:uploads`.
export interface IUpload {
  key: string;
  contentType: string;
  size: number;
  uploadedBy: Types.ObjectId;
  status: UploadStatus;
  createdAt?: Date;
  updatedAt?: Date;
}

const uploadSchema = new Schema<IUpload>(
  {
    key: { type: String, required: true },
    contentType: { type: String, required: true },
    size: { type: Number, required: true, min: 1 },
    uploadedBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
    status: { type: String, enum: UPLOAD_STATUSES, default: "pending", required: true },
  },
  { timestamps: true, versionKey: false },
);

uploadSchema.index({ key: 1 }, { unique: true });
uploadSchema.index({ status: 1, createdAt: 1 });

export const Upload = model<IUpload>("Upload", uploadSchema);
