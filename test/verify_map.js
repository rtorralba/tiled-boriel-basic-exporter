const fs = require('fs');
const path = require('path');

// Configuration
const TMX_FILE = path.join(__dirname, 'maps.tmx');
const BIN_BASE_NAME = path.join(__dirname, 'maps'); // Expects maps_0.bin, maps_1.bin...

function parseTMX(filePath) {
    const content = fs.readFileSync(filePath, 'utf8');

    // Extract screen dimensions
    const screenWidthMatch = content.match(/<property name="screenWidth" type="int" value="(\d+)"\/>/);
    const screenHeightMatch = content.match(/<property name="screenHeight" type="int" value="(\d+)"\/>/);

    if (!screenWidthMatch || !screenHeightMatch) {
        throw new Error("Could not find screenWidth or screenHeight properties in TMX.");
    }

    const screenWidth = parseInt(screenWidthMatch[1]);
    const screenHeight = parseInt(screenHeightMatch[1]);

    console.log(`Expected Screen Size: ${screenWidth}x${screenHeight}`);

    // Parse Chunks
    // Regex to find chunks
    const chunkRegex = /<chunk x="(-?\d+)" y="(-?\d+)" width="(\d+)" height="(\d+)">([\s\S]*?)<\/chunk>/g;
    let match;
    const mapData = {}; // key: "x,y" (global), value: gid

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

    while ((match = chunkRegex.exec(content)) !== null) {
        const chunkX = parseInt(match[1]);
        const chunkY = parseInt(match[2]);
        const chunkW = parseInt(match[3]);
        const chunkH = parseInt(match[4]);
        const chunkContent = match[5].trim();

        const gids = chunkContent.split(/[,\s]+/).map(s => parseInt(s)).filter(n => !isNaN(n));

        for (let i = 0; i < gids.length; i++) {
            const localX = i % chunkW;
            const localY = Math.floor(i / chunkW);
            const globalX = chunkX + localX;
            const globalY = chunkY + localY;

            // Mask out flip bits (high 3 bits)
            // 0xFFFFFFFF >>> 0 to ensure unsigned in JS logic if needed, but here simple mask works
            const gid = gids[i] & 0x1FFFFFFF;

            if (gid !== 0) { // Store only non-empty
                mapData[`${globalX},${globalY}`] = gid;

                if (globalX > maxX) maxX = globalX;
                if (globalY > maxY) maxY = globalY;
                if (globalX < minX) minX = globalX;
                if (globalY < minY) minY = globalY;
            }
        }
    }

    console.log(`Map Bounds (Chunks): X=[${minX}..${maxX}], Y=[${minY}..${maxY}]`);
    return { screenWidth, screenHeight, mapData, maxX, maxY };
}

function verify() {
    console.log("Starting verification...");

    if (!fs.existsSync(TMX_FILE)) {
        console.error("TMX file not found:", TMX_FILE);
        return;
    }

    const { screenWidth, screenHeight, mapData, maxX, maxY } = parseTMX(TMX_FILE);

    // Determine expected number of screens
    // The export script logic:
    // while (cellAt(maxX, maxY) != -1)... starts at 0,0?
    // tmx bounds might not start at 0.
    // Assuming map starts at 0,0 for export logic (since it iterates x=0, y=0...)

    // We'll trust the exporter's file naming: maps_0.bin, maps_1.bin...
    // We check locally for files matching pattern.

    const dir = path.dirname(BIN_BASE_NAME);
    const base = path.basename(BIN_BASE_NAME);
    const files = fs.readdirSync(dir).filter(f => f.startsWith(base + '_') && f.endsWith('.bin'));

    if (files.length === 0) {
        console.log("No exported binary files found. Please export 'maps.tmx' to 'maps.bin' (generating maps_*.bin) first.");
        return;
    }

    console.log(`Found ${files.length} binary files to verify.`);

    // Re-calculate screensPerRow to decode screen index
    // We assume export max is same as our parsed max, BUT exporter calculates it by scanning.
    // If we assume the map goes from 0 to maxX found in chunks.
    const effectiveMaxX = Math.max(0, maxX); // Ensure non-negative? 
    // Actually, if chunks start at 0, maxX is accurate.

    const screensPerRow = Math.ceil((effectiveMaxX + 1) / screenWidth);
    console.log(`Calculated screensPerRow: ${screensPerRow}`);

    let allPassed = true;

    files.forEach(file => {
        const filePath = path.join(dir, file);
        const match = file.match(/_(\d+)\.bin$/);
        if (!match) return;

        const screenIndex = parseInt(match[1]);
        const content = fs.readFileSync(filePath);

        if (content.length !== screenWidth * screenHeight) {
            console.error(`[FAIL] ${file}: File size ${content.length} does not match expected ${screenWidth * screenHeight}`);
            allPassed = false;
            return;
        }

        // Determine screen position
        const screenY = Math.floor(screenIndex / screensPerRow);
        const screenX = screenIndex % screensPerRow;

        const startX = screenX * screenWidth;
        const startY = screenY * screenHeight;

        // Verify content
        for (let i = 0; i < content.length; i++) {
            const val = content[i];

            const lx = i % screenWidth;
            const ly = Math.floor(i / screenWidth);

            const gx = startX + lx;
            const gy = startY + ly;

            const expectedGid = mapData[`${gx},${gy}`] || 0;

            // Note: Expected GID 0 means empty. 
            // Binary might have 0 for empty?
            // Also need to handle tile ID mapping if the exporter uses local ID.
            // But we assume GID match for now.

            // NOTE: Tiled's tileId -1 (if that's what it returns for empty) vs 0.
            // If the script writes tileId, and tileId is GID...
            // Wait, if tileId is -1 for empty, writing it to Uint8 might wrap to 255?
            // The script: `if (tile.tileId !== -1) screens[...]=tileId`
            // Else `screens` is initialized to 0 (default Uint8Array).
            // So empty is 0.
            // So if mapData has 0, value should be 0.

            if (val !== expectedGid) {
                // Heuristic for local ID vs GID mismatch
                if (val === expectedGid - 1) {
                    // Maybe it exported local ID?
                    console.error(`[FAIL] ${file} at local(${lx},${ly}) global(${gx},${gy}): Value ${val} != Expected ${expectedGid}. (Looks like GID-1?)`);
                    allPassed = false;
                    return; // Report first error per file to avoid spam
                }

                console.error(`[FAIL] ${file} at local(${lx},${ly}) global(${gx},${gy}): Value ${val} != Expected ${expectedGid}`);
                allPassed = false;
                // return; 
            }
        }
        console.log(`[PASS] ${file} verified.`);
    });

    if (allPassed) {
        console.log("TYPE: SUCCESS. All binary files match TMX data.");
    } else {
        console.log("TYPE: FAILURE. Some files did not match.");
    }
}

verify();
