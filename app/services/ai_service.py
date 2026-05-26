import logging
from typing import AsyncIterator, List, Dict

from app.config import settings

logger = logging.getLogger(__name__)


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
                self.client = None

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
                self.client = None

    def _not_configured_msg(self) -> str:
        return (
            "⚠️ Sistema de IA não configurado. "
            "Defina a variável `ANTHROPIC_API_KEY` (ou `OPENAI_API_KEY`) no arquivo `.env` e reinicie o servidor."
        )

    async def get_response(self, messages: List[Dict], context: str = "") -> Dict:
        if not self.client:
            return {"content": self._not_configured_msg(), "source": "error"}
        system = self._build_system(context)
        try:
            if self.provider == "anthropic":
                return await self._anthropic(messages, system)
            return await self._openai(messages, system)
        except Exception as e:
            logger.error("AI error: %s", e)
            return {
                "content": "Ocorreu um erro ao processar sua mensagem. Tente novamente ou contate 📞 Ramal 1234.",
                "source": "error",
            }

    async def stream_response(self, messages: List[Dict], context: str = "") -> AsyncIterator[str]:
        if not self.client:
            yield self._not_configured_msg()
            return

        system = self._build_system(context)
        try:
            if self.provider == "anthropic":
                async for chunk in self._anthropic_stream(messages, system):
                    yield chunk
            else:
                async for chunk in self._openai_stream(messages, system):
                    yield chunk
        except Exception as e:
            logger.error("AI streaming error: %s", e)
            yield "Ocorreu um erro ao processar sua mensagem. Tente novamente ou contate 📞 Ramal 1234."

    def _build_system(self, context: str) -> str:
        system = settings.SYSTEM_PROMPT
        if context:
            system += f"\n\nContexto relevante da base de conhecimento:\n{context}"
        return system

    async def _anthropic(self, messages: List[Dict], system: str) -> Dict:
        response = await self.client.messages.create(
            model=settings.AI_MODEL,
            max_tokens=settings.AI_MAX_TOKENS,
            system=system,
            messages=messages,
        )
        return {"content": response.content[0].text, "source": "ai"}

    async def _anthropic_stream(self, messages: List[Dict], system: str) -> AsyncIterator[str]:
        async with self.client.messages.stream(
            model=settings.AI_MODEL,
            max_tokens=settings.AI_MAX_TOKENS,
            system=system,
            messages=messages,
        ) as stream:
            async for text in stream.text_stream:
                yield text

    async def _openai(self, messages: List[Dict], system: str) -> Dict:
        formatted = [{"role": "system", "content": system}] + messages
        response = await self.client.chat.completions.create(
            model=settings.AI_MODEL or "gpt-4o-mini",
            messages=formatted,
            max_tokens=settings.AI_MAX_TOKENS,
            temperature=settings.AI_TEMPERATURE,
        )
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
            delta = chunk.choices[0].delta.content
            if delta:
                yield delta


ai_service = AIService()
