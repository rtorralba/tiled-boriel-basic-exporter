/// <reference types="@mapeditor/tiled-api" />

let Tiled2BorielBasicExporter = {
    name: "Boriel Basic",
    extension: "bas",
    description: "Export a Tiled map to Boriel Basic format",
    version: "1.0",

    /**
     * @param {TileMap} map
     * @param {string} filename
     */
    write: function (map, filename) {
        let screenWidth = map.property("screenWidth");
        let screenHeight = map.property("screenHeight");
        let m = {
            width: screenWidth,
            height: screenHeight,
            map: []
        };

        // Retrieve entire map maxX and maxY
        let maxX = 0;
        let maxY = 0;

        while (map.layers[0].cellAt(maxX, maxY).tileId !== -1) {
            maxX++;
        }
        maxX--;

        while (map.layers[0].cellAt(maxX, maxY).tileId !== -1) {
            maxY++;
        }
        maxY--;

        tiled.log(`Max size: ${maxX}x${maxY}`);

        // Loop layer tiles and save into map array knowing that map is infinite
        // then we can translate each absolute x,y into screenWidth and screenHeight
        for (let layer of map.layers) {
            if (layer.isTileLayer) {
                for (let y = 0; y <= maxY; y++) {
                    for (let x = 0; x <= maxX; x++) {
                        let tile = layer.cellAt(x, y);
                        if (tile.tileId !== -1) {
                            // Calcular screenNumber
                            let screenX = Math.floor(x / screenWidth);
                            let screenY = Math.floor(y / screenHeight);
                            let screensPerRow = Math.ceil(maxX / screenWidth);
                            let screenNumber = screenX + (screenY * screensPerRow);

                            // Posición local dentro del screen
                            let localX = x % screenWidth;
                            let localY = y % screenHeight;

                            // Inicializar arrays si es necesario
                            if (!m.map[screenNumber]) m.map[screenNumber] = [];
                            if (!m.map[screenNumber][localY]) m.map[screenNumber][localY] = [];

                            // Asignar tileId
                            m.map[screenNumber][localY][localX] = tile.tileId;
                        }
                    }
                }
            }
        }

        let basicStr = "Const SCREENS_COUNT = " + m.map.length + "\n"
        basicStr += "Const SCREEN_WIDTH as Ubyte = " + screenWidth + "\n"
        basicStr += "Const SCREEN_HEIGHT as Ubyte = " + screenHeight + "\n"
        basicStr += "Const SCREEN_LENGTH as Uinteger = " + (screenWidth * screenHeight) + "\n\n"

        basicStr += "Sub drawTile(tileId as Ubyte, x as Ubyte, y as Ubyte)\n"
        basicStr += "    ' Put your code here to draw the tile\n"
        basicStr += "    Print At y, x; tileId\n"
        basicStr += "End Sub\n\n"

        basicStr += "Dim map(" + (m.map.length - 1) + ", " + (screenHeight - 1) + ", " + (screenWidth - 1) + ") as Ubyte = { _\n";
        for (let i = 0; i < m.map.length; i++) {
            basicStr += "  { _\n";
            for (let j = 0; j < screenHeight; j++) {
                basicStr += "    {";
                for (let k = 0; k < screenWidth; k++) {
                    if (m.map[i][j][k] !== undefined) {
                        basicStr += m.map[i][j][k] + ",";
                    } else {
                        basicStr += "0,";
                    }
                }
                // Remove last comma
                basicStr = basicStr.slice(0, -1);
                basicStr += "}, _\n";
            }
            // Remove last comma
            basicStr = basicStr.slice(0, -5);
            basicStr += "} _\n";
            basicStr += "  }, _\n";
        }
        // Remove last comma
        basicStr = basicStr.slice(0, -5);
        basicStr += "} _\n";
        basicStr += "}\n\n";

        basicStr += "Sub mapDraw(screen as Ubyte)\n"
        basicStr += "    Dim index As Uinteger\n"
        basicStr += "    Dim y, x As Ubyte\n"
        basicStr += "    \n"
        basicStr += "    x = 0\n"
        basicStr += "    y = 0\n"
        basicStr += "    \n"
        basicStr += "    For index=0 To SCREEN_LENGTH - 1\n"
        basicStr += "        drawTile(map(screen, y, x), x, y)\n"
        basicStr += "        \n"
        basicStr += "        x = x + 1\n"
        basicStr += "        If x = SCREEN_WIDTH - 1 Then\n"
        basicStr += "            x = 0\n"
        basicStr += "            y = y + 1\n"
        basicStr += "        End If\n"
        basicStr += "    Next index\n"
        basicStr += "End Sub"
        //Save example file for testing
        let file = new TextFile(filename, TextFile.WriteOnly);
        file.write(basicStr);
        file.commit();
    }
};

tiled.registerMapFormat("Boriel Basic", Tiled2BorielBasicExporter);