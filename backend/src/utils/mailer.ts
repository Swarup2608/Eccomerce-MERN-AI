import nodemailer from "nodemailer";
import { AppError } from "../errors/AppError.js";
import { env } from "../config/env.js";

interface VerificationEmailContent {
  subject: string;
  text: string;
  html: string;
}

function escapeHtml(value: string): string {
    return value.replace(/&/g, "&amp;")
                .replace(/</g, "&lt;")
                .replace(/>/g, "&gt;")
                .replace(/"/g, "&quot;")
                .replace(/'/g, "&#039;");
}

export function buildVerificationEmailContent(verificationUrl: string): VerificationEmailContent {
    let url: URL;
    try{
        url = new URL(verificationUrl);
    }catch{
        throw new AppError("Invalid Verification URL", 400, "INVALID_VERIFICATION_URL");
    }
    if(url.protocol !== "http:" && url.protocol !== "https:"){
        throw new AppError("The verification URL must use HTTP or HTTPS.", 400, "INVALID_VERIFICATION_URL");
    }

    const safeUrl = escapeHtml(url.toString());

    return {
        subject: "Verify your email address",
        text: [
            'Welcome!',
            "",
            "Please verify your email address by clicking the following link:",
            safeUrl.toString(),
            "",
            "If you did not request this verification, please ignore this email."
        ].join("\n"),
        html: `
            <div>
                <h1>Verify your email address</h1>
                <p>Welcome! Please verify your email address to activate your account.</p>
                <p>
                <a href="${safeUrl}">Verify email address</a>
                </p>
                <p>If you did not create this account, you can ignore this email.</p>
            </div>
        `,
  };
}

export async function sendVerificationEmail(recipient : string, verificationUrl: string): Promise<void> {
    if(!env.SMTP_HOST || !env.EMAIL_FROM){
        throw new AppError("Email delivery is not configured.", 503, "EMAIL_NOT_CONFIGURED");
    }
    if (Boolean(env.SMTP_USER) !== Boolean(env.SMTP_PASS)) {
        throw new AppError("SMTP authentication configuration is incomplete.", 503, "EMAIL_NOT_CONFIGURED");
    }
    const content = buildVerificationEmailContent(verificationUrl);

    const transporter = nodemailer.createTransport({
        host: env.SMTP_HOST,
        port: env.SMTP_PORT,
        secure: env.SMTP_SECURE,
        ...(env.SMTP_USER && env.SMTP_PASS ? {
            auth: {
                user: env.SMTP_USER,
                pass: env.SMTP_PASS
            },
        }: {}),
    });

    await transporter.sendMail({
        from: env.EMAIL_FROM,
        to: recipient,
        subject: content.subject,
        text: content.text,
        html: content.html,
    });
}