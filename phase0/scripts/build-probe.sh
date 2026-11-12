#!/bin/sh
# Bundle the probe function (local Edge runtime cannot fetch npm packages) and add node: prefixes.
set -e
cd "$(dirname "$0")/../supabase/functions/probe"
../../../node_modules/.bin/esbuild src.ts --bundle --format=esm --platform=node --target=es2022 --outfile=index.js --external:node:* --log-level=warning
B='net|tls|crypto|os|fs|stream|events|string_decoder|perf_hooks|dns|util|buffer|path|url|zlib|http|https|assert|child_process|readline|querystring|timers'
sed -E -i "s#from \"($B)\"#from \"node:\1\"#g; s#import\(\"($B)\"\)#import(\"node:\1\")#g; s#require\(\"($B)\"\)#require(\"node:\1\")#g" index.js
cp index.js index.ts
