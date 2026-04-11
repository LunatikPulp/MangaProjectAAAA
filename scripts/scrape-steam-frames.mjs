/**
 * Steam Avatar Frames Scraper
 * Парсит рамки аватаров из Steam Points Shop и сохраняет в public/Frames_shop/
 *
 * Запуск: node scripts/scrape-steam-frames.mjs
 */

import { writeFileSync, mkdirSync, existsSync, createWriteStream } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import https from 'https';
import http from 'http';

const __dirname = dirname(fileURLToPath(import.meta.url));
const TARGET_DIR = join(__dirname, '..', 'public', 'Frames_shop');
const OUTPUT_JSON = join(TARGET_DIR, 'frames_data.json');

const API_URL = 'https://api.steampowered.com/ILoyaltyRewardsService/QueryRewardItems/v1/';
const CDN_BASE = 'https://cdn.fastly.steamstatic.com/steamcommunity/public/images/items';
const COMMUNITY_ITEM_CLASS = 14; // avatar frames
const COUNT_PER_PAGE = 100;
const PRICE = 1666;
const CONCURRENT_DOWNLOADS = 10;
const DELAY_BETWEEN_PAGES = 300;

// Ensure target dir exists
mkdirSync(TARGET_DIR, { recursive: true });

function sleep(ms) {
    return new Promise(r => setTimeout(r, ms));
}

function fetchJson(url) {
    return new Promise((resolve, reject) => {
        const mod = url.startsWith('https') ? https : http;
        mod.get(url, { timeout: 15000 }, (res) => {
            if (res.statusCode !== 200) {
                reject(new Error(`HTTP ${res.statusCode} for ${url}`));
                res.resume();
                return;
            }
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try { resolve(JSON.parse(data)); }
                catch (e) { reject(e); }
            });
        }).on('error', reject);
    });
}

function downloadFile(url, dest, retries = 3) {
    return new Promise((resolve, reject) => {
        const attempt = (n) => {
            const mod = url.startsWith('https') ? https : http;
            mod.get(url, { timeout: 30000 }, (res) => {
                if (res.statusCode === 301 || res.statusCode === 302) {
                    return attempt(n); // follow redirect
                }
                if (res.statusCode !== 200) {
                    if (n > 1) {
                        res.resume();
                        return setTimeout(() => attempt(n - 1), 1000);
                    }
                    reject(new Error(`HTTP ${res.statusCode} for ${url}`));
                    res.resume();
                    return;
                }
                const stream = createWriteStream(dest);
                res.pipe(stream);
                stream.on('finish', () => { stream.close(); resolve(); });
                stream.on('error', (err) => {
                    if (n > 1) setTimeout(() => attempt(n - 1), 1000);
                    else reject(err);
                });
            }).on('error', (err) => {
                if (n > 1) setTimeout(() => attempt(n - 1), 1000);
                else reject(err);
            });
        };
        attempt(retries);
    });
}

async function downloadBatch(items, concurrency) {
    let idx = 0;
    let downloaded = 0;
    const total = items.length;

    async function worker() {
        while (idx < items.length) {
            const i = idx++;
            const item = items[i];
            const dest = join(TARGET_DIR, item.filename);

            if (existsSync(dest)) {
                downloaded++;
                continue;
            }

            try {
                await downloadFile(item.imageUrl, dest);
                downloaded++;
                if (downloaded % 50 === 0 || downloaded === total) {
                    console.log(`  Downloaded ${downloaded}/${total}`);
                }
            } catch (err) {
                console.error(`  FAILED: ${item.filename} - ${err.message}`);
            }
        }
    }

    const workers = Array.from({ length: concurrency }, () => worker());
    await Promise.all(workers);
    console.log(`Download complete: ${downloaded}/${total}`);
}

async function main() {
    console.log('=== Steam Avatar Frames Scraper ===\n');

    let cursor = '*';
    const allFrames = [];
    let page = 0;

    // Fetch all frame definitions
    while (true) {
        page++;
        const params = new URLSearchParams({
            input_json: JSON.stringify({
                community_item_classes: [COMMUNITY_ITEM_CLASS],
                language: 'russian',
                count: COUNT_PER_PAGE,
                cursor: cursor === '*' ? undefined : cursor,
            }),
        });

        const url = `${API_URL}?${params}`;
        console.log(`Page ${page}: fetching (cursor: ${cursor === '*' ? 'start' : cursor.substring(0, 20) + '...'})`);

        let data;
        try {
            data = await fetchJson(url);
        } catch (err) {
            console.error(`API error on page ${page}: ${err.message}`);
            // Retry once
            await sleep(2000);
            try {
                data = await fetchJson(url);
            } catch (err2) {
                console.error(`API retry failed: ${err2.message}. Stopping.`);
                break;
            }
        }

        const response = data.response || {};
        const definitions = response.definitions || [];

        if (definitions.length === 0) {
            console.log('No more definitions. Done fetching.');
            break;
        }

        if (page === 1) {
            console.log(`Total frames available: ${response.total_count}`);
        }

        for (const def of definitions) {
            const cid = def.community_item_data || {};
            const name = cid.item_title || cid.item_name || def.internal_description || `Frame ${def.defid}`;
            const imageHash = cid.item_image_large || cid.item_image_small;

            if (!imageHash) {
                console.warn(`  No image for defid ${def.defid} (${name}), skipping`);
                continue;
            }

            const imageUrl = `${CDN_BASE}/${def.appid}/${imageHash}`;
            const ext = imageHash.endsWith('.gif') ? '.gif' : '.png';
            const filename = `frame_${def.defid}${ext}`;

            allFrames.push({
                key: `frame_${def.defid}`,
                name: '',
                defid: def.defid,
                appid: def.appid,
                imageUrl,
                filename,
                animated: cid.animated || false,
                pointCost: parseInt(def.point_cost) || 0,
            });
        }

        console.log(`  Got ${definitions.length} items (total collected: ${allFrames.length})`);

        cursor = response.next_cursor;
        if (!cursor) {
            console.log('No next cursor. Done fetching.');
            break;
        }

        await sleep(DELAY_BETWEEN_PAGES);
    }

    console.log(`\nTotal frames collected: ${allFrames.length}`);

    // Download images
    console.log(`\nDownloading images to ${TARGET_DIR}...`);
    await downloadBatch(allFrames, CONCURRENT_DOWNLOADS);

    // Generate frames_data.json for backend import
    const shopData = allFrames.map(f => ({
        key: f.key,
        name: '',
        description: 'SPRINGSHOP FRAME',
        category: 'frame',
        price: PRICE,
        preview: `/Frames_shop/${f.filename}`,
        required_level: 0,
    }));

    writeFileSync(OUTPUT_JSON, JSON.stringify(shopData, null, 2), 'utf-8');
    console.log(`\nSaved ${shopData.length} frame entries to ${OUTPUT_JSON}`);
    console.log('Done!');
}

main().catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
});
