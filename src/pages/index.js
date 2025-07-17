// FIXME: This is the entry point of the application, write your code here

import { calculateLayout } from "./utils";
import "./debug";
calculateLayout();
import {
    authedAPIRequest,
    isAuthenticated,
    redirectToLogin,
} from "../utils/auth";
import { initSocket, subscribeToRoom } from "../utils/streams";
import { createAlert } from "../utils/notify";
import { initCanvas, renderCanvasUpdate } from "../rooms/canvas/utils";
// import cors from "cors";
// import express from "express";

// const app = express();

// app.use(cors()); // ⚠️ Only for dev/testing

// const canvasData = null;
// const pendingUpdates = [];

function getRoomSlug() {
    const path = window.location.pathname;
    const pathSegments = path
        .split("/")
        .filter((segment) => segment.length > 0);

    return pathSegments.length > 0 ? pathSegments[0] : "epi-place";
}

async function fetchRoomConfig(roomSlug) {
    try {
        const response = await authedAPIRequest(
            `/api/rooms/${roomSlug}/config`,
            {
                method: "GET",
            },
        );
        const config = await response.json();

        document.getElementById("room-name").textContent = config.metadata.name;

        const roomDescElement = document.getElementById("room-description");

        if (config.metadata.description) {
            roomDescElement.textContent = config.metadata.description;
            roomDescElement.classList.remove("invisible");
        } else {
            roomDescElement.classList.add("invisible");
        }

        return config;
    } catch (error) {
        console.error("Failed to fetch room configuration:", error);
        createAlert("Error", "Failed to fetch room information", "error");
    }
}

async function init() {
    try {
        if (!isAuthenticated()) {
            redirectToLogin();
            return;
        }

        const roomSlug = getRoomSlug();
        const socket = await initSocket();

        if (!socket) {
            createAlert("Error", "Failed to connect to server", "error");
            return;
        }

        try {
            await subscribeToRoom(roomSlug);
            createAlert("Success", `Subscribed to ${roomSlug}`, "success");
        } catch (error) {
            console.error("Failed to subscribe to room:", error);
            createAlert("Error", "Failed to subscribe to room", "error");
            return;
        }

        const config = await fetchRoomConfig(roomSlug);
        const canvasRes = await authedAPIRequest(`/rooms/${roomSlug}/canvas`, {
            method: "GET",
        });

        const { pixels: encoded } = await canvasRes.json();
        const bits = encoded
            .split("")
            .map((c) => c.charCodeAt(0).toString(2).padStart(8, "0"))
            .join("");

        const maxPx = config.metadata.canvasDimensions ** 2;
        const pixels = [];

        for (let i = 0; i + 5 <= bits.length && pixels.length < maxPx; i += 5) {
            pixels.push(parseInt(bits.slice(i, i + 5), 2));
        }

        initCanvas(config, pixels);
        createAlert("Success", "Canvas loaded successfully", "success");
        socket.on("pixel-update", (msg) => {
            const data = msg.result.data.json;

            if (data.roomSlug === roomSlug) {
                renderCanvasUpdate(data.color, data.posX, data.posY);
            }
        });
    } catch (error) {
        console.error("Initialization failed:", error);
        createAlert("Error", "Failed to initialize application", "error");
    }
}

document.addEventListener("DOMContentLoaded", init);
