const http = require("http");
const fs = require("fs");
const path = require("path");

const rootDir = __dirname;
const dataDir = path.join(rootDir, "data");
const bookingsFile = path.join(dataDir, "bookings.json");
const settingsFile = path.join(dataDir, "settings.json");

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

const MIME_TYPES = {
    ".html": "text/html; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".js": "application/javascript; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".gif": "image/gif",
    ".svg": "image/svg+xml",
    ".ico": "image/x-icon",
    ".txt": "text/plain; charset=utf-8"
};

const ensureDataFiles = () => {
    fs.mkdirSync(dataDir, { recursive: true });
    if (!fs.existsSync(bookingsFile)) {
        fs.writeFileSync(bookingsFile, "[]", "utf8");
    }
    if (!fs.existsSync(settingsFile)) {
        fs.writeFileSync(settingsFile, JSON.stringify(DEFAULT_SETTINGS, null, 2), "utf8");
    }
};

const readJsonFile = (filePath, fallback) => {
    try {
        const content = fs.readFileSync(filePath, "utf8");
        return JSON.parse(content);
    } catch (error) {
        return fallback;
    }
};

const writeJsonFile = (filePath, data) => {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf8");
};

const sendJson = (res, statusCode, payload) => {
    res.writeHead(statusCode, { "Content-Type": "application/json; charset=utf-8" });
    res.end(JSON.stringify(payload));
};

const readBody = (req) => {
    return new Promise((resolve, reject) => {
        let body = "";
        req.on("data", chunk => {
            body += chunk.toString();
        });
        req.on("end", () => {
            if (!body) {
                resolve({});
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

const serveStatic = (req, res) => {
    let pathname = new URL(req.url, `http://${req.headers.host || "localhost"}`).pathname;
    if (pathname === "/") pathname = "/index.html";

    const filePath = path.join(rootDir, pathname);
    const normalizedPath = path.normalize(filePath);
    if (!normalizedPath.startsWith(rootDir)) {
        sendJson(res, 403, { error: "Forbidden" });
        return;
    }

    fs.readFile(normalizedPath, (error, content) => {
        if (error) {
            sendJson(res, 404, { error: "Not found" });
            return;
        }

        const extension = path.extname(normalizedPath);
        const contentType = MIME_TYPES[extension] || "application/octet-stream";
        res.writeHead(200, { "Content-Type": contentType });
        res.end(content);
    });
};

ensureDataFiles();

const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);

    if (url.pathname === "/api/health") {
        sendJson(res, 200, { ok: true });
        return;
    }

    if (url.pathname === "/api/bookings") {
        if (req.method === "GET") {
            const bookings = readJsonFile(bookingsFile, []);
            sendJson(res, 200, bookings);
            return;
        }

        if (req.method === "PUT") {
            try {
                const payload = await readBody(req);
                const bookings = Array.isArray(payload) ? payload : [];
                writeJsonFile(bookingsFile, bookings);
                sendJson(res, 200, bookings);
            } catch (error) {
                sendJson(res, 400, { error: error.message });
            }
            return;
        }

        if (req.method === "POST") {
            try {
                const payload = await readBody(req);
                const bookings = readJsonFile(bookingsFile, []);
                const newBooking = payload && payload.name ? payload : null;
                if (!newBooking) {
                    sendJson(res, 400, { error: "Missing booking payload" });
                    return;
                }
                bookings.push(newBooking);
                writeJsonFile(bookingsFile, bookings);
                sendJson(res, 200, bookings);
            } catch (error) {
                sendJson(res, 400, { error: error.message });
            }
            return;
        }
    }

    if (url.pathname === "/api/settings") {
        if (req.method === "GET") {
            const settings = readJsonFile(settingsFile, DEFAULT_SETTINGS);
            sendJson(res, 200, settings);
            return;
        }

        if (req.method === "POST") {
            try {
                const payload = await readBody(req);
                const settings = payload && typeof payload === "object" ? payload : DEFAULT_SETTINGS;
                writeJsonFile(settingsFile, settings);
                sendJson(res, 200, settings);
            } catch (error) {
                sendJson(res, 400, { error: error.message });
            }
            return;
        }
    }

    serveStatic(req, res);
});

const PORT = process.env.PORT || 8000;
server.listen(PORT, () => {
    console.log(`Booking server running on http://localhost:${PORT}`);
});
