/// <reference types="@mapeditor/tiled-api" />

let BinaryRoomExporter = {
    name: "Binary Room Exporter",
    extension: "bin",
    description: "Export each room of a Tiled map to a separate binary file",
    version: "1.0",

    /**
     * @param {TileMap} map
     * @param {string} filename
     */
    write: function (map, filename) {
        let screenWidth = map.property("screenWidth");
        let screenHeight = map.property("screenHeight");

        if (!screenWidth || !screenHeight) {
            tiled.alert("Please set 'screenWidth' and 'screenHeight' custom properties on the map.");
            return;
        }

        // Retrieve entire map maxX and maxY
        // Note: tiled2boriel logic assumes the first layer determines the map size based on non-empty cells
        let maxX = 0;
        let maxY = 0;

        // Find map bounds by looking for the last non-empty tile in the first layer
        // This logic is copied from tiled2boriel.js
        while (map.layers[0].cellAt(maxX, maxY).tileId !== -1) {
            maxX++;
        }
        maxX--;

        while (map.layers[0].cellAt(maxX, maxY).tileId !== -1) {
            maxY++;
        }
        maxY--;

        tiled.log(`Exporting binary map. Max size: ${maxX + 1}x${maxY + 1}. Screen size: ${screenWidth}x${screenHeight}`);

        let screens = [];
        let screensPerRow = Math.ceil((maxX + 1) / screenWidth);
        let screensPerCol = Math.ceil((maxY + 1) / screenHeight);
        let totalScreens = screensPerRow * screensPerCol;

        // Initialize screens
        for (let i = 0; i < totalScreens; i++) {
            screens[i] = new Uint8Array(screenWidth * screenHeight);
        }

        // Loop layer tiles and save into screens
        for (let layer of map.layers) {
            if (layer.isTileLayer) {
                for (let y = 0; y <= maxY; y++) {
                    for (let x = 0; x <= maxX; x++) {
                        let tile = layer.cellAt(x, y);
                        if (tile.tileId !== -1) {
                            let screenX = Math.floor(x / screenWidth);
                            let screenY = Math.floor(y / screenHeight);
                            let screenNumber = screenX + (screenY * screensPerRow);

                            let localX = x % screenWidth;
                            let localY = y % screenHeight;
                            let index = localY * screenWidth + localX;

                            // We take only the first layer's tiles or merge them? 
                            // tiled2boriel seems to just overwrite if multiple layers have tiles at same spot.
                            // Here we'll do the same for simplicity, or just use the first tile layer found.
                            screens[screenNumber][index] = tile.tileId;
                        }
                    }
                }
            }
        }

        // Save each screen to a separate file
        let baseFilename = filename.replace(/\.bin$/, "");

        for (let i = 0; i < screens.length; i++) {
            let screenFilename = `${baseFilename}_${i}.bin`;
            let file = new BinaryFile(screenFilename, BinaryFile.WriteOnly);

            // Create a buffer from the Uint8Array
            let buffer = screens[i].buffer;
            file.write(buffer);
            file.commit();
            tiled.log(`Exported screen ${i} to ${screenFilename}`);
        }

        tiled.log("Binary export completed successfully.");
    }
};

tiled.registerMapFormat("Binary Room Exporter", BinaryRoomExporter);
