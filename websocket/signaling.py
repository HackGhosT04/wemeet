from fastapi import WebSocket, WebSocketDisconnect
from auth_utils import verify_token
from firebase_init import realtime_db
import json

# In-memory storage: meeting_id -> set of WebSocket connections
active_meetings = {}
# meeting_id -> user_id -> WebSocket (to enforce single connection per user)
user_connections = {}


def _sync_participant_count(meeting_id: str) -> int:
    participants = realtime_db.child("participants").child(meeting_id).get() or {}
    if isinstance(participants, dict):
        count = len(participants)
    else:
        count = 0
    meeting_ref = realtime_db.child("meetings").child(meeting_id)
    meeting_ref.update({"participant_count": count, "active": True})
    return count

async def signaling_endpoint(websocket: WebSocket, meeting_id: str):
    # Extract token from query parameter
    token = websocket.query_params.get("token")
    if not token:
        await websocket.close(code=4001, reason="Missing token")
        return
    try:
        decoded = verify_token(token)
        user_id = decoded["uid"]
    except Exception:
        await websocket.close(code=4001, reason="Invalid token")
        return

    meeting_data = realtime_db.child("meetings").child(meeting_id).get()
    if not meeting_data or not meeting_data.get("active", True):
        await websocket.close(code=4004, reason="Meeting not found")
        return

    # Get user name from database
    user_data = realtime_db.child("users").child(user_id).get()
    user_name = user_data.get("name", "Unknown") if user_data else "Unknown"

    # Initialize meeting room if new
    if meeting_id not in active_meetings:
        active_meetings[meeting_id] = set()
        user_connections[meeting_id] = {}

    # Handle duplicate connections: close existing one for this user
    if user_id in user_connections.get(meeting_id, {}):
        old_ws = user_connections[meeting_id][user_id]
        try:
            await old_ws.close(code=4002, reason="Replaced by new connection")
        except:
            pass
        active_meetings[meeting_id].discard(old_ws)

    await websocket.accept()
    active_meetings[meeting_id].add(websocket)
    user_connections[meeting_id][user_id] = websocket

    # Add participant to Realtime Database
    participant_ref = realtime_db.child("participants").child(meeting_id).child(user_id)
    participant_ref.set({
        "name": user_name,
        "joined_at": {".sv": "timestamp"}
    })
    participant_count = _sync_participant_count(meeting_id)

    # Send welcome message to the new client with existing participants
    existing_participants = []
    for uid, ws in user_connections[meeting_id].items():
        if uid != user_id:
            # Fetch name (could be cached)
            ud = realtime_db.child("users").child(uid).get()
            name = ud.get("name", "Unknown") if ud else "Unknown"
            existing_participants.append({"userId": uid, "name": name})

    await websocket.send_json({
        "type": "welcome",
        "userId": user_id,
        "name": user_name,
        "participants": existing_participants,
        "participantCount": participant_count
    })

    # Broadcast new peer to all other connected users
    join_msg = {
        "type": "user-joined",
        "userId": user_id,
        "name": user_name,
        "participantCount": participant_count
    }
    for ws in active_meetings[meeting_id]:
        if ws != websocket:
            try:
                await ws.send_json(join_msg)
            except:
                pass

    # Message handling
    try:
        while True:
            raw = await websocket.receive_text()
            data = json.loads(raw)
            msg_type = data.get("type")
            target = data.get("target")  # userId to forward to

            if msg_type in ("offer", "answer", "ice-candidate"):
                # Forward to the specific peer
                target_ws = user_connections[meeting_id].get(target)
                if target_ws and target_ws != websocket:
                    await target_ws.send_json({
                        **data,
                        "sender": user_id  # add sender info
                    })
            # Could handle other custom messages (e.g., mute state broadcast)
    except WebSocketDisconnect:
        pass
    finally:
        # Cleanup on disconnect
        active_meetings[meeting_id].discard(websocket)
        if user_id in user_connections.get(meeting_id, {}):
            del user_connections[meeting_id][user_id]
        # Remove participant from DB
        participant_ref.delete()
        participant_count = _sync_participant_count(meeting_id)

        # Notify others about user leaving
        leave_msg = {
            "type": "user-left",
            "userId": user_id,
            "participantCount": participant_count
        }
        for ws in active_meetings.get(meeting_id, []):
            try:
                await ws.send_json(leave_msg)
            except:
                pass

        # If room is empty, clean up in-memory
        if not active_meetings.get(meeting_id):
            active_meetings.pop(meeting_id, None)
            user_connections.pop(meeting_id, None)