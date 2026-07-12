import os
from dotenv import load_dotenv

load_dotenv()

FIREBASE_WEB_API_KEY = os.getenv("FIREBASE_WEB_API_KEY")
FIREBASE_CONFIG_JSON = os.getenv("FIREBASE_CONFIG_JSON")
FIREBASE_DATABASE_URL = os.getenv("FIREBASE_DATABASE_URL")
SESSION_SECRET_KEY = os.getenv("SESSION_SECRET_KEY", "fallback-secret")

TURN_SERVER_URL = os.getenv("TURN_SERVER_URL")
TURN_USERNAME = os.getenv("TURN_USERNAME")
TURN_CREDENTIAL = os.getenv("TURN_CREDENTIAL")

# Note: This deployment uses STUN only (Google STUN) to avoid TURN costs.
# If you later want TURN support, add TURN_SERVER_URL, TURN_USERNAME, and
# TURN_CREDENTIAL environment variables and update `routes/pages.py` to include them.