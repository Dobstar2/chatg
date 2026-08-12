#!/usr/bin/env bash
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$root"

required=(
  "SpatialHands.xcodeproj/project.pbxproj"
  "SpatialHands.xcodeproj/xcshareddata/xcschemes/SpatialHands.xcscheme"
  "SpatialHands/Info.plist"
  "SpatialHands/SpatialHandsApp.swift"
  "SpatialHands/Camera/CameraPreviewView.swift"
  "SpatialHands/Camera/HandTrackingController.swift"
  "SpatialHands/Interaction/HandGestureMath.swift"
  "SpatialHands/UI/SpatialHomeView.swift"
  "SpatialHandsTests/HandGestureMathTests.swift"
)

for path in "${required[@]}"; do
  [[ -f "$path" ]] || { echo "Missing required file: $path" >&2; exit 1; }
done

plutil -lint SpatialHands/Info.plist >/dev/null
plutil -lint SpatialHands.xcodeproj/project.pbxproj >/dev/null

while IFS= read -r file; do
  swiftc -parse "$file"
done < <(find SpatialHands SpatialHandsTests -type f -name '*.swift' -print | sort)

if command -v swift-format >/dev/null 2>&1; then
  swift-format lint --recursive SpatialHands SpatialHandsTests
fi

echo "Static project checks passed."
echo "A full build requires macOS and Xcode; GitHub Actions runs it automatically after push."
