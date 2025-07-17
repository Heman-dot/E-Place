import { createAlert } from "./notify";
export function getToken() {
    return localStorage.getItem("token");
}

export function getRefreshToken() {
    return localStorage.getItem("refresh_token");
}

export function saveTokens(token, refreshToken) {
    localStorage.setItem("token", token);
    localStorage.setItem("refresh_token", refreshToken);
}

export function clearTokens() {
    localStorage.removeItem("token");
    localStorage.removeItem("refresh_token");
}

export function redirectToLogin() {
    clearTokens();

    const authUrl = new URL(`${import.meta.env.VITE_AUTH_URL}/authorize`);

    authUrl.searchParams.append("client_id", import.meta.env.VITE_CLIENT_ID);
    authUrl.searchParams.append("response_type", "code");
    authUrl.searchParams.append(
        "redirect_uri",
        `${window.location.origin}/complete/epita/`,
    );
    authUrl.searchParams.append("scope", "epita profile picture");

    window.location.href = authUrl.toString();
}

export async function exchangeCodeForTokens(code) {
    try {
        const tokenUrl = `${import.meta.env.VITE_AUTH_URL}/token`;

        const formData = new URLSearchParams();

        formData.append("grant_type", "authorization_code");
        formData.append("code", code);
        formData.append(
            "redirect_uri",
            `${window.location.origin}/complete/epita/`,
        );
        formData.append("client_id", import.meta.env.VITE_CLIENT_ID);

        const response = await fetch(tokenUrl, {
            method: "POST",
            headers: {
                "Content-Type": "application/x-www-form-urlencoded",
            },
            body: formData,
        });

        if (!response.ok) {
            clearTokens();
            redirectToLogin();
            return;
        }

        const data = await response.json();

        saveTokens(data.id_token, data.refresh_token);

        return data;
    } catch (error) {
        console.error("Error exchanging code for tokens:", error);
        createAlert("Error", "Failed to authenticate with Forge ID", "error");
        return;
    }
}

export async function refreshToken() {
    try {
        const refreshTokenValue = getRefreshToken();

        if (!refreshTokenValue) {
            return null;
        }

        const tokenUrl = `${import.meta.env.VITE_AUTH_URL}/token`;

        const formData = new URLSearchParams();

        formData.append("grant_type", "refresh_token");
        formData.append("refresh_token", refreshTokenValue);
        formData.append("client_id", import.meta.env.VITE_CLIENT_ID);

        const response = await fetch(tokenUrl, {
            method: "POST",
            headers: {
                "Content-Type": "application/x-www-form-urlencoded",
            },
            body: formData,
        });

        if (!response.ok) {
            return;
        }

        const data = await response.json();

        saveTokens(data.id_token, data.refresh_token);

        return data.id_token;
    } catch (error) {
        console.error("Error refreshing token:", error);
        clearTokens();
        return null;
    }
}

export function isAuthenticated() {
    return !!getToken();
}

export function parseJWT(token) {
    try {
        const base64Url = token.split(".")[1];
        const base64 = base64Url.replace(/-/g, "+").replace(/_/g, "/");
        const jsonPayload = decodeURIComponent(
            atob(base64)
                .split("")
                .map(
                    (c) =>
                        "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2),
                )
                .join(""),
        );

        return JSON.parse(jsonPayload);
    } catch (error) {
        console.error("Error parsing JWT:", error);
        return null;
    }
}

export function isTokenExpired(token) {
    const parsedToken = parseJWT(token);

    if (!parsedToken || !parsedToken.exp) {
        return true;
    }

    return parsedToken.exp * 1000 < Date.now();
}

export async function authedAPIRequest(endpoint, options) {
    const token = getToken();

    if (!endpoint.startsWith("/api/")) {
        endpoint = `/api/${endpoint.startsWith("/") ? endpoint.substring(1) : endpoint}`;
    }

    const headers = {
        ...(options.headers || {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
    };

    const url = `${import.meta.env.VITE_URL}${endpoint}`;

    try {
        const response = await fetch(url, {
            ...options,
            headers,
        });

        if (response.ok) {
            return response;
        }

        if (response.status === 401) {
            const responseText = await response.text();

            if (responseText.includes("Token expired")) {
                const newToken = await refreshToken();

                if (newToken) {
                    const retryHeaders = {
                        ...(options.headers || {}),
                        Authorization: `Bearer ${newToken}`,
                    };

                    return fetch(url, {
                        ...options,
                        headers: retryHeaders,
                    });
                } else {
                    redirectToLogin();
                    return;
                }
            } else {
                redirectToLogin();
                return;
            }
        }
    } catch (error) {
        if (error.message !== "Authentication required") {
            createAlert(
                "Error",
                `API request failed: ${error.message}`,
                "error",
            );
        }

        return;
    }
}
