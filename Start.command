#!/bin/bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
APP="$ROOT/软糖桌宠.app"

pkill -x SoftPet 2>/dev/null || true
"$ROOT/build-macos.command"
open -n "$APP"
