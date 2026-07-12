from fastapi import Request, HTTPException, Depends
from firebase_init import realtime_db
from auth_utils import verify_token

async def get_current_user(request: Request):
    token = request.session.get("token")
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")
    try:
        decoded = verify_token(token)
        uid = decoded["uid"]
        # Optionally fetch user data from Realtime DB
        user_data = realtime_db.child("users").child(uid).get()
        if not user_data:
            raise HTTPException(status_code=401, detail="User not found")
        return {"uid": uid, **user_data}
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid or expired session")