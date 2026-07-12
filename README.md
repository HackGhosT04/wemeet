# WeMeet — Server-rendered Python WebRTC Meeting App

This project is a server-rendered Python WebRTC video meeting application using FastAPI, Jinja2, and vanilla JavaScript for WebRTC. It uses Firebase Authentication and Firebase Realtime Database for user and meeting data, and a WebSocket-based signaling server implemented in Python.

Quick notes:
- Server-side rendering: Jinja2 templates in `templates/`
- Signaling: WebSocket endpoint at `/ws/{meeting_id}` implemented in `websocket/signaling.py`
- Authentication: Firebase Email/Password via REST + Firebase Admin SDK for token verification
- Database: Firebase Realtime Database (not Firestore)
- STUN: `stun:stun.l.google.com:19302` (default)
- TURN: removed to avoid costs; the app uses STUN-only for testing. You can add TURN later.

Getting started (development):

1. Create a Python 3.11+ venv and activate it.

```powershell
python -m venv myenv
myenv\Scripts\Activate.ps1
pip install -r requirements.txt
```

2. Create environment variables. See `.env.example` for names. You must provide a `FIREBASE_CONFIG_JSON` value containing the service account JSON (stringified) or set up another secure way of loading credentials.

3. Run the app:

```powershell
uvicorn app:app --reload
```

4. Open `http://localhost:8000` and create/signup an account.

Deployment:
- Docker support is included in `Dockerfile`, and `render.yaml` is configured for a Docker-based Render service.
- Add the required environment variables to your Render service: `FIREBASE_CONFIG_JSON`, `FIREBASE_WEB_API_KEY`, `FIREBASE_DATABASE_URL`, `SESSION_SECRET_KEY`.
- Ensure `SESSION_SECRET_KEY` is set in production and `SessionMiddleware` is configured to `https_only=True` (the code uses `USE_HTTPS` env to set this).
- Build and run locally with Docker:

```powershell
docker build -t wemeet .
docker run --rm -p 8000:10000 `
	-e FIREBASE_WEB_API_KEY="your-key" `
	-e FIREBASE_CONFIG_JSON="your-service-account-json" `
	-e FIREBASE_DATABASE_URL="your-db-url" `
	-e SESSION_SECRET_KEY="your-secret" `
	wemeet
```

ICE/STUN/TURN configuration:
- For testing and low-cost deployment, Google STUN (`stun:stun.l.google.com:19302`) is used by default.
- Optional TURN support is available if you set `TURN_SERVER_URL`, `TURN_USERNAME`, and `TURN_CREDENTIAL`.

Security and notes:
- Do not commit service account JSON or TURN credentials to source control.
- Ensure HTTPS/WSS in production and set `https_only=True` for session cookies.

If you want, I can:
- Run the app locally and smoke-test WebSocket connections.
- Add `aiortc` usage for server-side media relay or recording (currently the app uses browser P2P).
- Harden session cookie settings and CSRF protection.


git add .
git commit -m "Add Docker deployment for Render"
git push -u origin main