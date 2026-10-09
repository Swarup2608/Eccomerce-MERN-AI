import assert from "node:assert/strict";
import test from "node:test";

import { User } from "../module/User/user.model.js";
import { registerUserSchema } from "../module/User/user.validation.js";
import {EmailVerification} from "../module/User/email-verification.model.js";

const validRegistration = {
  firstName: "Swarup",
  lastName: "Kumar",
  email: "  SWARUP@example.com ",
  userName: "Swarup_2608",
  password: "a-secure-password-123",
};

test("registration accepts valid input without a phone number", () => {
    const result = registerUserSchema.safeParse(validRegistration);
    assert.equal(result.success, true);
    if (result.success) {
        assert.equal(result.data.email, "swarup@example.com");
        assert.equal(result.data.userName, "swarup_2608");
        assert.equal(result.data.phoneNumber, undefined);
    }
});

test("registration accepts a phone number in international format", () => {
    const result = registerUserSchema.safeParse({
        ...validRegistration,
        phoneNumber: "+919876543210",
    });

    assert.equal(result.success, true);
});

test("registration rejects an invalid email", () => {
    const result = registerUserSchema.safeParse({
        ...validRegistration,
        email: "not-an-email",
    });

    assert.equal(result.success, false);
});

test("registration rejects passwords shorter than 12 characters", () => {
    const result = registerUserSchema.safeParse({
        ...validRegistration,
        password: "short",
    });

    assert.equal(result.success, false);
});

test("registration rejects an invalid username", () => {
    const result = registerUserSchema.safeParse({
        ...validRegistration,
        userName: "invalid username!",
    });

    assert.equal(result.success, false);
});

test("registration rejects an invalid phone number", () => {
    const result = registerUserSchema.safeParse({
        ...validRegistration,
        phoneNumber: "9876543210",
    });

    assert.equal(result.success, false);
});

test("registration rejects a client-supplied role", () => {
    const result = registerUserSchema.safeParse({
        ...validRegistration,
        role: "admin",
    });

    assert.equal(result.success, false);
});

test("registration rejects unexpected fields", () => {
    const result = registerUserSchema.safeParse({
        ...validRegistration,
        isAdmin: true,
    });

    assert.equal(result.success, false);
});

test("passwordHash is excluded from queries by default", () => {
    assert.equal(User.schema.path("passwordHash").options.select, false);
});

test("new users default to the user role and unverified status", () => {
    const user = new User({
        firstName: "Test",
        lastName: "User",
        email: "test@example.com",
        userName: "test_user",
        passwordHash: "test-hash",
    });

    assert.equal(user.role, "user");
    assert.equal(user.emailVerified, false);
    assert.equal(user.phoneVerified, false);
    assert.equal(user.status, "active");
});

test("email and username have unique indexes", () => {
    const indexes = User.schema.indexes();

    assert.ok(
        indexes.some(
        ([fields, options]) => fields.email === 1 && options.unique === true,
        ),
        "email should have a unique index",
    );

    assert.ok(
        indexes.some(
        ([fields, options]) =>
            fields.userName === 1 && options.unique === true,
        ),
        "username should have a unique index",
    );
});

test("phone number has a partial unique index", () => {
    const indexes = User.schema.indexes();

    assert.ok(
        indexes.some(
        ([fields, options]) =>
            fields.phoneNumber === 1 &&
            options.unique === true &&
            options.partialFilterExpression !== undefined,
        ),
        "phoneNumber should have a partial unique index",
    );
});

test("email verification allows only one active token per user", async () => {
    const indexes = EmailVerification.schema.indexes();
    assert.ok( 
        indexes.some(([fields,options]) => fields.userId === 1 && options.unique === true && options.partialFilterExpression !== undefined),
        "userId should have a unique partial index for active email verification tokens"
    );
    
});
    