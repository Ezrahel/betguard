#!/bin/bash
# Keep-alive script for Render Cron Jobs (or cron-job.org / UptimeRobot)
# Pings the app every 10 minutes to prevent free-tier spin-down.
#
# Usage (Render Cron Jobs):
#   Set command to: bash scripts/keep-alive.sh
#   Set schedule to: */10 * * * *
#
# Usage (cron-job.org):
#   URL: https://betguard.onrender.com/api/health
#   Interval: 10 minutes

APP_URL="${APP_URL:-https://betguard.onrender.com}"

curl -s -o /dev/null -w "%{http_code}" "$APP_URL/api/health" || echo "ping failed"
