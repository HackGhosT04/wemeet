from fastapi import APIRouter, Request
from fastapi.responses import RedirectResponse
from config import TURN_SERVER_URL, TURN_USERNAME, TURN_CREDENTIAL
from firebase_init import realtime_db
from auth_utils import verify_token
import uuid
import json

router = APIRouter()

@router.get("/")
async def landing(request: Request):
    return request.app.state.templates.TemplateResponse(request, "landing.html", {"request": request})

@router.get("/dashboard")
async def dashboard(request: Request):
    token = request.session.get("token")
    if not token:
        return RedirectResponse(url=f"/login?next=/dashboard")
    try:
        decoded = verify_token(token)
        uid = decoded["uid"]
        user_data = realtime_db.child("users").child(uid).get()
        if not user_data:
            return RedirectResponse(url=f"/login?next=/dashboard")
        user = {"uid": uid, **user_data}
        return request.app.state.templates.TemplateResponse(request, "dashboard.html", {
            "request": request,
            "user": user
        })
    except Exception:
        return RedirectResponse(url=f"/login?next=/dashboard")

@router.post("/create-meeting")
async def create_meeting(request: Request):
    token = request.session.get("token")
    if not token:
        return RedirectResponse(url=f"/login?next=/dashboard")
    try:
        decoded = verify_token(token)
        uid = decoded["uid"]
    except Exception:
        return RedirectResponse(url=f"/login?next=/dashboard")

    meeting_id = str(uuid.uuid4())
    # Store meeting in Realtime Database
    realtime_db.child("meetings").child(meeting_id).set({
        "created_by": uid,
        "created_at": {".sv": "timestamp"},
        "active": True
    })
    return RedirectResponse(url=f"/meeting/{meeting_id}", status_code=303)

@router.get("/meeting/{meeting_id}")
async def meeting_room(request: Request, meeting_id: str):
    # If not authenticated, redirect to login and preserve target
    token = request.session.get("token")
    if not token:
        return RedirectResponse(url=f"/login?next=/meeting/{meeting_id}")
    try:
        decoded = verify_token(token)
        uid = decoded["uid"]
        user_data = realtime_db.child("users").child(uid).get()
        if not user_data:
            return RedirectResponse(url=f"/login?next=/meeting/{meeting_id}")
        user = {"uid": uid, **user_data}
    except Exception:
        return RedirectResponse(url=f"/login?next=/meeting/{meeting_id}")

    # Validate meeting exists
    meeting_data = realtime_db.child("meetings").child(meeting_id).get()
    if not meeting_data:
        return request.app.state.templates.TemplateResponse(request, "404.html", {"request": request}, status_code=404)
    # Build ICE servers config with optional TURN fallback.
    ice_servers = [{"urls": "stun:stun.l.google.com:19302"}]
    if TURN_SERVER_URL:
        turn_server = {"urls": TURN_SERVER_URL}
        if TURN_USERNAME:
            turn_server["username"] = TURN_USERNAME
        if TURN_CREDENTIAL:
            turn_server["credential"] = TURN_CREDENTIAL
        ice_servers.append(turn_server)

    return request.app.state.templates.TemplateResponse(request, "meeting.html", {
        "request": request,
        "user": user,
        "meeting_id": meeting_id,
        "token": request.session.get("token"),
        "ice_servers_json": json.dumps(ice_servers)
    })