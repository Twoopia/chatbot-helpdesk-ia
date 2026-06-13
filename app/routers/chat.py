import logging
from typing import Dict

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, WebSocket, WebSocketDisconnect

from app.models.chat import ChatRequest, ChatResponse
from app.utils.rate_limit import rate_limit
from app.services.ai_service import ai_service
from app.services.audio_service import analyze_audio, build_frequency_report
from app.services.faq_service import faq_service
from app.services.gemini_service import gemini_service
from app.services.history_service import history_service
from app.services.logger_service import conversation_logger

logger = logging.getLogger(__name__)
router = APIRouter()


class ConnectionManager:
    def __init__(self) -> None:
        self._connections: Dict[str, WebSocket] = {}

    async def connect(self, ws: WebSocket, session_id: str) -> None:
        await ws.accept()
        self._connections[session_id] = ws
        logger.info("WS connected: %s", session_id)

    def disconnect(self, session_id: str) -> None:
        self._connections.pop(session_id, None)
        logger.info("WS disconnected: %s", session_id)

    async def send(self, session_id: str, data: dict) -> None:
        ws = self._connections.get(session_id)
        if ws:
            await ws.send_json(data)


manager = ConnectionManager()


@router.websocket("/ws/{session_id}")
async def websocket_endpoint(websocket: WebSocket, session_id: str) -> None:
    await manager.connect(websocket, session_id)
    try:
        history = history_service.get_history(session_id)
        await websocket.send_json({"type": "history", "data": history})

        while True:
            data = await websocket.receive_json()
            user_message = (data.get("message") or "").strip()
            if not user_message:
                continue

            history_service.add_message(session_id, "user", user_message)
            conversation_logger.log(session_id, "user", user_message)

            faq_match = faq_service.find_best_match(user_message)

            if faq_match:
                asst_msg = history_service.add_message(
                    session_id, "assistant", faq_match.answer, source="faq"
                )
                conversation_logger.log(session_id, "assistant", faq_match.answer, "faq")
                await websocket.send_json(
                    {
                        "type": "message",
                        "data": {
                            "id": asst_msg.id,
                            "role": "assistant",
                            "content": faq_match.answer,
                            "timestamp": asst_msg.timestamp.isoformat(),
                            "source": "faq",
                            "faq_category": faq_match.category,
                        },
                    }
                )
            else:
                await websocket.send_json({"type": "typing", "data": True})

                ai_messages = history_service.get_ai_messages(session_id)
                full_response = ""

                await websocket.send_json({"type": "stream_start", "data": {}})

                async for chunk in ai_service.stream_response(ai_messages):
                    full_response += chunk
                    await websocket.send_json(
                        {"type": "stream_chunk", "data": {"chunk": chunk}}
                    )

                asst_msg = history_service.add_message(
                    session_id, "assistant", full_response, source="ai"
                )
                conversation_logger.log(session_id, "assistant", full_response, "ai")

                await websocket.send_json(
                    {
                        "type": "stream_end",
                        "data": {
                            "id": asst_msg.id,
                            "timestamp": asst_msg.timestamp.isoformat(),
                            "source": "ai",
                        },
                    }
                )

    except WebSocketDisconnect:
        manager.disconnect(session_id)
    except Exception as e:
        logger.error("WebSocket error (%s): %s", session_id, e)
        manager.disconnect(session_id)


@router.post("/message", response_model=ChatResponse, dependencies=[Depends(rate_limit(30))])
async def send_message(request: ChatRequest) -> ChatResponse:
    """REST fallback for non-WebSocket clients."""
    history_service.add_message(request.session_id, "user", request.message)
    conversation_logger.log(request.session_id, "user", request.message)

    faq_match = faq_service.find_best_match(request.message)
    if faq_match:
        asst_msg = history_service.add_message(
            request.session_id, "assistant", faq_match.answer, source="faq"
        )
        return ChatResponse(
            id=asst_msg.id,
            message=faq_match.answer,
            session_id=request.session_id,
            timestamp=asst_msg.timestamp.isoformat(),
            source="faq",
        )

    ai_messages = history_service.get_ai_messages(request.session_id)
    result = await ai_service.get_response(ai_messages)
    asst_msg = history_service.add_message(
        request.session_id, "assistant", result["content"], source=result["source"]
    )
    conversation_logger.log(
        request.session_id, "assistant", result["content"], result["source"]
    )
    return ChatResponse(
        id=asst_msg.id,
        message=result["content"],
        session_id=request.session_id,
        timestamp=asst_msg.timestamp.isoformat(),
        source=result["source"],
    )


@router.post("/audio", response_model=ChatResponse, dependencies=[Depends(rate_limit(10))])
async def analyze_audio_message(
    audio: UploadFile = File(...),
    message: str = Form(default=""),
    session_id: str = Form(...),
) -> ChatResponse:
    """Analyze an uploaded audio file with FFT + Gemini multimodal."""
    audio_bytes = await audio.read()
    max_bytes = settings.MAX_AUDIO_SIZE_MB * 1024 * 1024
    if len(audio_bytes) > max_bytes:
        raise HTTPException(
            status_code=413,
            detail=f"Arquivo muito grande. Limite: {settings.MAX_AUDIO_SIZE_MB} MB.",
        )
    mime_type = audio.content_type or "audio/mpeg"

    user_text = message.strip() or f"[Áudio enviado: {audio.filename}]"
    history_service.add_message(session_id, "user", user_text)
    conversation_logger.log(session_id, "user", user_text)

    try:
        analysis = await analyze_audio(audio_bytes)
        freq_report = build_frequency_report(analysis)
    except Exception as exc:
        logger.error("Erro na análise de áudio: %s", exc)
        freq_report = "[Análise espectral indisponível — arquivo não processável]"

    try:
        ai_text = await gemini_service.analyze_audio_chat(
            audio_bytes, mime_type, freq_report, message
        )
        # BUG-004 fix: treat empty response as an error instead of silently passing
        if not ai_text or not ai_text.strip():
            raise ValueError("Gemini retornou resposta vazia")
        source = "gemini"
    except Exception as exc:
        logger.error("Erro no Gemini: %s", exc)
        ai_text = (
            "⚠️ Não foi possível processar o áudio com Gemini. "
            "Verifique se GEMINI_API_KEY está configurada corretamente."
        )
        source = "error"

    full_response = f"{freq_report}\n\n{ai_text}"
    asst_msg = history_service.add_message(session_id, "assistant", full_response, source=source)
    conversation_logger.log(session_id, "assistant", full_response, source)

    return ChatResponse(
        id=asst_msg.id,
        message=full_response,
        session_id=session_id,
        timestamp=asst_msg.timestamp.isoformat(),
        source=source,
    )
