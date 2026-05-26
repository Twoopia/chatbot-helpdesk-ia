from fastapi import APIRouter, HTTPException

from app.services.history_service import history_service

router = APIRouter()


@router.get("/sessions")
async def get_all_sessions() -> dict:
    return {"sessions": history_service.get_all_sessions()}


@router.get("/{session_id}")
async def get_session_history(session_id: str) -> dict:
    return {
        "session_id": session_id,
        "messages": history_service.get_history(session_id),
    }


@router.delete("/{session_id}")
async def delete_session(session_id: str) -> dict:
    if not history_service.delete_session(session_id):
        raise HTTPException(status_code=404, detail="Sessão não encontrada")
    return {"message": "Sessão removida com sucesso"}
