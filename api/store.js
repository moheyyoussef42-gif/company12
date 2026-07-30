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

// Extract Vercel Blob account name from the token
// Token format: vercel_blob_rw_<account>_<secret>
let blobAccount = null;
if (process.env.BLOB_READ_WRITE_TOKEN) {
    const parts = process.env.BLOB_READ_WRITE_TOKEN.split("_");
    if (parts.length >= 4) {
        blobAccount = parts[3]; // The account name
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

// Construct the fixed public URL for a blob
// Format: https://<account>.public.blob.vercel-storage.com/<path>
const getBlobPublicUrl = (key) => {
    if (!blobAccount) return null;
    const pathname = BLOB_PATHS[key];
    return `https://${blobAccount}.public.blob.vercel-storage.com/${pathname}`;
};

const readBlobJson = async (key, fallback, knownUrl) => {
    if (!blobClient) return fallback;
    try {
        // Priority 1: If client provided a known URL, use ONLY that.
        // This is critical because list() may return stale data due to eventual consistency.
        if (knownUrl) {
            const response = await fetch(knownUrl, { cache: 'no-store' });
            if (response.ok) {
                const text = await response.text();
                if (text) return JSON.parse(text);
            }
            // If known URL fails, return fallback instead of falling back to list()
            // to avoid overwriting fresh data with stale list() results
            return fallback;
        }

        // Priority 2: Use fixed public URL (no list() needed, instant consistency)
        const fixedUrl = getBlobPublicUrl(key);
        if (fixedUrl) {
            const response = await fetch(fixedUrl, { cache: 'no-store' });
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