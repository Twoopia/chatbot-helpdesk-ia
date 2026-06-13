import asyncio
import logging
import threading

from app.config import settings

logger = logging.getLogger(__name__)

AUDIO_SYSTEM_PROMPT = (
    "Você é um Engenheiro de Som Sênior com mais de 20 anos de experiência em mixagem, "
    "masterização e produção musical profissional. "
    "Você recebe dados técnicos de análise de frequência (STFT/FFT, LUFS, BPM, dB por banda) "
    "e um arquivo de áudio para análise multimodal via Gemini. "
    "Sua função é fornecer feedback técnico detalhado e profissional sobre:\n"
    "- Balanceamento espectral (graves, médios, agudos)\n"
    "- Loudness e dinâmica (LUFS, peak, headroom)\n"
    "- Ritmo e groove (BPM)\n"
    "- Problemas detectados e sugestões concretas de correção com parâmetros de EQ/compressão\n"
    "- Comparação com padrões de mercado: Spotify −14 LUFS, YouTube −14 LUFS, CD −9 LUFS\n"
    "Sempre responda em português do Brasil de forma técnica mas acessível. "
    "Use termos técnicos e explique-os brevemente. Seja construtivo, específico e prático."
)


class GeminiService:
    def __init__(self) -> None:
        self._client = None
        self._lock = threading.Lock()

    def _get_client(self):
        if self._client is not None:
            return self._client
        with self._lock:
            if self._client is not None:
                return self._client
            if not settings.GEMINI_API_KEY:
                raise RuntimeError("GEMINI_API_KEY não configurada no .env")
            from google import genai
            self._client = genai.Client(api_key=settings.GEMINI_API_KEY)
        return self._client

    async def analyze_audio_chat(
        self,
        audio_bytes: bytes,
        mime_type: str,
        frequency_report: str,
        user_message: str,
    ) -> str:
        return await asyncio.to_thread(
            self._call_gemini, audio_bytes, mime_type, frequency_report, user_message
        )

    def _call_gemini(
        self,
        audio_bytes: bytes,
        mime_type: str,
        frequency_report: str,
        user_message: str,
    ) -> str:
        from google.genai import types

        client = self._get_client()
        question = user_message.strip() or "Analise este áudio e forneça feedback técnico completo."
        prompt = f"{frequency_report}\n\nMensagem do músico: {question}"

        response = client.models.generate_content(
            model="gemini-2.5-flash",
            contents=[
                types.Part.from_bytes(data=audio_bytes, mime_type=mime_type),
                types.Part.from_text(text=prompt),
            ],
            config=types.GenerateContentConfig(
                system_instruction=AUDIO_SYSTEM_PROMPT,
            ),
        )
        return response.text


gemini_service = GeminiService()
