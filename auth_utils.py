import requests
from config import FIREBASE_WEB_API_KEY
from firebase_admin import auth as admin_auth

IDENTITY_TOOLKIT_URL = "https://identitytoolkit.googleapis.com/v1/accounts"

def sign_up(email: str, password: str) -> dict:
    """Create user via Firebase Auth REST API, returns {idToken, localId}."""
    url = f"{IDENTITY_TOOLKIT_URL}:signUp?key={FIREBASE_WEB_API_KEY}"
    payload = {"email": email, "password": password, "returnSecureToken": True}
    resp = requests.post(url, json=payload)
    if resp.status_code != 200:
        error = resp.json().get("error", {}).get("message", "Signup failed")
        raise Exception(error)
    return resp.json()

def sign_in(email: str, password: str) -> dict:
    """Sign in via Firebase Auth REST API, returns {idToken, localId}."""
    url = f"{IDENTITY_TOOLKIT_URL}:signInWithPassword?key={FIREBASE_WEB_API_KEY}"
    payload = {"email": email, "password": password, "returnSecureToken": True}
    resp = requests.post(url, json=payload)
    if resp.status_code != 200:
        error = resp.json().get("error", {}).get("message", "Login failed")
        raise Exception(error)
    return resp.json()

def verify_token(token: str) -> dict:
    """Verify ID token with Firebase Admin SDK, returns decoded claims."""
    return admin_auth.verify_id_token(token)