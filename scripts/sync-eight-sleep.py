#!/usr/bin/env python3
"""
Reads Eight Sleep text messages from iMessage and pushes metrics
to the workout tracker API.

Usage:
  python3 scripts/sync-eight-sleep.py              # sync today's message
  python3 scripts/sync-eight-sleep.py --days 14    # backfill last 14 days

Requires:
  CRON_SECRET env var (or reads from .env.local)
  APP_URL env var (defaults to https://workout-tracker-two-alpha.vercel.app)
"""

import sqlite3
import re
import json
import os
import sys
import urllib.request

EIGHT_SLEEP_HANDLE_IDS = (2825, 3052)  # Eight Sleep SMS sender and smsfp variant
MESSAGES_DB = os.path.expanduser("~/Library/Messages/chat.db")
DEFAULT_APP_URL = "https://workout-tracker-two-alpha.vercel.app"


def load_env():
    """Load CRON_SECRET from .env.local if not in environment."""
    env_file = os.path.join(os.path.dirname(os.path.dirname(__file__)), ".env.local")
    if os.path.exists(env_file):
        with open(env_file) as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith("#") and "=" in line:
                    key, val = line.split("=", 1)
                    if key.strip() not in os.environ:
                        os.environ[key.strip()] = val.strip().strip('"').strip("'")


def extract_text_from_attributed_body(blob):
    """Extract plain text from NSAttributedString blob."""
    text = blob.decode("utf-8", errors="ignore")
    chunks = re.findall(r"[\x20-\x7E\n]{15,}", text)
    if not chunks:
        return None
    content = max(chunks, key=len).strip()
    # Clean leading + that sometimes appears
    if content.startswith("+"):
        content = content[1:]
    return content


def read_eight_sleep_messages(days=1):
    """Read Eight Sleep messages from the last N days."""
    conn = sqlite3.connect(MESSAGES_DB)
    cur = conn.cursor()

    # Get messages from the last N days
    import time

    handle_ids = ",".join(str(h) for h in EIGHT_SLEEP_HANDLE_IDS)
    cutoff_epoch = int(time.time()) - (days * 86400)
    cur.execute(
        f"""SELECT m.attributedBody, datetime(m.date/1000000000 + 978307200, 'unixepoch', 'localtime')
        FROM message m
        WHERE m.handle_id IN ({handle_ids})
        AND m.attributedBody IS NOT NULL
        AND m.date/1000000000 + 978307200 > {cutoff_epoch}
        ORDER BY m.date DESC""",
    )

    entries = []
    for row in cur.fetchall():
        blob, timestamp = row
        text = extract_text_from_attributed_body(blob)
        if not text or "Sleep Fitness Score" not in text:
            continue

        # The message date is the morning it was received - that's the date for the data
        # (the sleep data is for the previous night, but we index by the morning date)
        date_str = timestamp.split(" ")[0]  # "2026-04-08"
        entries.append({"date": date_str, "text": text})

    conn.close()
    return entries


def push_to_api(entries, app_url, cron_secret):
    """Push entries to the workout tracker API."""
    url = f"{app_url}/api/cron/sync-eight-sleep"
    data = json.dumps({"entries": entries}).encode("utf-8")

    req = urllib.request.Request(
        url,
        data=data,
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {cron_secret}",
        },
        method="POST",
    )

    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            result = json.loads(resp.read().decode())
            return result
    except urllib.error.HTTPError as e:
        body = e.read().decode()
        print(f"API error {e.code}: {body}")
        return None
    except Exception as e:
        print(f"Request failed: {e}")
        return None


def main():
    load_env()

    days = 1
    if "--days" in sys.argv:
        idx = sys.argv.index("--days")
        if idx + 1 < len(sys.argv):
            days = int(sys.argv[idx + 1])

    cron_secret = os.environ.get("CRON_SECRET")
    if not cron_secret:
        print("Error: CRON_SECRET not set (check .env.local or environment)")
        sys.exit(1)

    app_url = os.environ.get("APP_URL", DEFAULT_APP_URL)

    print(f"Reading Eight Sleep messages from last {days} days...")
    entries = read_eight_sleep_messages(days)

    if not entries:
        print("No Eight Sleep messages found.")
        return

    print(f"Found {len(entries)} messages:")
    for e in entries:
        print(f"  {e['date']}: {e['text'][:60]}...")

    print(f"\nPushing to {app_url}...")
    result = push_to_api(entries, app_url, cron_secret)

    if result:
        print(f"Done! Imported {result.get('imported', 0)}/{result.get('total', 0)} entries")
        for r in result.get("results", []):
            status = r["status"]
            metrics = r.get("metrics", {})
            score = metrics.get("sleepFitnessScore", "?")
            print(f"  {r['date']}: {status} (score: {score})")
    else:
        print("Failed to push data.")
        sys.exit(1)


if __name__ == "__main__":
    main()
