import json
import logging
import os
from datetime import datetime
from typing import Dict, List, Optional

from app.config import settings
from app.models.chat import Message

logger = logging.getLogger(__name__)


class HistoryService:
    def __init__(self) -> None:
        os.makedirs(settings.LOG_DIR, exist_ok=True)
        self.storage_file = os.path.join(settings.LOG_DIR, "sessions.json")
        self.sessions: Dict[str, dict] = {}
        self._load()

    def _load(self) -> None:
        if not os.path.exists(self.storage_file):
            return
        try:
            with open(self.storage_file, "r", encoding="utf-8") as f:
                self.sessions = json.load(f)
        except Exception as e:
            logger.warning("Could not load sessions file: %s", e)
            self.sessions = {}

    def _save(self) -> None:
        try:
            with open(self.storage_file, "w", encoding="utf-8") as f:
                json.dump(self.sessions, f, ensure_ascii=False, indent=2, default=str)
        except Exception as e:
            logger.error("Could not save sessions: %s", e)

    def _get_or_create(self, session_id: str) -> dict:
        if session_id not in self.sessions:
            now = datetime.now().isoformat()
            self.sessions[session_id] = {
                "session_id": session_id,
                "created_at": now,
                "updated_at": now,
                "title": None,
                "messages": [],
            }
        return self.sessions[session_id]

    def add_message(
        self, session_id: str, role: str, content: str, source: str = "ai"
    ) -> Message:
        session = self._get_or_create(session_id)
        msg = Message(session_id=session_id, role=role, content=content, source=source)

        session["messages"].append(
            {
                "id": msg.id,
                "session_id": session_id,
                "role": role,
                "content": content,
                "timestamp": msg.timestamp.isoformat(),
                "source": source,
            }
        )
        session["updated_at"] = datetime.now().isoformat()

        if not session["title"] and role == "user":
            session["title"] = content[:60] + ("…" if len(content) > 60 else "")

        max_msgs = settings.MAX_HISTORY_PER_SESSION * 2
        if len(session["messages"]) > max_msgs:
            session["messages"] = session["messages"][-max_msgs:]

        self._save()
        return msg

    def get_history(self, session_id: str) -> List[dict]:
        return self.sessions.get(session_id, {}).get("messages", [])

    def get_ai_messages(self, session_id: str) -> List[dict]:
        return [
            {"role": m["role"], "content": m["content"]}
            for m in self.get_history(session_id)
        ]

    def get_all_sessions(self) -> List[dict]:
        result = [
            {
                "session_id": sid,
                "created_at": data.get("created_at"),
                "updated_at": data.get("updated_at"),
                "message_count": len(data.get("messages", [])),
                "title": data.get("title"),
            }
            for sid, data in self.sessions.items()
        ]
        return sorted(result, key=lambda x: x["updated_at"] or "", reverse=True)

    def delete_session(self, session_id: str) -> bool:
        if session_id in self.sessions:
            del self.sessions[session_id]
            self._save()
            return True
        return False


history_service = HistoryService()
