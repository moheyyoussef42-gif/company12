const fs = require("fs");
const path = require("path");

const DATA_DIR = path.join(__dirname, "..", "data");

const hasKv =
    Boolean(process.env.KV_REST_API_URL) &&
    Boolean(process.env.KV_REST_API_TOKEN);

const hasBlob = Boolean(process.env.BLOB_READ_WRITE_TOKEN);

let kvClient = null;
if (hasKv) {
    try {
        kvClient = require("@vercel/kv").kv;
    } catch (error) {
        console.error("Failed to load @vercel/kv", error);
    }
}

let blobClient = null;
if (hasBlob) {
    try {
        blobClient = require("@vercel/blob");
    } catch (error) {
        console.error("Failed to load @vercel/blob", error);
    }
}

const ensureDataDir = () => {
    if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
    }
};

const readLocalJson = (fileName, fallback) => {
    ensureDataDir();
    const filePath = path.join(DATA_DIR, fileName);
    if (!fs.existsSync(filePath)) {
        return fallback;
    }
    try {
        return JSON.parse(fs.readFileSync(filePath, "utf8"));
    } catch (error) {
        return fallback;
    }
};

const writeLocalJson = (fileName, data) => {
    ensureDataDir();
    fs.writeFileSync(
        path.join(DATA_DIR, fileName),
        JSON.stringify(data, null, 2),
        "utf8"
    );
};

// -------------------------------------------------------------
// Vercel Blob helpers (persistent storage for serverless)
// -------------------------------------------------------------
const BLOB_PATHS = {
    bookings: "data/bookings.json",
    settings: "data/settings.json"
};

// Use shorter prefix for listing to match both "data/bookings.json" and "data/bookings-XXX.json"
const BLOB_PREFIXES = {
    bookings: "data/bookings",
    settings: "data/settings"
};

const readBlobJson = async (key, fallback) => {
    if (!blobClient) return fallback;
    try {
        const { list } = blobClient;
        // Use the exact path as prefix (no random suffix anymore, so only one file matches)
        const pathname = BLOB_PATHS[key];
        const blobs = await list({ prefix: pathname });
        if (!blobs || blobs.blobs.length === 0) {
            return fallback;
        }
        // Since we use addRandomSuffix: false, there should be only one blob.
        // Fetch it with cache: 'no-store' to always get the latest data.
        const latest = blobs.blobs[0];
        const response = await fetch(latest.url, { cache: 'no-store' });
        if (!response.ok) return fallback;
        const text = await response.text();
        if (!text) return fallback;
        return JSON.parse(text);
    } catch (error) {
        console.error(`Failed to read blob ${key}:`, error);
        return fallback;
    }
};

const writeBlobJson = async (key, data) => {
    if (!blobClient) return;
    try {
        const { put } = blobClient;
        const pathname = BLOB_PATHS[key];
        const dataStr = JSON.stringify(data, null, 2);

        // Use fixed path (no random suffix) so the URL is always the same.
        // Combined with cache: 'no-store' on read, this ensures the latest data is always fetched.
        await put(pathname, dataStr, {
            access: "public",
            contentType: "application/json",
            addRandomSuffix: false
        });
    } catch (error) {
        console.error(`Failed to write blob ${key}:`, error);
    }
};

const getValue = async (key, fallback) => {
    if (kvClient) {
        const value = await kvClient.get(key);
        return value ?? fallback;
    }
    if (blobClient) {
        return await readBlobJson(key, fallback);
    }
    return readLocalJson(`${key}.json`, fallback);
};

const setValue = async (key, data) => {
    if (kvClient) {
        await kvClient.set(key, data);
        return;
    }
    if (blobClient) {
        await writeBlobJson(key, data);
        return;
    }
    writeLocalJson(`${key}.json`, data);
};

module.exports = {
    getValue,
    setValue,
    hasKv,
    hasBlob
};