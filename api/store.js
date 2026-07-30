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

// Cache for blob URLs (persisted across invocations via environment)
let blobUrlCache = {};

// Try to load cached URLs from environment (set after first put())
try {
    if (process.env.BLOB_URLS) {
        blobUrlCache = JSON.parse(process.env.BLOB_URLS);
    }
} catch (e) {}

const readBlobJson = async (key, fallback, knownUrl) => {
    if (!blobClient) return fallback;
    try {
        // Priority 1: Use known URL from client (fastest, no eventual consistency)
        if (knownUrl) {
            const response = await fetch(knownUrl, { cache: 'no-store' });
            if (response.ok) {
                const text = await response.text();
                if (text) return JSON.parse(text);
            }
        }

        // Priority 2: Use cached URL from environment
        if (blobUrlCache[key]) {
            const response = await fetch(blobUrlCache[key], { cache: 'no-store' });
            if (response.ok) {
                const text = await response.text();
                if (text) return JSON.parse(text);
            }
        }

        // Priority 3: Use list() as last resort (has eventual consistency delay)
        const { list } = blobClient;
        const prefix = BLOB_PATHS[key];
        const blobs = await list({ prefix });
        if (blobs && blobs.blobs.length > 0) {
            const sorted = [...blobs.blobs].sort((a, b) =>
                new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime()
            );
            const latest = sorted[0];
            blobUrlCache[key] = latest.url;
            const response = await fetch(latest.url, { cache: 'no-store' });
            if (response.ok) {
                const text = await response.text();
                if (text) return JSON.parse(text);
            }
        }

        return fallback;
    } catch (error) {
        console.error(`Failed to read blob ${key}:`, error);
        return fallback;
    }
};

const writeBlobJson = async (key, data) => {
    if (!blobClient) return { url: null };
    try {
        const { put } = blobClient;
        const pathname = BLOB_PATHS[key];
        const dataStr = JSON.stringify(data, null, 2);

        // Use fixed path (no random suffix) so the URL is always the same
        const result = await put(pathname, dataStr, {
            access: "public",
            contentType: "application/json",
            addRandomSuffix: false
        });

        // Cache the URL for this invocation
        if (result && result.url) {
            blobUrlCache[key] = result.url;
        }

        return { url: result.url };
    } catch (error) {
        console.error(`Failed to write blob ${key}:`, error);
        return { url: null };
    }
};

const getValue = async (key, fallback, knownUrl) => {
    if (kvClient) {
        const value = await kvClient.get(key);
        return value ?? fallback;
    }
    if (blobClient) {
        return await readBlobJson(key, fallback, knownUrl);
    }
    return readLocalJson(`${key}.json`, fallback);
};

const setValue = async (key, data) => {
    if (kvClient) {
        await kvClient.set(key, data);
        return { url: null };
    }
    if (blobClient) {
        return await writeBlobJson(key, data);
    }
    writeLocalJson(`${key}.json`, data);
    return { url: null };
};

module.exports = {
    getValue,
    setValue,
    hasKv,
    hasBlob
};