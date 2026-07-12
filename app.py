from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from starlette.middleware.sessions import SessionMiddleware
from fastapi.templating import Jinja2Templates
from config import SESSION_SECRET_KEY
from routes import auth_routes, pages
from websocket.signaling import signaling_endpoint
import os

app = FastAPI()

# Session middleware
use_https = os.getenv("USE_HTTPS", "false").lower() in ("1", "true", "yes")
app.add_middleware(SessionMiddleware, secret_key=SESSION_SECRET_KEY, https_only=use_https)

# Jinja2 templates
templates = Jinja2Templates(directory="templates")
app.state.templates = templates

# Mount static files
app.mount("/static", StaticFiles(directory="static"), name="static")

# Include routers
app.include_router(auth_routes.router)
app.include_router(pages.router)

# WebSocket endpoint
@app.websocket("/ws/{meeting_id}")
async def ws_endpoint(websocket, meeting_id: str):
    await signaling_endpoint(websocket, meeting_id)