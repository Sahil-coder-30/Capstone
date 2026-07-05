import chokidar from 'chokidar';
import fs from 'fs';
import fsp from 'fs/promises';
import path from 'path';
import { pipeline } from 'stream/promises';
import {
    S3Client,
    DeleteObjectCommand,
    ListObjectsV2Command,
    GetObjectCommand,
} from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';
import pLimit from 'p-limit';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

function required(name) {
    const value = process.env[name];
    if (!value) {
        console.error(`[Sync Agent] Error: ${name} environment variable is not defined.`);
        process.exit(1);
    }
    return value;
}

function int(name, fallback) {
    const raw = process.env[name];
    if (raw === undefined || raw === '') return fallback;
    const parsed = parseInt(raw, 10);
    return Number.isNaN(parsed) ? fallback : parsed;
}

const projectId = required('PROJECT_ID');
const bucketName = required('AWS_BUCKET_NAME');
const region = process.env.AWS_REGION || 'us-east-1';
const localDirectory = process.env.SYNC_ROOT || '/workspace';

const debounceMs = int('SYNC_DEBOUNCE_MS', 400);
const stabilityThresholdMs = int('SYNC_STABILITY_THRESHOLD_MS', 300);
const maxConcurrentUploads = int('MAX_CONCURRENT_UPLOADS', 8);
const maxRetries = int('SYNC_MAX_RETRIES', 5);
const restoreOnStartup = process.env.SYNC_RESTORE_ON_STARTUP !== 'false';
const extraIgnorePatterns = (process.env.SYNC_IGNORE_EXTRA || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

// ---------------------------------------------------------------------------
// Logging
// ---------------------------------------------------------------------------

const ts = () => new Date().toISOString();
const log = {
    info: (...a) => console.log(`[${ts()}] [Sync Agent] [INFO]`, ...a),
    warn: (...a) => console.warn(`[${ts()}] [Sync Agent] [WARN]`, ...a),
    error: (...a) => console.error(`[${ts()}] [Sync Agent] [ERROR]`, ...a),
    debug: (...a) => process.env.DEBUG && console.log(`[${ts()}] [Sync Agent] [DEBUG]`, ...a),
};

log.info('Starting Sync Agent...');
log.info(`Project ID: ${projectId}`);
log.info(`AWS Bucket: ${bucketName} (${region})`);
log.info(`Local Dir:  ${localDirectory}`);

// ---------------------------------------------------------------------------
// S3 client
// ---------------------------------------------------------------------------

// Falls back to the SDK's default credential provider chain (IRSA / instance
// role) if explicit keys aren't set.
const s3Client = new S3Client({
    region,
    ...(process.env.AWS_ACCESS_KEY_ID
        ? {
              credentials: {
                  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
                  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
              },
          }
        : {}),
});

const RETRYABLE_NAMES = new Set([
    'SlowDown', 'RequestTimeout', 'ThrottlingException', 'InternalError',
    'ServiceUnavailable', 'NetworkingError', 'ECONNRESET', 'ETIMEDOUT', 'EPIPE',
]);

function isRetryable(error) {
    const name = error?.name || error?.code;
    const status = error?.$metadata?.httpStatusCode;
    return RETRYABLE_NAMES.has(name) || (typeof status === 'number' && status >= 500);
}

/** Exponential backoff + jitter, but only for genuinely transient errors. */
async function withRetry(fn, label) {
    let attempt = 0;
    // eslint-disable-next-line no-constant-condition
    while (true) {
        try {
            return await fn();
        } catch (error) {
            attempt += 1;
            if (attempt > maxRetries || !isRetryable(error)) throw error;
            const backoffMs = Math.min(1000 * 2 ** (attempt - 1), 15000) + Math.floor(Math.random() * 250);
            log.warn(`${label} failed (attempt ${attempt}/${maxRetries}): ${error.message || error}. Retrying in ${backoffMs}ms`);
            await new Promise((r) => setTimeout(r, backoffMs));
        }
    }
}

/** Streams straight from disk and auto-splits into multipart for large files. */
async function uploadObject(key, filePath) {
    return withRetry(async () => {
        const fileStream = fs.createReadStream(filePath);
        const upload = new Upload({
            client: s3Client,
            params: { Bucket: bucketName, Key: key, Body: fileStream },
            queueSize: 4,
            partSize: 8 * 1024 * 1024,
            leavePartsOnError: false,
        });
        await upload.done();
    }, `upload ${key}`);
}

async function deleteObject(key) {
    return withRetry(
        () => s3Client.send(new DeleteObjectCommand({ Bucket: bucketName, Key: key })),
        `delete ${key}`
    );
}

async function listAllObjects(prefix) {
    const results = [];
    let continuationToken;
    do {
        const response = await withRetry(
            () => s3Client.send(new ListObjectsV2Command({ Bucket: bucketName, Prefix: prefix, ContinuationToken: continuationToken })),
            `list ${prefix}`
        );
        results.push(...(response.Contents || []));
        continuationToken = response.IsTruncated ? response.NextContinuationToken : undefined;
    } while (continuationToken);
    return results;
}

async function downloadObject(key, destPath) {
    return withRetry(async () => {
        const response = await s3Client.send(new GetObjectCommand({ Bucket: bucketName, Key: key }));
        await pipeline(response.Body, fs.createWriteStream(destPath));
    }, `download ${key}`);
}

// ---------------------------------------------------------------------------
// Ignore rules
// ---------------------------------------------------------------------------

const DEFAULT_IGNORE_DIRS = new Set([
    'node_modules', '.git', 'dist', 'build', '.vite', '.next', '.turbo', '.cache', '.parcel-cache',
]);
const DEFAULT_IGNORE_FILES = new Set(['.DS_Store', '.is-new-project']);

const shouldIgnore = (filePath) => {
    const base = path.basename(filePath);
    if (DEFAULT_IGNORE_FILES.has(base)) return true;
    const parts = filePath.split(path.sep);
    if (parts.some((p) => DEFAULT_IGNORE_DIRS.has(p))) return true;
    if (extraIgnorePatterns.length > 0) return extraIgnorePatterns.some((p) => filePath.includes(p));
    return false;
};

// ---------------------------------------------------------------------------
// Queue: per-file ordering + debounce + global concurrency limit
// ---------------------------------------------------------------------------

const limit = pLimit(maxConcurrentUploads);
const chains = new Map();          // relativePath -> tail of its op chain
const debounceEntries = new Map(); // relativePath -> { timer, taskFn }

function enqueue(key, taskFn) {
    const previous = chains.get(key) || Promise.resolve();
    const next = previous.catch(() => {}).then(() => limit(taskFn));
    chains.set(key, next);
    const cleanup = () => { if (chains.get(key) === next) chains.delete(key); };
    next.then(cleanup, cleanup);
    return next;
}

function scheduleDebounced(key, taskFn) {
    const existing = debounceEntries.get(key);
    if (existing) clearTimeout(existing.timer);
    const timer = setTimeout(() => {
        debounceEntries.delete(key);
        enqueue(key, taskFn);
    }, debounceMs);
    debounceEntries.set(key, { timer, taskFn });
}

function enqueueImmediate(key, taskFn) {
    const existing = debounceEntries.get(key);
    if (existing) {
        clearTimeout(existing.timer);
        debounceEntries.delete(key);
    }
    return enqueue(key, taskFn);
}

/** Fires every pending debounced task now and waits for everything to settle. */
async function flushAndDrain() {
    for (const [key, { timer, taskFn }] of debounceEntries) {
        clearTimeout(timer);
        debounceEntries.delete(key);
        enqueue(key, taskFn);
    }
    await Promise.allSettled([...chains.values()]);
}

function pendingCount() {
    return chains.size + debounceEntries.size;
}

// ---------------------------------------------------------------------------
// Sync logic: fs events <-> S3
// ---------------------------------------------------------------------------

function toS3Key(relativePath) {
    return `${projectId}/${relativePath.split(path.sep).join('/')}`;
}

function toRelativePath(filePath) {
    const relative = path.relative(localDirectory, filePath);
    if (relative.startsWith('..') || path.isAbsolute(relative)) return null; // traversal guard
    return relative;
}

async function performUpload(filePath, relativePath) {
    const s3Key = toS3Key(relativePath);
    try {
        const stat = await fsp.stat(filePath);
        if (!stat.isFile()) return; // vanished or became a directory since the event fired
        await uploadObject(s3Key, filePath);
        log.info(`Uploaded ${relativePath} -> ${s3Key} (${stat.size} bytes)`);
    } catch (error) {
        if (error.code === 'ENOENT') {
            log.debug(`Skipped upload, file no longer exists: ${relativePath}`);
            return;
        }
        log.error(`Failed to upload ${relativePath}:`, error.message || error);
    }
}

async function performDelete(relativePath) {
    const s3Key = toS3Key(relativePath);
    try {
        await deleteObject(s3Key);
        log.info(`Deleted ${relativePath} -> ${s3Key}`);
    } catch (error) {
        log.error(`Failed to delete ${relativePath}:`, error.message || error);
    }
}

function handleFileAddOrChange(filePath) {
    const relativePath = toRelativePath(filePath);
    if (relativePath === null) return;
    scheduleDebounced(relativePath, () => performUpload(filePath, relativePath));
}

function handleFileDelete(filePath) {
    const relativePath = toRelativePath(filePath);
    if (relativePath === null) return;
    enqueueImmediate(relativePath, () => performDelete(relativePath));
}

/** S3 has no real directories, so a removed folder means delete-by-prefix. */
async function handleDirectoryDelete(dirPath) {
    const relativePrefix = toRelativePath(dirPath);
    if (relativePrefix === null) return;
    const s3Prefix = `${toS3Key(relativePrefix)}/`;
    try {
        const objects = await listAllObjects(s3Prefix);
        if (objects.length === 0) return;
        log.info(`Directory removed: ${relativePrefix} — deleting ${objects.length} object(s) from S3`);
        await Promise.all(objects.map((obj) => enqueueImmediate(obj.Key, () => deleteObject(obj.Key))));
    } catch (error) {
        log.error(`Failed to clean up directory ${relativePrefix}:`, error.message || error);
    }
}

// ---------------------------------------------------------------------------
// Execution Modes
// ---------------------------------------------------------------------------

async function runRestoreOnly() {
    if (!restoreOnStartup) {
        log.info('Startup restore disabled (SYNC_RESTORE_ON_STARTUP=false). Skipping.');
        process.exit(0);
    }

    log.info('Checking S3 for previously saved workspace state...');
    const prefix = `${projectId}/`;

    let objects;
    try {
        objects = await listAllObjects(prefix);
    } catch (error) {
        log.error('Failed to list S3 objects for restore, continuing with local template as-is:', error.message || error);
        process.exit(0);
    }

    const markerPath = path.join(localDirectory, '.is-new-project');

    if (objects.length === 0) {
        log.info('No saved state in S3 for this project yet. Marking as new project.');
        try {
            await fsp.writeFile(markerPath, 'new');
        } catch (error) {
            log.error('Failed to write .is-new-project marker:', error.message || error);
        }
        process.exit(0);
    }

    log.info(`Found ${objects.length} saved object(s) in S3. Overwriting template with saved state...`);

    let restored = 0, failed = 0;

    await Promise.all(
        objects.map((obj) =>
            limit(async () => {
                const relativePath = obj.Key.slice(prefix.length);
                if (!relativePath || obj.Key.endsWith('/')) return;

                const destPath = path.join(localDirectory, relativePath);

                try {
                    await fsp.mkdir(path.dirname(destPath), { recursive: true });
                    await downloadObject(obj.Key, destPath);
                    restored += 1;
                } catch (error) {
                    failed += 1;
                    log.error(`Failed to restore ${relativePath}:`, error.message || error);
                }
            })
        )
    );

    log.info(`Restore complete: ${restored} restored from S3, ${failed} failed.`);

    // Run npm install to update dependencies for the restored custom files
    log.info('Running npm install to update dependencies...');
    try {
        const { exec } = await import('child_process');
        const { promisify } = await import('util');
        const execAsync = promisify(exec);
        
        await execAsync('npm install', { cwd: localDirectory });
        log.info('npm install completed successfully.');
    } catch (error) {
        log.error('npm install failed:', error.message || error);
    }

    process.exit(0);
}

async function main() {
    log.info('Running in file watcher sidecar mode...');

    const markerPath = path.join(localDirectory, '.is-new-project');
    let isBrandNew = false;
    try {
        await fsp.access(markerPath);
        isBrandNew = true;
        log.info('Detected .is-new-project marker. Watcher will sync initial template files to S3.');
        await fsp.unlink(markerPath);
    } catch {
        log.info('No .is-new-project marker found. Watcher will start with ignoreInitial: true.');
    }

    const watcher = chokidar.watch(localDirectory, {
        persistent: true,
        ignoreInitial: !isBrandNew, // sync existing files on startup only if brand new project
        usePolling: true,     // essential for reliable watching on Docker/K8s volume mounts
        interval: 100,
        binaryInterval: 300,
        ignored: shouldIgnore,
        awaitWriteFinish: {
            stabilityThreshold: stabilityThresholdMs,
            pollInterval: 100,
        },
    });

    watcher
        .on('add', handleFileAddOrChange)
        .on('change', handleFileAddOrChange)
        .on('unlink', handleFileDelete)
        .on('unlinkDir', handleDirectoryDelete)
        .on('error', (error) => log.error('Watcher error:', error))
        .on('ready', () => log.info('Initial directory scan complete. Monitoring for future changes...'));

    let shuttingDown = false;
    async function shutdown(signal) {
        if (shuttingDown) return;
        shuttingDown = true;
        log.info(`Received ${signal}. Closing watcher and flushing pending uploads (${pendingCount()} pending)...`);

        const forceExit = setTimeout(() => {
            log.warn('Flush did not complete in time, exiting anyway.');
            process.exit(1);
        }, 25_000);
        forceExit.unref();

        try {
            await watcher.close();
            await flushAndDrain();
            clearTimeout(forceExit);
            log.info('Shutdown complete.');
            process.exit(0);
        } catch (error) {
            clearTimeout(forceExit);
            log.error('Error during shutdown:', error.message || error);
            process.exit(1);
        }
    }

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
    process.on('unhandledRejection', (reason) => log.error('Unhandled rejection:', reason));
}

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------

const isRestoreOnly = process.argv.includes('--restore-only') || process.env.RESTORE_ONLY === 'true';

if (isRestoreOnly) {
    runRestoreOnly().catch((error) => {
        log.error('Fatal error during restore:', error);
        process.exit(1);
    });
} else {
    main().catch((error) => {
        log.error('Fatal error during startup:', error);
        process.exit(1);
    });
}