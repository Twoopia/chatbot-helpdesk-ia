import logging
from typing import AsyncIterator, List, Dict

from app.config import settings

logger = logging.getLogger(__name__)

_ERROR_MSG = "Ocorreu um erro ao processar sua mensagem. Tente novamente."
_EMPTY_MSG  = "A IA retornou uma resposta vazia. Tente novamente."


class AIService:
    def __init__(self) -> None:
        self.provider = settings.AI_PROVIDER
        self.client = None
        self._init_client()

    def _init_client(self) -> None:
        if self.provider == "anthropic":
            if not settings.ANTHROPIC_API_KEY:
                logger.warning("ANTHROPIC_API_KEY not set — AI responses disabled")
                return
            try:
                import anthropic
                self.client = anthropic.AsyncAnthropic(api_key=settings.ANTHROPIC_API_KEY)
                logger.info("Anthropic client initialized (model: %s)", settings.AI_MODEL)
            except ImportError:
                logger.error("anthropic package not installed")
            except Exception as e:
                logger.error("Failed to init Anthropic client: %s", e)

        elif self.provider == "openai":
            if not settings.OPENAI_API_KEY:
                logger.warning("OPENAI_API_KEY not set — AI responses disabled")
                return
            try:
                import openai
                self.client = openai.AsyncOpenAI(api_key=settings.OPENAI_API_KEY)
                logger.info("OpenAI client initialized (model: %s)", settings.AI_MODEL)
            except ImportError:
                logger.error("openai package not installed")
            except Exception as e:
                logger.error("Failed to init OpenAI client: %s", e)

        elif self.provider == "gemini":
            if not settings.GEMINI_API_KEY:
                logger.warning("GEMINI_API_KEY not set — AI responses disabled")
                return
            try:
                from google import genai
                self.client = genai.Client(api_key=settings.GEMINI_API_KEY)
                logger.info("Gemini client initialized (model: %s)", settings.AI_MODEL)
            except ImportError:
                logger.error("google-genai package not installed")
            except Exception as e:
                logger.error("Failed to init Gemini client: %s", e)

    def _not_configured_msg(self) -> str:
        return (
            "⚠️ Sistema de IA não configurado. "
            "Defina `GEMINI_API_KEY` (ou outra chave de IA) no arquivo `.env` e reinicie o servidor."
        )

    async def get_response(self, messages: List[Dict], context: str = "") -> Dict:
        if not self.client:
            return {"content": self._not_configured_msg(), "source": "error"}
        system = self._build_system(context)
        try:
            if self.provider == "anthropic":
                return await self._anthropic(messages, system)
            elif self.provider == "gemini":
                return await self._gemini(messages, system)
            return await self._openai(messages, system)
        except Exception as e:
            logger.error("AI error: %s", e)
            return {"content": _ERROR_MSG, "source": "error"}

    async def stream_response(self, messages: List[Dict], context: str = "") -> AsyncIterator[str]:
        if not self.client:
            yield self._not_configured_msg()
            return
        system = self._build_system(context)
        try:
            if self.provider == "anthropic":
                async for chunk in self._anthropic_stream(messages, system):
                    yield chunk
            elif self.provider == "gemini":
                async for chunk in self._gemini_stream(messages, system):
                    yield chunk
            else:
                async for chunk in self._openai_stream(messages, system):
                    yield chunk
        except Exception as e:
            logger.error("AI streaming error: %s", e)
            yield _ERROR_MSG

    def _build_system(self, context: str) -> str:
        system = settings.SYSTEM_PROMPT
        if context:
            system += f"\n\nContexto relevante da base de conhecimento:\n{context}"
        return system

    # ── Gemini ───────────────────────────────────────────────────────────
    def _to_gemini_messages(self, messages: List[Dict]) -> List[Dict]:
        """Convert history to Gemini format. Merge consecutive same-role messages."""
        result: List[Dict] = []
        for m in messages:
            role = "model" if m["role"] == "assistant" else "user"
            if result and result[-1]["role"] == role:
                result[-1]["parts"][0]["text"] += "\n" + m["content"]
            else:
                result.append({"role": role, "parts": [{"text": m["content"]}]})
        return result

    async def _gemini(self, messages: List[Dict], system: str) -> Dict:
        from google.genai import types
        model = settings.AI_MODEL or "gemini-2.5-flash"
        response = await self.client.aio.models.generate_content(
            model=model,
            contents=self._to_gemini_messages(messages),
            config=types.GenerateContentConfig(system_instruction=system),
        )
        if not response.text:
            return {"content": _EMPTY_MSG, "source": "error"}
        return {"content": response.text, "source": "ai"}

    async def _gemini_stream(self, messages: List[Dict], system: str) -> AsyncIterator[str]:
        from google.genai import types
        model = settings.AI_MODEL or "gemini-2.5-flash"
        async for chunk in await self.client.aio.models.generate_content_stream(
            model=model,
            contents=self._to_gemini_messages(messages),
            config=types.GenerateContentConfig(system_instruction=system),
        ):
            if chunk.text:
                yield chunk.text

    # ── Anthropic ────────────────────────────────────────────────────────
    async def _anthropic(self, messages: List[Dict], system: str) -> Dict:
        response = await self.client.messages.create(
            model=settings.AI_MODEL,
            max_tokens=settings.AI_MAX_TOKENS,
            system=system,
            messages=messages,
            temperature=settings.AI_TEMPERATURE,
        )
        if not response.content:
            return {"content": _EMPTY_MSG, "source": "error"}
        return {"content": response.content[0].text, "source": "ai"}

    async def _anthropic_stream(self, messages: List[Dict], system: str) -> AsyncIterator[str]:
        async with self.client.messages.stream(
            model=settings.AI_MODEL,
            max_tokens=settings.AI_MAX_TOKENS,
            system=system,
            messages=messages,
            temperature=settings.AI_TEMPERATURE,
        ) as stream:
            async for text in stream.text_stream:
                yield text

    # ── OpenAI ───────────────────────────────────────────────────────────
    async def _openai(self, messages: List[Dict], system: str) -> Dict:
        formatted = [{"role": "system", "content": system}] + messages
        response = await self.client.chat.completions.create(
            model=settings.AI_MODEL or "gpt-4o-mini",
            messages=formatted,
            max_tokens=settings.AI_MAX_TOKENS,
            temperature=settings.AI_TEMPERATURE,
        )
        if not response.choices or response.choices[0].message.content is None:
            return {"content": _EMPTY_MSG, "source": "error"}
        return {"content": response.choices[0].message.content, "source": "ai"}

    async def _openai_stream(self, messages: List[Dict], system: str) -> AsyncIterator[str]:
        formatted = [{"role": "system", "content": system}] + messages
        stream = await self.client.chat.completions.create(
            model=settings.AI_MODEL or "gpt-4o-mini",
            messages=formatted,
            max_tokens=settings.AI_MAX_TOKENS,
            temperature=settings.AI_TEMPERATURE,
            stream=True,
        )
        async for chunk in stream:
            if not chunk.choices:
                continue
            delta = chunk.choices[0].delta.content
            if delta:
                yield delta


ai_service = AIService()
