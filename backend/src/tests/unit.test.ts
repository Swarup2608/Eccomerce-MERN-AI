import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { deploymentWarnings } from "../config/env.js";
import { loginUserSchema, registerUserSchema, resetPasswordSchema } from "../modules/users/user.validation.js";

describe("password policy", () => {
  const base = { firstName: "A", lastName: "B", email: "a@b.co", userName: "alice" };

  it("requires length, upper, lower, number and special character", () => {
    for (const bad of ["Sh0rt!", "alllowercase1!", "ALLUPPERCASE1!", "NoNumbers!!", "NoSpecial123"]) {
      assert.equal(registerUserSchema.safeParse({ ...base, password: bad }).success, false, bad);
    }
    assert.equal(registerUserSchema.safeParse({ ...base, password: "Str0ng&Unusual" }).success, true);
  });

  it("blocks common passwords even when they satisfy the rules", () => {
    assert.equal(registerUserSchema.safeParse({ ...base, password: "Password@123" }).success, false);
  });

  it("applies the policy at reset but only checks the shape at login", () => {
    assert.equal(loginUserSchema.safeParse({ identifier: "a", password: "weak" }).success, true);
    assert.equal(loginUserSchema.safeParse({ identifier: "a", password: "" }).success, false);
    assert.equal(resetPasswordSchema.safeParse({ token: "x".repeat(43), password: "weak" }).success, false);
  });

  it("reserves staff-like usernames for customers", () => {
    assert.equal(registerUserSchema.safeParse({ ...base, userName: "Admin", password: "Str0ng&Unusual" }).success, false);
  });
});

describe("deployment warnings", () => {
  it("flags frontends on a different site from the API", () => {
    const warnings = deploymentWarnings({ storefrontUrl: "https://shop.vercel.app", adminUrl: "https://admin.example.com", apiPublicUrl: "https://api.example.com", isProduction: true, trustProxy: 1 });
    assert.equal(warnings.length, 1);
    assert.match(warnings[0] ?? "", /shop\.vercel\.app/);
  });

  it("accepts sibling subdomains and local development", () => {
    assert.deepEqual(deploymentWarnings({ storefrontUrl: "https://shop.example.com", adminUrl: "http://localhost:3000", apiPublicUrl: "https://api.example.com", isProduction: true, trustProxy: 1 }), []);
  });

  it("warns about TRUST_PROXY=0 in production", () => {
    assert.equal(deploymentWarnings({ storefrontUrl: "https://shop.example.com", adminUrl: "https://admin.example.com", apiPublicUrl: "https://api.example.com", isProduction: true, trustProxy: 0 }).length, 1);
  });
});
