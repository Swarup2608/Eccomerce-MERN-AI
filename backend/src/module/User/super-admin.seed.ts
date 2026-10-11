import { Writable } from "node:stream";
import { createInterface } from "node:readline";
import { z } from "zod";

import { connectMongoose, disconnectDb } from "../../config/mongoose.js";
import { logger } from "../../utils/logger.js";
import { hashPassword } from "../../utils/password.js";
import { User } from "./user.model.js";
import { USER_ROLES, USER_STATUSES, registerUserSchema } from "./user.validation.js";

const superAdminSchema = registerUserSchema.omit({ phoneNumber: true }).extend({
    password: z.string().min(12, "Password must be at least 12 characters").max(128, "Password must be at most 128 characters"),
});

// Readline echoes typed characters through this stream, so muting it hides the password.
let muted = false;
const output = new Writable({
    write(chunk, _encoding, callback) {
        if (!muted) process.stdout.write(chunk);
        callback();
    },
});

const prompt = createInterface({ input: process.stdin, output, terminal: Boolean(process.stdin.isTTY) });
const lines = prompt[Symbol.asyncIterator]();

// Ctrl+C ends the input, so the pending prompt fails and the script exits without changes.
prompt.on("SIGINT", () => prompt.close());

async function ask(question: string, options: { hidden?: boolean } = {}): Promise<string> {
    process.stdout.write(question);
    muted = Boolean(options.hidden);

    try {
        const { value, done } = await lines.next();
        if (done) throw new Error("Input ended before all details were entered.");
        return value;
    } finally {
        if (muted) process.stdout.write("\n");
        muted = false;
    }
}

async function createSuperAdmin(): Promise<void> {
    await connectMongoose();

    try {
        const existing = await User.findOne({ role: USER_ROLES.SUPER_ADMIN }).select("email").lean();

        if (existing) {
            throw new Error(`A Super Admin already exists (${existing.email}). No changes made.`);
        }

        process.stdout.write("\nCreate the Super Admin account\n\n");

        const details = {
            email: await ask("Email: "),
            firstName: await ask("First name: "),
            lastName: await ask("Last name: "),
            userName: await ask("Username: "),
            password: await ask("Password (min 12 characters): ", { hidden: true }),
        };

        if ((await ask("Confirm password: ", { hidden: true })) !== details.password) {
            throw new Error("Passwords do not match. No changes made.");
        }

        const parsed = superAdminSchema.safeParse(details);

        if (!parsed.success) {
            throw new Error(parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; "));
        }

        const input = parsed.data;
        const taken = await User.exists({ $or: [{ email: input.email }, { userName: input.userName }] });

        if (taken) {
            throw new Error("An account with this email or username already exists. No changes made.");
        }

        await User.create({
            firstName: input.firstName,
            lastName: input.lastName,
            email: input.email,
            userName: input.userName,
            passwordHash: await hashPassword(input.password),
            role: USER_ROLES.SUPER_ADMIN,
            status: USER_STATUSES.ACTIVE,
            emailVerified: true,
        });

        logger.info(`Super Admin created: ${input.email}`);
    } finally {
        prompt.close();
        // Close the connection so the script exits instead of hanging.
        await disconnectDb();
    }
}

createSuperAdmin().catch((error: unknown) => {
    logger.error("Super Admin creation failed: " + (error instanceof Error ? error.message : error));
    process.exitCode = 1;
});
