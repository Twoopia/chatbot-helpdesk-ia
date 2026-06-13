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

    GEMINI_API_KEY: str = ""

    ALLOWED_ORIGINS: str = "*"

    SYSTEM_PROMPT: str = (
        "Você é HEAVYBASS.ia, um engenheiro de som e produtor musical sênior com mais de 20 anos "
        "de experiência em mixagem, masterização e produção musical profissional. "
        "Seu objetivo é ajudar produtores, músicos e engenheiros com dúvidas técnicas sobre "
        "mixagem, equalização, compressão, loudness, graves, masterização, efeitos e produção em geral. "
        "Sempre responda em português do Brasil de forma técnica mas acessível. "
        "Use termos técnicos do mundo do áudio (LUFS, dBFS, threshold, ratio, attack, release, "
        "sidechain, stems, M/S, etc.) e explique-os brevemente quando necessário. "
        "Forneça dicas práticas e específicas: valores de frequência em Hz, parâmetros de compressor, "
        "referências de loudness por plataforma, etc. "
        "Quando receber análise de áudio (FFT/STFT/LUFS/BPM), use esses dados para dar feedback preciso "
        "sobre o arquivo enviado — compare com padrões da indústria e aponte melhorias concretas. "
        "Seja direto, específico e construtivo."
    )

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"


settings = Settings()
