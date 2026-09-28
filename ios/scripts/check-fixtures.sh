#!/usr/bin/env sh
# Run from ios/. ios/Fixtures is the app's source of truth; PackKit test copies must match byte for byte.
# Once the web repo has schema/supplier-pack.schema.json (web PR #6), the app's copy must match it too.
set -e
for f in Fixtures/examples/*.json; do
  cmp "$f" "Packages/PackKit/Tests/PackKitTests/Fixtures/$(basename "$f")"
done
if [ -f ../schema/supplier-pack.schema.json ]; then
  cmp ../schema/supplier-pack.schema.json Fixtures/supplier-pack.schema.json
  echo "schema in sync with web repo"
fi
echo "fixtures in sync"
