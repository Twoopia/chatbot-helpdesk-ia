import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from app.config import settings
from app.routers import chat, faq, history
from app.services.logger_service import setup_logging

setup_logging()

app = FastAPI(
    title=settings.APP_NAME,
    version=settings.APP_VERSION,
    description="Chatbot de Help Desk com IA — suporte técnico interno automatizado",
)

# SEC-002 fix: allow_credentials=True with origins="*" is forbidden by the spec
# and a CSRF risk. Only enable credentials when origins are explicitly listed.
_origins = settings.ALLOWED_ORIGINS.split(",")
app.add_middleware(
    CORSMiddleware,
    allow_origins=_origins,
    allow_credentials="*" not in _origins,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(chat.router, prefix="/api/chat", tags=["Chat"])
app.include_router(faq.router, prefix="/api/faq", tags=["FAQ"])
app.include_router(history.router, prefix="/api/history", tags=["Histórico"])

os.makedirs("static", exist_ok=True)
app.mount("/static", StaticFiles(directory="static"), name="static")


@app.get("/", include_in_schema=False)
async def root() -> FileResponse:
    return FileResponse("static/index.html")


@app.get("/health", tags=["Sistema"])
async def health() -> dict:
    return {
        "status": "ok",
        "app": settings.APP_NAME,
        "version": settings.APP_VERSION,
        "ai_provider": settings.AI_PROVIDER,
        "ai_model": settings.AI_MODEL,
    }
