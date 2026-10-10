import mongoose, { Types } from "mongoose";
import { env } from "../../config/env.js";
import { AppError } from "../../errors/AppError.js";
import { User } from "./user.model.js";
import { sendVerificationEmail } from "../../utils/mailer.js";
import { EmailVerification } from "./email-verification.model.js";

import {generateEmailVerificationToken, hashEmailVerificationToken} from "./email-verification.token.js";

const TOKEN_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours in milliseconds  

export async function issueEmailVerificationToken(userId: Types.ObjectId) : Promise<{ token: string; expiresAt: Date }> {
    const token = generateEmailVerificationToken();
    const tokenHash = hashEmailVerificationToken(token);
    const now = new Date();
    const expiresAt = new Date(now.getTime() + TOKEN_TTL_MS);

    const session = await mongoose.startSession();

    try {
        await session.withTransaction(async ()=>{
            const user = await User.findById(userId).session(session);
            if (!user) {
                throw new AppError("User not found",404, "USER_NOT_FOUND");
            }
            if(user.emailVerified){
                throw new AppError("Email already verified", 409, "EMAIL_ALREADY_VERIFIED");
            }
            await EmailVerification.updateMany(
                { userId, usedAt: null },
                { $set : { usedAt: now}},
                { session }
            );  
            await EmailVerification.create([
                { userId, tokenHash, expiresAt, usedAt: null },
            ],{ session });
        });
    }
    finally{
        await session.endSession();
    }
    
    // Return the raw token only so the caller can send it by email.
    // Never log it or persist it in plaintext.
    return { token, expiresAt };
}

export function buildEmailVerificationURL(token: string): string {
    const url = new URL(`/verify-email`, env.STOREFRONT_URL);
    url.searchParams.set("token", token);

    return url.toString();
}

export async function sendEmailVerification(userId: Types.ObjectId): Promise<void> {
    const user = await User.findById(userId).select("email emailVerified");
    if (!user) {
        throw new AppError("User not found", 404, "USER_NOT_FOUND");
    }
    if (user.emailVerified) {
        throw new AppError("Email already verified", 409, "EMAIL_ALREADY_VERIFIED");
    }
    const { token } = await issueEmailVerificationToken(userId);
    const tokenHash = hashEmailVerificationToken(token);
    const verificationURL = buildEmailVerificationURL(token);
    try{
        await sendVerificationEmail(user.email, verificationURL);
    }
    catch{
       await EmailVerification.updateOne(
            {userId, tokenHash, usedAt: null},
            { $set: { usedAt: new Date() } }
       ).catch(()=>undefined);
       throw new AppError("The verification email could not be sent. Please try again.", 503, "EMAIL_DELIVERY_FAILED");
    }
}

export async function verifyEmailToken(token: string): Promise<void> {
    const tokenHash = hashEmailVerificationToken(token);
    const now = new Date();
    const session = await mongoose.startSession();

    try{
        await session.withTransaction(async ()=>{
            const verification = await EmailVerification.findOneAndUpdate({
                tokenHash, usedAt: null, expiresAt: { $gt: now }
            },{ $set: { usedAt: now }},{
                new: true,
                session
            });

            if(!verification){
                throw new AppError("Invalid or expired email verification token", 400, "INVALID_EMAIL_VERIFICATION_TOKEN");
            }
            const user = await User.findOneAndUpdate(
                { _id: verification.userId, emailVerified: false },
                { $set: { emailVerified: true } },
                { new: true, session }
            );
            if(!user){
                throw new AppError("User not found or email already verified", 404, "USER_NOT_FOUND_OR_EMAIL_ALREADY_VERIFIED");
            }
        });

        }
        finally{
            await session.endSession();
        }

    }