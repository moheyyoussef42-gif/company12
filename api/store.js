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

// Use shorter prefix for listing
const BLOB_PREFIXES = {
    bookings: "data/bookings",
    settings: "data/settings"
};

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

const readBlobJson = async (key, fallback, knownUrl) => {
    if (!blobClient) return fallback;
    try {
        // If we have a known URL, use it directly (fastest, no eventual consistency issue)
        if (knownUrl) {
            const response = await fetch(knownUrl, { cache: 'no-store' });
            if (response.ok) {
                const text = await response.text();
                if (text) return JSON.parse(text);
            }
        }

        // Fallback: use list() to find the latest blob
        // Retry up to 5 times with 1s delay to handle Blob eventual consistency
        const { list } = blobClient;
        const prefix = BLOB_PREFIXES[key];
        
        for (let attempt = 0; attempt < 5; attempt++) {
            const blobs = await list({ prefix });
            if (blobs && blobs.blobs.length > 0) {
                // Sort by uploadedAt to get the latest
                const sorted = [...blobs.blobs].sort((a, b) =>
                    new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime()
                );
                const latest = sorted[0];
                const response = await fetch(latest.url, { cache: 'no-store' });
                if (response.ok) {
                    const text = await response.text();
                    if (text) return JSON.parse(text);
                }
            }
            // Wait 1 second before retrying (Blob eventual consistency)
            if (attempt < 4) {
                await sleep(1000);
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

        // Use addRandomSuffix to bypass CDN cache (each write creates a new URL)
        const result = await put(pathname, dataStr, {
            access: "public",
            contentType: "application/json",
            addRandomSuffix: true
        });

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