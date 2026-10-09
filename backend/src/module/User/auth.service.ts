import { Types } from "mongoose";
import { AppError } from "../../errors/AppError.js";
import { hashPassword, verifyPassword } from "../../utils/password.js";
import { EmailVerification } from "./email-verification.model.js";
import { sendEmailVerification } from "./email-verification.service.js";
import { User } from "./user.model.js";
import type { RegisterUserInput, LoginUserInput } from "./user.validation.js";
import { createSession, revokeSession, type SessionRecord } from "../../utils/session.js";
import { signAccessToken, signRefreshToken } from "../../utils/jwt.js";
export interface AuthenticatedUserDto {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  userName: string;
  phoneNumber?: string;
  role: string;
  status: string;
  emailVerified: boolean;
  phoneVerified: boolean;
  createdAt?: Date;
}

export type RegisterUserInputDto = {
    _id: Types.ObjectId;
    firstName: string;
    lastName: string;
    email: string;
    userName: string;
    phoneNumber?: string;
    role: string;
    status: string;
    emailVerified: boolean;
    phoneVerified: boolean;
    createdAt?: Date;
};

function isDuplicateKeyError(error: unknown): boolean {
    return (typeof error === "object" && error !== null && "code" in error && error.code === 11000);
}

function toRegisteredUserDto(user: RegisterUserInputDto): AuthenticatedUserDto {
    return {
        id: user._id.toString(),
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        userName: user.userName,
        ...(user.phoneNumber ? { phoneNumber: user.phoneNumber } : {}),
        role: user.role,
        status: user.status,
        emailVerified: user.emailVerified,
        phoneVerified: user.phoneVerified,
        ...(user.createdAt ? { createdAt: user.createdAt } : {}),
    };
}

export async function registerUser(input: RegisterUserInput, dependencies: RegisterUserDependencies = defaultRegisterUserDependencies,): Promise<AuthenticatedUserDto> {
    const passwordHash = await dependencies.hashPassword(input.password);

    let user;
    try{
        user = await User.create({
            firstName: input.firstName,
            lastName: input.lastName,
            email: input.email,
            userName: input.userName,
            passwordHash,
            ...(input.phoneNumber ? { phoneNumber: input.phoneNumber } : {}),
            emailVerified: false,
            phoneVerified: false,
        });
    }
    catch(error){
        if (isDuplicateKeyError(error)) {
            throw new AppError("An account with these details already exists.", 409,"ACCOUNT_ALREADY_EXISTS");
        }
        throw error;
    }
    try {
        await dependencies.sendEmailVerification(user._id);
    } catch (error) {
        await EmailVerification.deleteMany({ userId: user._id }).catch(() => undefined );
        await User.deleteOne({ _id: user._id, emailVerified: false }).catch(() => undefined);
        throw error;    
    }

    return toRegisteredUserDto(user);
}

export interface RegisterUserDependencies {
  hashPassword: typeof hashPassword;
  sendEmailVerification: typeof sendEmailVerification;
}

export interface LoginUserDependencies {
  findUser: (identifier: string) => Promise<{
    _id: Types.ObjectId;
    firstName: string;
    lastName: string;
    email: string;
    userName: string;
    passwordHash: string;
    phoneNumber?: string;
    role: string;
    status: string;
    emailVerified: boolean;
    phoneVerified: boolean;
  } | null>;
  verifyPassword: typeof verifyPassword;
  createSession: typeof createSession;
  revokeSession: typeof revokeSession;
  signAccessToken: typeof signAccessToken;
  signRefreshToken: typeof signRefreshToken;
  updateLastLogin: (userId: string) => Promise<void>;
}

const defaultRegisterUserDependencies: RegisterUserDependencies = {
  hashPassword,
  sendEmailVerification,
};

const defaultLoginUserDependencies: LoginUserDependencies = {
    findUser: async (identifier) => User.findOne({
        $or: [{ email: identifier }, { userName: identifier }],
        }).select("+passwordHash"),

    verifyPassword,
    createSession,
    revokeSession,
    signAccessToken,
    signRefreshToken,

    updateLastLogin: async (userId) => {
        await User.updateOne(
        { _id: userId },
        { $set: { lastLoginAt: new Date() } },
        );
    },
};

export interface LoginResult {
    user: AuthenticatedUserDto;
    accessToken: string;
    refreshToken: string;
}

export async function loginUser(input: LoginUserInput, dependencies: LoginUserDependencies = defaultLoginUserDependencies): Promise<LoginResult> {
    const identifier = input.identifier.toLowerCase(); // could be email or username
    const user = await dependencies.findUser(identifier);

    // Keep the response identical for unknown users and incorrect passwords.
    if (!user || !(await dependencies.verifyPassword(input.password, user.passwordHash))) {
        throw new AppError( "Invalid email/username or password.", 401, "INVALID_CREDENTIALS" );
    }

    if(!user.emailVerified) {
        throw new AppError("Please verify your email before logging in.", 403, "EMAIL_NOT_VERIFIED");
    }

    if(user.status !== "active"){
        throw new AppError("This account is not available for login.", 403, "ACCOUNT_NOT_ACTIVE");
    }

    const session = await dependencies.createSession(user._id.toString());

    try {
        await dependencies.updateLastLogin(user._id.toString());
    } catch (error) {
        await dependencies.revokeSession(session.sessionId).catch(() => undefined);
        throw error;
    }

    const accessToken = dependencies.signAccessToken(user._id.toString(), session.sessionId);

    const refreshToken = dependencies.signRefreshToken(user._id.toString(), session.sessionId, session.refreshTokenId);

    const safeUser: AuthenticatedUserDto = {
        id: user._id.toString(),
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        userName: user.userName,
        ...(user.phoneNumber ? { phoneNumber: user.phoneNumber } : {}),
        role: user.role,
        status: user.status,
        emailVerified: user.emailVerified,
        phoneVerified: user.phoneVerified
    };

    return {
        user: safeUser,
        accessToken,
        refreshToken,
    };
}
