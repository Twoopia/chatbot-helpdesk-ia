import json
import logging
import os
from datetime import datetime
from logging.handlers import RotatingFileHandler

from app.config import settings


def setup_logging() -> None:
    os.makedirs(settings.LOG_DIR, exist_ok=True)
    fmt = "%(asctime)s | %(levelname)-8s | %(name)s | %(message)s"
    handlers = [
        logging.StreamHandler(),
        RotatingFileHandler(
            os.path.join(settings.LOG_DIR, "app.log"),
            maxBytes=10 * 1024 * 1024,
            backupCount=5,
            encoding="utf-8",
        ),
    ]
    logging.basicConfig(
        level=getattr(logging, settings.LOG_LEVEL.upper(), logging.INFO),
        format=fmt,
        handlers=handlers,
    )


class ConversationLogger:
    def __init__(self) -> None:
        os.makedirs(settings.LOG_DIR, exist_ok=True)
        self.log_file = os.path.join(settings.LOG_DIR, "conversations.jsonl")

    def log(self, session_id: str, role: str, content: str, source: str = "ai") -> None:
        entry = {
            "timestamp": datetime.now().isoformat(),
            "session_id": session_id,
            "role": role,
            "content": content,
            "source": source,
        }
        with open(self.log_file, "a", encoding="utf-8") as f:
            f.write(json.dumps(entry, ensure_ascii=False) + "\n")


conversation_logger = ConversationLogger()
