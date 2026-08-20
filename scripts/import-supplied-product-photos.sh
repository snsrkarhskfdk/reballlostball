#!/usr/bin/env bash
set -euo pipefail

SOURCE_DIR="${1:?usage: import-supplied-product-photos.sh SOURCE_DIR}"
OUTPUT_DIR="${2:-assets/figma/product-actual}"
mkdir -p "$OUTPUT_DIR"

convert_one() {
  local source="$1"
  local target="$2"
  convert "$SOURCE_DIR/$source" -auto-orient -resize '1600x1600>' -strip -quality 82 "$OUTPUT_DIR/$target"
}

numbered_five() {
  local source_base="$1"
  local target_base="$2"
  convert_one "${source_base}.jpg" "${target_base}-01.webp"
  for index in 1 2 3 4; do
    printf -v padded '%02d' "$((index + 1))"
    convert_one "${source_base}${index}.jpg" "${target_base}-${padded}.webp"
  done
}

numbered_four() {
  local source_base="$1"
  local target_base="$2"
  convert_one "${source_base}.jpg" "${target_base}-01.webp"
  for index in 1 2 3; do
    printf -v padded '%02d' "$((index + 1))"
    convert_one "${source_base}${index}.jpg" "${target_base}-${padded}.webp"
  done
}

numbered_five "타이틀" "titleist-pro-v1"
numbered_five "타이틀X" "titleist-pro-v1x"
numbered_five "테일러" "taylormade"
numbered_five "브릿지" "bridgestone"
numbered_five "스릭슨" "srixon"
numbered_five "캘러웨이" "callaway"
numbered_five "세인트" "saintnine"
numbered_five "볼빅" "volvik-white"

numbered_four "볼빅노" "volvik-yellow"
numbered_four "볼빅노비" "volvik-yellow-vivid"
numbered_four "볼빅빨" "volvik-red"
numbered_four "볼빅빨비" "volvik-red-vivid"
numbered_four "볼빅주" "volvik-orange"
numbered_four "볼빅주비" "volvik-orange-vivid"
numbered_four "볼빅초" "volvik-green"
numbered_four "볼빅초비" "volvik-green-vivid"
numbered_four "볼빅핑" "volvik-pink"

convert_one "볼빅 A+ 컬러.jpg" "volvik-color-a-plus.webp"
convert_one "일반 브랜드 A+.jpg" "general-color-a-plus-01.webp"
convert_one "일반 브랜드 A+ 1.jpg" "general-color-a-plus-02.webp"
convert_one "일반브랜드 화이트 A+.jpg" "general-white-a-plus-01.webp"
convert_one "일반 브랜드 화이트 A+ 1.jpg" "general-white-a-plus-02.webp"

actual_count="$(find "$OUTPUT_DIR" -maxdepth 1 -type f -name '*.webp' | wc -l | tr -d ' ')"
if [[ "$actual_count" != "81" ]]; then
  echo "expected 81 converted photos, found $actual_count" >&2
  exit 1
fi

echo "Imported $actual_count supplied product photos into $OUTPUT_DIR"
