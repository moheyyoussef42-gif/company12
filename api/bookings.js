const { getValue, setValue } = require("./store");

const sendJson = (res, statusCode, payload) => {
    res.statusCode = statusCode;
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    // Prevent caching so all devices always get fresh data
    res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
    res.setHeader("Pragma", "no-cache");
    res.setHeader("Expires", "0");
    res.end(JSON.stringify(payload));
};

const readBody = (req) => {
    return new Promise((resolve, reject) => {
        let body = "";
        req.on("data", (chunk) => {
            body += chunk.toString();
        });
        req.on("end", () => {
            if (!body) {
                resolve(null);
                return;
            }
            try {
                resolve(JSON.parse(body));
            } catch (error) {
                reject(new Error("Invalid JSON body"));
            }
        });
        req.on("error", reject);
    });
};

const isSlotTaken = (bookings, date, time, excludeId) => {
    return bookings.some(
        (booking) =>
            booking.date === date &&
            booking.time === time &&
            booking.status !== "cancelled" &&
            booking.id !== excludeId
    );
};

module.exports = async (req, res) => {
    if (req.method === "OPTIONS") {
        sendJson(res, 204, { ok: true });
        return;
    }

    if (req.method === "GET") {
        // Accept a knownUrl query param to bypass list() eventual consistency
        const knownUrl = req.url ? new URL(req.url, `http://${req.headers.host}`).searchParams.get("url") : null;
        const bookings = await getValue("bookings", [], knownUrl);
        sendJson(res, 200, Array.isArray(bookings) ? bookings : []);
        return;
    }

    if (req.method === "POST") {
        try {
            const newBooking = await readBody(req);
            if (!newBooking || !newBooking.date || !newBooking.time) {
                sendJson(res, 400, { error: "Missing booking data." });
                return;
            }

            const bookings = await getValue("bookings", []);
            const list = Array.isArray(bookings) ? bookings : [];

            if (isSlotTaken(list, newBooking.date, newBooking.time)) {
                sendJson(res, 409, { error: "This slot is already booked." });
                return;
            }

            list.push(newBooking);
            const result = await setValue("bookings", list);
            // Return the new blob URL so the client can cache it
            sendJson(res, 201, { booking: newBooking, blobUrl: result.url });
        } catch (error) {
            sendJson(res, 400, { error: error.message });
        }
        return;
    }

    if (req.method === "PUT") {
        try {
            const payload = await readBody(req);
            if (!Array.isArray(payload)) {
                sendJson(res, 400, { error: "Payload must be an array of bookings." });
                return;
            }

            const seen = new Set();
            for (const booking of payload) {
                if (booking.status === "cancelled") continue;
                const key = `${booking.date}|${booking.time}`;
                if (seen.has(key)) {
                    sendJson(res, 409, { error: "Duplicate slot in payload." });
                    return;
                }
                seen.add(key);
            }

            const result = await setValue("bookings", payload);
            sendJson(res, 200, { bookings: payload, blobUrl: result.url });
        } catch (error) {
            sendJson(res, 400, { error: error.message });
        }
        return;
    }

    sendJson(res, 405, { error: "Method not allowed" });
};