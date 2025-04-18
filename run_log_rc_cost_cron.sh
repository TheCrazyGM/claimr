#!/bin/bash
# Cron runner for log_rc_cost.py
# Ensures .env is loaded and script is run from the correct directory

# Absolute path to this script's directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR" || exit

# Load environment variables from .env if it exists
if [ -f .env ]; then
  # shellcheck disable=SC1091
  set -o allexport
  source .env
  set +o allexport
fi

# Activate virtual environment if it exists
if [ -d .venv ]; then
  source .venv/bin/activate
fi

# Run the logger script
python log_rc_cost.py
