from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    APP_NAME: str = "Help Desk IA"
    APP_VERSION: str = "1.0.0"

    AI_PROVIDER: str = "anthropic"
    ANTHROPIC_API_KEY: str = ""
    OPENAI_API_KEY: str = ""
    AI_MODEL: str = "claude-sonnet-4-6"
    AI_MAX_TOKENS: int = 1024
    AI_TEMPERATURE: float = 0.7

    MAX_HISTORY_PER_SESSION: int = 50
    SESSION_TIMEOUT_HOURS: int = 24

    LOG_LEVEL: str = "INFO"
    LOG_DIR: str = "logs"

    ALLOWED_ORIGINS: str = "*"

    SYSTEM_PROMPT: str = (
        "Você é um assistente de help desk técnico interno especializado. "
        "Seu objetivo é ajudar colaboradores com dúvidas técnicas de forma clara, objetiva e profissional. "
        "Sempre responda em português do Brasil. "
        "Forneça soluções passo a passo quando necessário. "
        "Quando não souber a resposta, seja honesto e sugira contato com o suporte humano: "
        "📞 Ramal 1234 | 📧 suporte@empresa.com. "
        "Seja conciso, direto e empático."
    )

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"


settings = Settings()
