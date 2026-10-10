export function signInErrorMessage(error) {
  const messages = {
    "auth/network-request-failed":
      "The connection to Firebase failed. Please try again.",
    "auth/too-many-requests":
      "Firebase has temporarily limited sign-in attempts. Wait a few minutes before trying again.",
    "auth/user-disabled": "This account is disabled in Firebase.",
    "auth/operation-not-allowed":
      "Email/password sign-in is not enabled for the Library.",
    "auth/unauthorized-domain":
      "This site address is not authorised for sign-in.",
    "auth/invalid-email": "Enter a valid email address.",
    "auth/invalid-credential":
      "Firebase could not verify this email/password sign-in.",
    "auth/user-not-found": "Firebase could not find an account for this email.",
    "auth/wrong-password":
      "Firebase did not accept the password for this account.",
    "auth/invalid-api-key":
      "The Library cannot connect with its Firebase API key.",
    "auth/app-not-authorized":
      "Firebase has blocked sign-in from this application.",
    "auth/web-storage-unsupported":
      "This browser cannot save your sign-in session. Open the Library in Chrome or Edge.",
    "auth/internal-error":
      "Firebase could not complete sign-in because of an internal error.",
  };
  const code =
    typeof error?.code === "string" && /^auth\/[a-z-]+$/.test(error.code)
      ? error.code
      : null;
  const message =
    messages[code] || "Sign-in could not finish. Please try again.";
  return code ? `${message} (${code})` : message;
}
