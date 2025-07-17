import { io } from "socket.io-client";
import { v4 as uuidv4 } from "uuid";
import { createAlert } from "../utils/notify";
import { getToken, refreshToken, redirectToLogin } from "./auth";

export let socket = null;

export async function initSocket() {
    // if (socket && socket.connected) {
    //     return socket;
    // }

    try {
        const token = getToken();

        const socketOptions = {
            extraHeaders: token
                ? {
                      Authorization: `Bearer ${token}`,
                  }
                : {},
        };

        if (token === null) {
            return;
        }

        if (socket !== null) {
            return;
        }

        socket = io(import.meta.env.VITE_URL, socketOptions);

        // Setup event handlers
        if (!socket.connected) {
            socket.on("connect", () => {
                createAlert("Success", "Connected to server", "success");
                console.log("Socket connected successfully");
            });
        }

        socket.on("connect_error", async (err) => {
            console.error("Socket connection error:", err);

            if (
                err.message.includes("Token expired") ||
                err.message.includes("Unauthorized")
            ) {
                try {
                    const newToken = await refreshToken();

                    if (newToken) {
                        socket.disconnect();
                        socket = null;
                        await initSocket();
                    } else {
                        redirectToLogin();
                    }
                } catch (refreshErr) {
                    console.error("Token refresh failed:", refreshErr);
                    redirectToLogin();
                }
            } else {
                createAlert(
                    "Error",
                    "Failed to connect to server: " + err.message,
                    "error",
                );
            }
        });

        socket.on("disconnect", (reason) => {
            console.log("Socket disconnected:", reason);
            // if (reason === "io server disconnect") {
            //     initSocket();
            // }
        });

        // Wait for connection

        return socket;
    } catch (error) {
        console.error("Failed to initialize socket:", error);
        createAlert(
            "Error",
            "Failed to initialize socket: " + error.message,
            "error",
        );
    }
}

export async function subscribeToRoom(roomSlug) {
    // if (!socket || !socket.connected) {
    //     await initSocket();
    // }

    const subscriptionId = uuidv4();

    // Send pixel subscription request
    const pixelSubscriptionPayload = {
        id: subscriptionId,
        method: "subscription",
        params: {
            path: "rooms.canvas.getStream",
            input: {
                json: {
                    roomSlug: roomSlug,
                },
            },
        },
    };

    console.log(
        "Sending pixel subscription request:",
        pixelSubscriptionPayload,
    );
    socket.emit("message", pixelSubscriptionPayload);

    await new Promise((resolve) => {
        const messageHandler = (data) => {
            console.log("Received message:", data);
            if (
                data.id === subscriptionId &&
                data.result &&
                data.result.type === "started"
            ) {
                socket.off("message", messageHandler);
                resolve();
            }
        };

        socket.on("message", messageHandler);
    });

    // Send chat subscription request
    const chatSubscriptionPayload = {
        id: uuidv4(),
        method: "subscription",
        params: {
            path: "rooms.getChat",
            input: {
                json: {
                    roomSlug: roomSlug,
                },
            },
        },
    };

    console.log("Sending chat subscription request:", chatSubscriptionPayload);
    socket.emit("message", chatSubscriptionPayload);

    return true;
}
