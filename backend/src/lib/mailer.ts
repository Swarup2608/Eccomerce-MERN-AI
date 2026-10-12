import nodemailer from "nodemailer";
import type { AppConfig } from "../config/env.js";
import type { Logger } from "./logger.js";

export interface Mail {
  to: string;
  subject: string;
  text: string;
}

export interface Mailer {
  send(mail: Mail): Promise<void>;
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}

// Every email is written as plain text; the HTML part is the same text, escaped, with links made clickable.
function toHtml(text: string): string {
  const body = escapeHtml(text).replace(/https?:\/\/[^\s<]+/g, (url) => `<a href="${url}">${url}</a>`).replace(/\n/g, "<br>");
  return `<div>${body}</div>`;
}

// SMTP in production; without SMTP_HOST (development only) emails are printed to the log so links can be clicked.
export function createMailer({ mail: config }: Pick<AppConfig, "mail">, logger: Logger): Mailer {
  const log = logger.child({ component: "mailer" });

  if (!config.host) {
    return {
      send: (mail) => {
        log.info("Email (not sent, SMTP_HOST is unset)", { to: mail.to, subject: mail.subject, text: mail.text });
        return Promise.resolve();
      },
    };
  }

  const transporter = nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    ...(config.user && config.pass ? { auth: { user: config.user, pass: config.pass } } : {}),
  });

  return {
    send: async (mail) => {
      await transporter.sendMail({ from: config.from, to: mail.to, subject: mail.subject, text: mail.text, html: toHtml(mail.text) });
    },
  };
}
