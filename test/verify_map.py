import os
import glob
import xml.etree.ElementTree as ET
import re

TMX_FILE = "test/maps.tmx"
BIN_PATTERN = "test/maps*_*.bin"

def verify():
    if not os.path.exists(TMX_FILE):
        print(f"TMX file not found: {TMX_FILE}")
        return

    print(f"Parsing {TMX_FILE}...")
    tree = ET.parse(TMX_FILE)
    root = tree.getroot()

    # Get properties
    properties = {}
    for prop in root.findall(".//property"):
        properties[prop.get("name")] = prop.get("value")

    if "screenWidth" not in properties or "screenHeight" not in properties:
        print("Error: screenWidth or screenHeight properties not found.")
        return

    screen_width = int(properties["screenWidth"])
    screen_height = int(properties["screenHeight"])
    print(f"Screen Size: {screen_width}x{screen_height}")

    # Parse chunks
    map_data = {} # (x, y) -> gid
    
    # We need to find the layer named 'map' or just the first tile layer
    # Looking at TMX content, layer id="1" name="map".
    layer = root.find(".//layer[@name='map']")
    if layer is None:
        layer = root.find(".//layer") # Fallback to first layer
    
    if layer is None:
        print("Error: No tile layer found.")
        return
        
    data = layer.find("data")
    if data is None:
        print("Error: No data in layer.")
        return
        
    if data.get("encoding") != "csv":
        print(f"Error: Unsupported encoding {data.get('encoding')}. Expected csv.")
        return

    chunks = data.findall("chunk")
    
    min_x, min_y, max_x, max_y = float('inf'), float('inf'), float('-inf'), float('-inf')

    for chunk in chunks:
        chunk_x = int(chunk.get("x"))
        chunk_y = int(chunk.get("y"))
        chunk_width = int(chunk.get("width"))
        chunk_height = int(chunk.get("height"))
        
        text = chunk.text.strip()
        gids = [int(x) for x in re.split(r'[,\s]+', text) if x]
        
        for i, gid in enumerate(gids):
            if gid == 0: continue
            
            # Mask flip bits
            gid &= 0x1FFFFFFF
            
            local_x = i % chunk_width
            local_y = i // chunk_width
            global_x = chunk_x + local_x
            global_y = chunk_y + local_y
            
            map_data[(global_x, global_y)] = gid
            
            min_x = min(min_x, global_x)
            min_y = min(min_y, global_y)
            max_x = max(max_x, global_x)
            max_y = max(max_y, global_y)

    print(f"Map Bounds: X=[{min_x}..{max_x}], Y=[{min_y}..{max_y}]")

    # Find binary files
    bin_files = glob.glob(BIN_PATTERN)
    if not bin_files:
        print(f"No binary files found matching {BIN_PATTERN}")
        # Try finding any .bin in test/ that looks like maps...
        return

    print(f"Found {len(bin_files)} binary files.")
    
    # Determine screensPerRow.
    # Exporter logic: maxX is calculated. 
    # Logic: screensPerRow = ceil((maxX + 1) / screenWidth).
    # Assuming map starts at 0,0 for export indexing.
    # If the TMX shows chunks starting at 0, then export index corresponds to global coords.
    
    # Check if we have data at negative coordinates.
    if min_x < 0 or min_y < 0:
        print("Warning: Map has data at negative coordinates. Exporter logic assumes 0-based?")
    
    # Use max_x from parsing to determine geometry
    screens_per_row = (max_x // screen_width) + 1 # Equivalent to ceil((max_x+1)/screen_width) if max_x is 0-indexed index.
    # Actually: ceil((max_x + 1) / width)
    # If max_x = 31, width=32 -> 32/32 = 1.
    # If max_x = 32, width=32 -> 33/32 = 2.
    import math
    screens_per_row = math.ceil((max_x + 1) / screen_width)
    print(f"Calculated screensPerRow: {screens_per_row}")

    all_passed = True

    for bin_file in bin_files:
        # Extract index
        # Expecting e.g. maps_0.bin or maps._0.bin
        # Regex to find last number before .bin
        match = re.search(r'_(\d+)\.bin$', bin_file)
        if not match:
            print(f"Skipping {bin_file}: Cannot parse screen index.")
            continue
            
        screen_index = int(match.group(1))
        
        with open(bin_file, "rb") as f:
            content = f.read()
            
        if len(content) != screen_width * screen_height:
            print(f"[FAIL] {bin_file}: Size {len(content)} != Expected {screen_width*screen_height}")
            all_passed = False
            continue
            
        # Verify content
        screen_y = screen_index // screens_per_row
        screen_x = screen_index % screens_per_row
        
        start_x = screen_x * screen_width
        start_y = screen_y * screen_height
        
        file_passed = True
        for i, byte_val in enumerate(content):
            lx = i % screen_width
            ly = i // screen_width
            
            gx = start_x + lx
            gy = start_y + ly
            
            expected_gid = map_data.get((gx, gy), 0)
            
            # TMX uses GIDs (1-based usually). Exporter writes TileIDs (0-based).
            # We assume firstgid=1.
            # GID 0 (empty) -> 0 in binary (default Uint8)
            # GID 1 (ID 0)  -> 0 in binary
            # GID X         -> X - 1 in binary
            
            if expected_gid == 0:
                expected_val = 0
            else:
                expected_val = expected_gid - 1
            
            if byte_val != expected_val:
                print(f"[FAIL] {bin_file} at ({lx},{ly}): Found {byte_val}, Expected {expected_val} (GID {expected_gid})")
                file_passed = False
                break
        
        if file_passed:
            print(f"[PASS] {bin_file} verified.")
        else:
            all_passed = False

    if all_passed:
        print("\nSUCCESS: All files verified against TMX.")
    else:
        print("\nFAILURE: Verification failed.")

if __name__ == "__main__":
    verify()
