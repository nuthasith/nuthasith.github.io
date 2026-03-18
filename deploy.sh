#!/bin/bash
set -e

cd "$(dirname "$0")/quickstart"

echo "Building site..."
hugo

echo "Copying output to repository root..."
cp -r public/* ..

echo "Done! Review changes with 'git status', then commit and push."
