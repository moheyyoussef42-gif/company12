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

// In-memory cache for blob URLs (avoids eventual consistency delay of list())
const blobUrlCache = {};

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

const readBlobJson = async (key, fallback) => {
    if (!blobClient) return fallback;
    try {
        // First try the cached URL (fastest, no eventual consistency issue)
        if (blobUrlCache[key]) {
            const response = await fetch(blobUrlCache[key], { cache: 'no-store' });
            if (response.ok) {
                const text = await response.text();
                if (text) return JSON.parse(text);
            }
        }

        // Fallback: use list() to find the blob
        const { list } = blobClient;
        const pathname = BLOB_PATHS[key];
        const blobs = await list({ prefix: pathname });
        if (!blobs || blobs.blobs.length === 0) {
            return fallback;
        }
        const latest = blobs.blobs[0];
        // Cache the URL for next time
        blobUrlCache[key] = latest.url;
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

        // put() returns the blob URL immediately - save it to cache
        // so subsequent reads can use it directly without list() (which has eventual consistency delay)
        const result = await put(pathname, dataStr, {
            access: "public",
            contentType: "application/json",
            addRandomSuffix: false
        });

        // Cache the URL returned by put() for instant reads
        if (result && result.url) {
            blobUrlCache[key] = result.url;
        }
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