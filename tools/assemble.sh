#!/usr/bin/env bash
# Builds the deployable app into $1 (default _site) and stamps the build id
# ($BUILD, else the short commit) so every deploy is a new service-worker version.
set -euo pipefail
out="${1:-_site}"
build="${BUILD:-$(git rev-parse --short=7 HEAD)}"
rm -rf "$out" && mkdir -p "$out"
cp -r index.html manifest.webmanifest sw.js css js vendor icons _headers "$out"/
sed -i "s/^const VERSION = .*/const VERSION = 'yes-chef-$build'/" "$out/sw.js"
sed -i "s/^export const BUILD = .*/export const BUILD = '$build'/" "$out/js/version.js"
grep -q "yes-chef-$build" "$out/sw.js" && grep -q "'$build'" "$out/js/version.js"
echo "assembled $out ($build)"
