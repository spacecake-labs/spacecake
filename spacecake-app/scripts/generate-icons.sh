#!/bin/bash

# generate-icons.sh - Generate macOS app icons from SVG
# Usage: ./generate-icons.sh [path-to-icon.svg]

set -e  # exit on any error

# check if inkscape is installed
if ! command -v inkscape &> /dev/null; then
    echo "error: inkscape is not installed. install with: brew install inkscape"
    exit 1
fi

# get the svg file path
SVG_FILE="${1:-icon.svg}"

# check if svg file exists
if [ ! -f "$SVG_FILE" ]; then
    echo "error: svg file '$SVG_FILE' not found"
    echo "usage: $0 [path-to-icon.svg]"
    exit 1
fi

# create iconset directory
echo "creating icon.iconset directory..."
mkdir -p icon.iconset

# generate standard resolution icons
echo "generating standard resolution icons..."
inkscape "$SVG_FILE" --export-type=png --export-filename=icon.iconset/icon_16x16.png --export-width=16 --export-height=16
inkscape "$SVG_FILE" --export-type=png --export-filename=icon.iconset/icon_32x32.png --export-width=32 --export-height=32
inkscape "$SVG_FILE" --export-type=png --export-filename=icon.iconset/icon_64x64.png --export-width=64 --export-height=64
inkscape "$SVG_FILE" --export-type=png --export-filename=icon.iconset/icon_128x128.png --export-width=128 --export-height=128
inkscape "$SVG_FILE" --export-type=png --export-filename=icon.iconset/icon_256x256.png --export-width=256 --export-height=256
inkscape "$SVG_FILE" --export-type=png --export-filename=icon.iconset/icon_512x512.png --export-width=512 --export-height=512
inkscape "$SVG_FILE" --export-type=png --export-filename=icon.iconset/icon_1024x1024.png --export-width=1024 --export-height=1024

# generate retina display (@2x) versions for high-dpi screens
echo "generating retina display icons..."
inkscape "$SVG_FILE" --export-type=png --export-filename=icon.iconset/icon_32x32@2x.png --export-width=64 --export-height=64
inkscape "$SVG_FILE" --export-type=png --export-filename=icon.iconset/icon_64x64@2x.png --export-width=128 --export-height=128
inkscape "$SVG_FILE" --export-type=png --export-filename=icon.iconset/icon_128x128@2x.png --export-width=256 --export-height=256
inkscape "$SVG_FILE" --export-type=png --export-filename=icon.iconset/icon_256x256@2x.png --export-width=512 --export-height=512
inkscape "$SVG_FILE" --export-type=png --export-filename=icon.iconset/icon_512x512@2x.png --export-width=1024 --export-height=1024

# convert iconset to .icns file
echo "converting to .icns file..."
iconutil -c icns icon.iconset

# clean up temporary iconset directory
echo "cleaning up temporary files..."
rm -rf icon.iconset

echo "icon.icns generated successfully!"
