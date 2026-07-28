const fs = require("fs");
const path = require("path");
const os = require("os");

const seedDataDir = path.join(__dirname, "..", "data");
const runtimeDataDir = path.join(os.tmpdir(), "pitch-booking-app-data");
const runtimeBookingsFile = path.join(runtimeDataDir, "bookings.json");
const seedBookingsFile = path.join(seedDataDir, "bookings.json");

const ensureRuntimeDir = () => {
  if (!fs.existsSync(runtimeDataDir)) {
    fs.mkdirSync(runtimeDataDir, { recursive: true });
  }
};

const ensureBookingsFile = () => {
  ensureRuntimeDir();
  if (!fs.existsSync(runtimeBookingsFile)) {
    if (fs.existsSync(seedBookingsFile)) {
      fs.copyFileSync(seedBookingsFile, runtimeBookingsFile);
    } else {
      fs.writeFileSync(runtimeBookingsFile, "[]", "utf8");
    }
  }
};

const readJson = (filePath, fallback) => {
  try {
    const content = fs.readFileSync(filePath, "utf8");
    return JSON.parse(content);
  } catch (error) {
    return fallback;
  }
};

const writeJson = (filePath, data) => {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf8");
};

const sendJson = (res, statusCode, payload) => {
  res.statusCode = statusCode;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
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

module.exports = async (req, res) => {
  if (req.method === "OPTIONS") {
    sendJson(res, 204, { ok: true });
    return;
  }

  ensureBookingsFile();

  if (req.method === "GET") {
    const bookings = readJson(runtimeBookingsFile, []);
    sendJson(res, 200, bookings);
    return;
  }

  if (req.method === "PUT") {
    try {
      const payload = await readBody(req);
      if (!Array.isArray(payload)) {
        sendJson(res, 400, { error: "Payload must be an array of bookings." });
        return;
      }
      writeJson(runtimeBookingsFile, payload);
      sendJson(res, 200, payload);
    } catch (error) {
      sendJson(res, 400, { error: error.message });
    }
    return;
  }

  if (req.method === "POST") {
    try {
      const payload = await readBody(req);
      const bookings = readJson(runtimeBookingsFile, []);
      const newBooking = payload && typeof payload === "object" ? payload : null;
      if (!newBooking) {
        sendJson(res, 400, { error: "Missing booking payload." });
        return;
      }
      bookings.push(newBooking);
      writeJson(runtimeBookingsFile, bookings);
      sendJson(res, 201, bookings);
    } catch (error) {
      sendJson(res, 400, { error: error.message });
    }
    return;
  }

  sendJson(res, 405, { error: "Method not allowed" });
};
