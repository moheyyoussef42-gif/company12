const { getValue, setValue } = require("./store");

const DEFAULT_SETTINGS = {
    activeDays: [0, 1, 2, 3, 4, 5, 6],
    timeSlots: [
        "02:00 م - 03:00 م",
        "03:00 م - 04:00 م",
        "04:00 م - 05:00 م",
        "05:00 م - 06:00 م",
        "06:00 م - 07:00 م",
        "07:00 م - 08:00 م",
        "08:00 م - 09:00 م",
        "09:00 م - 10:00 م",
        "10:00 م - 11:00 م",
        "11:00 م - 12:00 ص",
        "12:00 ص - 01:00 ص",
        "01:00 ص - 02:00 ص"
    ],
    slotPrice: 140,
    daysAhead: 7,
    blockedDates: []
};

const sendJson = (res, statusCode, payload) => {
    res.statusCode = statusCode;
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
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

module.exports = async (req, res) => {
    if (req.method === "OPTIONS") {
        sendJson(res, 204, { ok: true });
        return;
    }

    if (req.method === "GET") {
        const settings = await getValue("settings", DEFAULT_SETTINGS);
        sendJson(res, 200, { ...DEFAULT_SETTINGS, ...settings });
        return;
    }

    if (req.method === "POST") {
        try {
            const payload = await readBody(req);
            const settings =
                payload && typeof payload === "object"
                    ? { ...DEFAULT_SETTINGS, ...payload }
                    : DEFAULT_SETTINGS;
            await setValue("settings", settings);
            sendJson(res, 200, settings);
        } catch (error) {
            sendJson(res, 400, { error: error.message });
        }
        return;
    }

    sendJson(res, 405, { error: "Method not allowed" });
};
