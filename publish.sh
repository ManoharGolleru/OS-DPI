#!/usr/bin/env sh

# abort on errors
set -e

cd ../../production-OS-DPI
git pull --no-edit ../OS-DPI

cd src
npm install
./deploy.sh
