from fastapi import APIRouter, Request, Form, HTTPException
from fastapi.responses import RedirectResponse
from auth_utils import sign_up, sign_in
from firebase_init import realtime_db
from dependencies import get_current_user
import traceback

router = APIRouter()

@router.get("/login")
async def login_page(request: Request):
    # If already have a valid session, skip login
    token = request.session.get("token")
    if token:
        try:
            verify = None
            from auth_utils import verify_token
            verify = verify_token(token)
            if verify:
                return RedirectResponse(url="/dashboard")
        except Exception:
            pass
    return request.app.state.templates.TemplateResponse(request, "login.html", {"request": request})

@router.post("/login")
async def login(request: Request, email: str = Form(...), password: str = Form(...)):
    try:
        result = sign_in(email, password)
        request.session["token"] = result["idToken"]
        next_url = request.query_params.get("next", "/dashboard")
        return RedirectResponse(url=next_url, status_code=303)
    except Exception as e:
        return request.app.state.templates.TemplateResponse(request, "login.html", {
            "request": request,
            "error": str(e)
        })

@router.get("/signup")
async def signup_page(request: Request):
    # If already logged in, skip signup
    token = request.session.get("token")
    if token:
        try:
            from auth_utils import verify_token
            if verify_token(token):
                return RedirectResponse(url="/dashboard")
        except Exception:
            pass
    return request.app.state.templates.TemplateResponse(request, "signup.html", {"request": request})

@router.post("/signup")
async def signup(request: Request, name: str = Form(...), email: str = Form(...),
                password: str = Form(...), confirm_password: str = Form(...)):
    if password != confirm_password:
        return request.app.state.templates.TemplateResponse(request, "signup.html", {
            "request": request,
            "error": "Passwords do not match"
        })
    try:
        result = sign_up(email, password)
        uid = result["localId"]
        # Store user profile in Realtime Database
        realtime_db.child("users").child(uid).set({
            "name": name,
            "email": email,
            "created_at": {".sv": "timestamp"}
        })
        request.session["token"] = result["idToken"]
        next_url = request.query_params.get("next", "/dashboard")
        return RedirectResponse(url=next_url, status_code=303)
    except Exception as e:
        return request.app.state.templates.TemplateResponse(request, "signup.html", {
            "request": request,
            "error": str(e)
        })

@router.get("/logout")
async def logout(request: Request):
    request.session.clear()
    return RedirectResponse(url="/")