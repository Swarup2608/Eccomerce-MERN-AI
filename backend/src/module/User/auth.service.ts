import { Types } from "mongoose";
import { AppError } from "../../errors/AppError.js";
import { hashPassword } from "../../utils/password.js";
import { EmailVerification } from "./email-verification.model.js";
import { sendEmailVerification } from "./email-verification.service.js";
import { User } from "./user.model.js";
import type { RegisterUserInput } from "./user.validation.js";

export interface RegisteredUserDto {
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

function toRegisteredUserDto(user: RegisterUserInputDto): RegisteredUserDto {
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

export async function registerUser(input: RegisterUserInput, dependencies: RegisterUserDependencies = defaultRegisterUserDependencies,): Promise<RegisteredUserDto> {
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

const defaultRegisterUserDependencies: RegisterUserDependencies = {
  hashPassword,
  sendEmailVerification,
};