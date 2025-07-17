import { exchangeCodeForTokens, redirectToLogin } from "../../../utils/auth";
import { createAlert } from "../../../utils/notify";

async function handleAuthCallback() {
    try {
        const urlParams = new URLSearchParams(window.location.search);
        const code = urlParams.get("code");

        if (!code) {
            return;
        }

        await exchangeCodeForTokens(code);

        window.location.href = "/";
    } catch (error) {
        console.error("Authentication error:", error);
        createAlert(
            "Error",
            "Authentication failed: " + error.message,
            "error",
        );

        setTimeout(() => {
            redirectToLogin();
        }, 3000);
    }
}

document.addEventListener("DOMContentLoaded", handleAuthCallback);
