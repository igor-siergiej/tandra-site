#!/usr/bin/env bash
# Encodes the raw recordings from record.ts (content/clips/raw/<name>/frames.txt, an ffmpeg concat list of timed
# screencast frames, + raw/<name>.json) into the files the landing page serves: public/clips/<name>.mp4 (H.264),
# <name>.webm (VP9) and <name>.webp (poster). Fails if any clip is over 30 s or either video file is over 2 MiB.
#
#   content/clips/build.sh [import] [plan] [shop]
set -euo pipefail

cd "$(dirname "$0")"
out=../../public/clips
mkdir -p "$out"

max_bytes=$((2 * 1024 * 1024))
# Screencast frames arrive only on change; fps=30 makes the stream constant-rate. 540 px wide is 2x the clip's
# on-page width; -2 keeps the height even for the encoders.
filters=fps=30,scale=540:-2:flags=lanczos

names=("$@")
[ ${#names[@]} -eq 0 ] && names=(import plan shop)

for name in "${names[@]}"; do
    marks=raw/$name.json
    start=$(jq -r .start "$marks")
    end=$(jq -r .end "$marks")
    poster=$(jq -r .poster "$marks")
    if awk -v s="$start" -v e="$end" 'BEGIN { exit !(e - s > 30) }'; then
        echo "$name: $(awk -v s="$start" -v e="$end" 'BEGIN { print e - s }') s is over the 30 s limit" >&2
        exit 1
    fi

    trim=(-f concat -safe 0 -i "raw/$name/frames.txt" -ss "$start" -to "$end")
    ffmpeg -loglevel error -y "${trim[@]}" -vf "$filters" -an \
        -c:v libx264 -preset slow -crf 26 -profile:v high -pix_fmt yuv420p -movflags +faststart \
        "$out/$name.mp4"
    ffmpeg -loglevel error -y "${trim[@]}" -vf "$filters" -an \
        -c:v libvpx-vp9 -crf 36 -b:v 0 -row-mt 1 -deadline good -cpu-used 1 \
        "$out/$name.webm"
    ffmpeg -loglevel error -y -ss "$poster" -i "$out/$name.mp4" -frames:v 1 -c:v libwebp -quality 80 \
        "$out/$name.webp"

    for file in "$out/$name.mp4" "$out/$name.webm"; do
        bytes=$(stat -c %s "$file")
        if [ "$bytes" -gt "$max_bytes" ]; then
            echo "$file is $bytes bytes, over the 2 MiB budget" >&2
            exit 1
        fi
    done
    echo "$name: $(stat -c %s "$out/$name.mp4") B mp4, $(stat -c %s "$out/$name.webm") B webm"
done
