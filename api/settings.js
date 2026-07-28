const fs = require("fs");
const path = require("path");
const os = require("os");

const seedDataDir = path.join(__dirname, "..", "data");
const runtimeDataDir = path.join(os.tmpdir(), "pitch-booking-app-data");
const runtimeSettingsFile = path.join(runtimeDataDir, "settings.json");
const seedSettingsFile = path.join(seedDataDir, "settings.json");

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

const ensureRuntimeDir = () => {
  if (!fs.existsSync(runtimeDataDir)) {
    fs.mkdirSync(runtimeDataDir, { recursive: true });
  }
};

const ensureSettingsFile = () => {
  ensureRuntimeDir();
  if (!fs.existsSync(runtimeSettingsFile)) {
    if (fs.existsSync(seedSettingsFile)) {
      fs.copyFileSync(seedSettingsFile, runtimeSettingsFile);
    } else {
      fs.writeFileSync(runtimeSettingsFile, JSON.stringify(DEFAULT_SETTINGS, null, 2), "utf8");
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
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
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

  ensureSettingsFile();

  if (req.method === "GET") {
    const settings = readJson(runtimeSettingsFile, DEFAULT_SETTINGS);
    sendJson(res, 200, settings);
    return;
  }

  if (req.method === "POST") {
    try {
      const payload = await readBody(req);
      const settings = payload && typeof payload === "object" ? payload : DEFAULT_SETTINGS;
      writeJson(runtimeSettingsFile, settings);
      sendJson(res, 200, settings);
    } catch (error) {
      sendJson(res, 400, { error: error.message });
    }
    return;
  }

  sendJson(res, 405, { error: "Method not allowed" });
};
