import sys
import os

def read_bin(filename, width=32):
    if not os.path.exists(filename):
        print(f"File not found: {filename}")
        return

    size = os.path.getsize(filename)
    print(f"Reading {filename}")
    print(f"Size: {size} bytes")
    
    with open(filename, "rb") as f:
        data = f.read()
        
    print("-" * 60)
    for i in range(0, len(data), width):
        chunk = data[i:i+width]
        # Print offset
        print(f"{i:04X}: ", end="")
        
        # Print bytes as integers (Tile IDs)
        for byte in chunk:
            print(f"{byte:3d}", end=" ")
        print()
    print("-" * 60)

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python read_bin.py <filename> [width]")
    else:
        file_path = sys.argv[1]
        w = 32
        if len(sys.argv) > 2:
            try:
                w = int(sys.argv[2])
            except ValueError:
                pass
        read_bin(file_path, w)
