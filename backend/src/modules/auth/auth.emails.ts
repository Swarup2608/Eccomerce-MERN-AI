import type { Mail } from "../../lib/mailer.js";
import type { BlockReason } from "../users/user.validation.js";

const SIGN_OFF = "\n\nIf you did not expect this email, you can ignore it.";

export const verificationEmail = (to: string, firstName: string, link: string): Mail => ({
  to,
  subject: "Verify your email address",
  text: `Hi ${firstName},\n\nConfirm your email address to finish creating your account (the link works for 24 hours):\n\n${link}${SIGN_OFF}`,
});

export const alreadyRegisteredEmail = (to: string, loginUrl: string, resetUrl: string): Mail => ({
  to,
  subject: "Someone tried to create an account with your email",
  text: `An account already exists for this email address.\n\nSign in: ${loginUrl}\nForgot your password? ${resetUrl}${SIGN_OFF}`,
});

export const detailsUnavailableEmail = (to: string, firstName: string, registerUrl: string): Mail => ({
  to,
  subject: "We could not create your account",
  text: `Hi ${firstName},\n\nThe username or mobile number you chose is already in use, so no account was created. Please sign up again with a different one:\n\n${registerUrl}${SIGN_OFF}`,
});

export const passwordResetEmail =(to: string, firstName: string, link: string): Mail => ({
  to,
  subject: "Reset your password",
  text: `Hi ${firstName},\n\nUse this link to choose a new password (valid for 1 hour, single use):\n\n${link}${SIGN_OFF}`,
});

export const passwordChangedEmail = (to: string, firstName: string): Mail => ({
  to,
  subject: "Your password was changed",
  text: `Hi ${firstName},\n\nYour password was just changed and every signed-in device was signed out. If this was not you, reset your password immediately and contact support.`,
});

export const mfaChangedEmail = (to: string, firstName: string, enabled: boolean): Mail => ({
  to,
  subject: enabled ? "Two-step sign-in is now on" : "Two-step sign-in was turned off",
  text: enabled
    ? `Hi ${firstName},\n\nFrom now on, signing in also needs a code we email to this address.${SIGN_OFF}`
    : `Hi ${firstName},\n\nTwo-step sign-in was turned off, so your password alone now signs you in. If this was not you, reset your password immediately and turn it back on.`,
});

export const loginCodeEmail =(to: string, firstName: string, code: string, scope: "user" | "admin"): Mail => ({
  to,
  subject: scope === "admin" ? "Your admin sign-in code" : "Your sign-in code",
  text: `Hi ${firstName},\n\nYour sign-in code is ${code}. It works once and expires in 5 minutes.\n\nIf you did not just try to sign in, someone has your password: change it now.`,
});

const BLOCK_CAUSES: Record<BlockReason, string> = {
  password: "A wrong password was entered too many times.",
  mfa: "A wrong sign-in code was entered three times, which means someone knows your password.",
  verification: "Too many verification emails were requested for this address.",
};

// Always carries a reset link: resetting the password is how the owner unblocks the account straight away.
export const accountBlockedEmail = (to: string, firstName: string, reason: BlockReason, resetLink: string, forgotUrl: string): Mail => ({
  to,
  subject: "Your account has been blocked for 24 hours",
  text: `Hi ${firstName},\n\n${BLOCK_CAUSES[reason]} To protect you, signing in is blocked for 24 hours and every device was signed out.\n\nTo unblock it now, choose a new password with this link (valid for 1 hour, single use):\n\n${resetLink}\n\nIf the link has expired, request a new one at ${forgotUrl}${SIGN_OFF}`,
});
