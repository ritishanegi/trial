"""
LLM service for RAG answer generation.

Supports multiple providers (swappable via LLM_PROVIDER env var):
- groq       (default) — Llama 3.3 70B (free tier: 30 RPM, 14,400 req/day, no card)
- gemini              — Gemini 1.5 Flash (free tier: 15 RPM, 1M TPM)
- anthropic           — Claude Sonnet 4.6 (paid, best quality — use for production)

Set LLM_PROVIDER and the corresponding API key in .env.

Runtime fallback: if the configured provider returns 429 or 5xx before yielding
any tokens, the service transparently retries with the next available provider.
Mid-stream failures cannot fall back (client already received partial output).
"""

import logging

from app.config import settings

logger = logging.getLogger(__name__)

SYSTEM_PROMPT = """You are NAUTOS AI, a maritime technical expert assistant. You help ship engineers, fleet managers, and technical superintendents find accurate information from vessel documentation.

CRITICAL RULES — these are non-negotiable:

1. ONLY use information from the provided <context>. Never infer, synthesize beyond the text, or fill in gaps from general knowledge.
2. If the answer is not in the context, respond exactly: "Not found in the provided documentation." Do not guess.
3. Quote part numbers, ident numbers, codes, torque values, intervals, and specifications EXACTLY as written — character-for-character.
4. For tables: output ALL rows present in the context. Never abbreviate with "...", "and so on", or "(continues)". If a table has 57 rows in the context, your output has 57 rows.
5. Cite every factual claim using [Source: document title, page X] format. If you cannot cite it, you cannot say it.
6. For multilingual documents (German/English/French maritime manuals), preserve the original language in part designations and add English translation in parentheses if helpful.
7. For maintenance procedures, list every step in the order shown — no skipping.
8. Format tables as proper Markdown tables (with `|` and `---` separators) so they render in the UI.

When the user is having a multi-turn conversation, you may use prior messages for context (e.g. "what about its weight?" refers to the previously discussed item), but every factual claim must still come from <context>.

Maritime engineers will trust your answers to maintain equipment that costs millions and protect lives. Accuracy over creativity, always."""

# Max number of prior chat turns to include — limits prompt cost + latency
MAX_HISTORY_TURNS = 10

# Preferred fallback order when the primary provider fails at runtime.
# The configured LLM_PROVIDER always goes first; remaining available providers
# are tried in this order.
_FALLBACK_ORDER = ["anthropic", "groq", "gemini"]


class LLMTemporaryError(Exception):
    """Rate limit (429) or server error (5xx) — safe to retry with another provider."""


def _build_user_message(question: str, context: str) -> str:
    return f"""Based on the following documentation context, answer the question.

<context>
{context}
</context>

Question: {question}"""


def _truncate_history(history: list[dict] | None) -> list[dict]:
    """Keep only the last MAX_HISTORY_TURNS messages (user+assistant pairs)."""
    if not history:
        return []
    return history[-MAX_HISTORY_TURNS:]


class GroqLLM:
    """Groq streaming client — uses Llama 3.3 70B by default."""

    def __init__(self):
        from groq import Groq

        self.client = Groq(api_key=settings.groq_api_key)
        # Llama 3.3 70B: solid quality, very fast on Groq's LPU hardware
        self.model = "llama-3.3-70b-versatile"

    def _build_messages(self, question: str, context: str, chat_history: list[dict] | None):
        messages = [{"role": "system", "content": SYSTEM_PROMPT}]
        messages.extend(_truncate_history(chat_history))
        messages.append({"role": "user", "content": _build_user_message(question, context)})
        return messages

    def stream_answer(self, question: str, context: str, chat_history: list[dict] | None = None):
        try:
            stream = self.client.chat.completions.create(
                model=self.model,
                messages=self._build_messages(question, context, chat_history),
                max_tokens=4000,
                temperature=0.1,
                stream=True,
            )
            for chunk in stream:
                delta = chunk.choices[0].delta.content
                if delta:
                    yield delta
        except Exception as exc:
            _raise_if_temporary(exc, "groq")

    def get_answer(self, question: str, context: str, chat_history: list[dict] | None = None) -> str:
        try:
            response = self.client.chat.completions.create(
                model=self.model,
                messages=self._build_messages(question, context, chat_history),
                max_tokens=4000,
                temperature=0.1,
            )
            return response.choices[0].message.content
        except Exception as exc:
            _raise_if_temporary(exc, "groq")
            raise


class GeminiLLM:
    """Google Gemini streaming client."""

    def __init__(self):
        from google import genai

        self.client = genai.Client(api_key=settings.gemini_api_key)
        # gemini-1.5-flash has the most reliable free-tier quota allocation
        # Free tier: 15 RPM, 1M TPM, 1,500 RPD
        self.model = "gemini-1.5-flash"

    def _build_contents(self, question: str, context: str, chat_history: list[dict] | None):
        # Gemini uses "contents" with role 'user' / 'model' (not 'assistant')
        contents = []
        for msg in _truncate_history(chat_history):
            role = "model" if msg["role"] == "assistant" else "user"
            contents.append({"role": role, "parts": [{"text": msg["content"]}]})
        contents.append({
            "role": "user",
            "parts": [{"text": _build_user_message(question, context)}],
        })
        return contents

    def stream_answer(self, question: str, context: str, chat_history: list[dict] | None = None):
        try:
            response = self.client.models.generate_content_stream(
                model=self.model,
                contents=self._build_contents(question, context, chat_history),
                config={
                    "system_instruction": SYSTEM_PROMPT,
                    "max_output_tokens": 4000,
                    "temperature": 0.1,
                },
            )
            for chunk in response:
                if chunk.text:
                    yield chunk.text
        except Exception as exc:
            _raise_if_temporary(exc, "gemini")

    def get_answer(self, question: str, context: str, chat_history: list[dict] | None = None) -> str:
        try:
            response = self.client.models.generate_content(
                model=self.model,
                contents=self._build_contents(question, context, chat_history),
                config={
                    "system_instruction": SYSTEM_PROMPT,
                    "max_output_tokens": 4000,
                    "temperature": 0.1,
                },
            )
            return response.text
        except Exception as exc:
            _raise_if_temporary(exc, "gemini")
            raise


class AnthropicLLM:
    """Anthropic Claude streaming client."""

    def __init__(self):
        import anthropic

        self.client = anthropic.Anthropic(api_key=settings.anthropic_api_key)
        self.model = "claude-sonnet-4-6-20250514"

    def _build_messages(self, question: str, context: str, chat_history: list[dict] | None):
        # Anthropic accepts the standard role/content shape directly
        messages = list(_truncate_history(chat_history))
        messages.append({"role": "user", "content": _build_user_message(question, context)})
        return messages

    def stream_answer(self, question: str, context: str, chat_history: list[dict] | None = None):
        try:
            with self.client.messages.stream(
                model=self.model,
                max_tokens=4000,
                system=SYSTEM_PROMPT,
                messages=self._build_messages(question, context, chat_history),
            ) as stream:
                for text in stream.text_stream:
                    yield text
        except Exception as exc:
            _raise_if_temporary(exc, "anthropic")

    def get_answer(self, question: str, context: str, chat_history: list[dict] | None = None) -> str:
        try:
            response = self.client.messages.create(
                model=self.model,
                max_tokens=4000,
                system=SYSTEM_PROMPT,
                messages=self._build_messages(question, context, chat_history),
            )
            return response.content[0].text
        except Exception as exc:
            _raise_if_temporary(exc, "anthropic")
            raise


def _raise_if_temporary(exc: Exception, provider: str) -> None:
    """
    Inspect a provider exception and re-raise as LLMTemporaryError if it's a
    rate-limit (429) or server error (5xx) — i.e. safe to retry elsewhere.
    Permanent errors (bad API key, invalid request) propagate as-is.
    """
    name = type(exc).__name__
    msg = str(exc)

    # Groq
    if provider == "groq":
        try:
            import groq
            if isinstance(exc, (groq.RateLimitError, groq.InternalServerError)):
                raise LLMTemporaryError(f"groq: {name}: {msg}") from exc
        except ImportError:
            pass

    # Gemini / google-genai
    elif provider == "gemini":
        try:
            from google.api_core import exceptions as gexc
            if isinstance(exc, (gexc.ResourceExhausted, gexc.ServiceUnavailable, gexc.InternalServerError)):
                raise LLMTemporaryError(f"gemini: {name}: {msg}") from exc
        except ImportError:
            pass
        # google-genai wraps errors differently on some versions — check status code text
        if any(code in msg for code in ("429", "503", "500", "RESOURCE_EXHAUSTED")):
            raise LLMTemporaryError(f"gemini: {name}: {msg}") from exc

    # Anthropic
    elif provider == "anthropic":
        try:
            import anthropic
            if isinstance(exc, (anthropic.RateLimitError, anthropic.InternalServerError, anthropic.OverloadedError)):
                raise LLMTemporaryError(f"anthropic: {name}: {msg}") from exc
        except ImportError:
            pass

    # Generic HTTP status code fallback for any provider
    for code in ("429", "500", "502", "503", "529"):
        if code in msg:
            raise LLMTemporaryError(f"{provider}: {name}: {msg}") from exc


# Provider registry — easy to extend by adding new entries
_PROVIDERS = {
    "groq": (GroqLLM, "groq_api_key"),
    "gemini": (GeminiLLM, "gemini_api_key"),
    "anthropic": (AnthropicLLM, "anthropic_api_key"),
}


def _is_valid_key(key: str) -> bool:
    """Treat empty/placeholder strings as missing keys."""
    return bool(key) and key.strip().lower() not in ("placeholder", "")


class LLMService:
    """
    Factory that picks the right LLM based on LLM_PROVIDER + key availability.

    Builds an ordered fallback list at init time: configured primary first,
    then remaining available providers in _FALLBACK_ORDER preference. On a
    retriable error (429 / 5xx), stream_answer and get_answer try each provider
    in sequence before giving up.
    """

    def __init__(self):
        primary = settings.llm_provider.lower()

        # Build ordered list: primary first, then remaining by preference order
        ordered_names = [primary] + [n for n in _FALLBACK_ORDER if n != primary]
        self._providers: list = []

        for name in ordered_names:
            if name not in _PROVIDERS:
                continue
            cls, key_attr = _PROVIDERS[name]
            if not _is_valid_key(getattr(settings, key_attr, "")):
                continue
            try:
                self._providers.append(cls())
                logger.debug(f"LLM provider registered: {name}")
            except Exception as e:
                logger.warning(f"Failed to init LLM provider {name}: {e}")

        if not self._providers:
            raise RuntimeError(
                "No LLM API key configured. Set one of GROQ_API_KEY, GEMINI_API_KEY, "
                "or ANTHROPIC_API_KEY in .env (and LLM_PROVIDER to match)."
            )

        logger.info(
            f"LLM primary: {self._providers[0].__class__.__name__}, "
            f"fallbacks: {[p.__class__.__name__ for p in self._providers[1:]]}"
        )

    def stream_answer(self, question: str, context: str, chat_history: list[dict] | None = None):
        last_err: Exception | None = None

        for provider in self._providers:
            name = provider.__class__.__name__
            try:
                gen = provider.stream_answer(question, context, chat_history=chat_history)

                # Pull first token before yielding to the caller. This surfaces
                # 429/5xx before any output is sent, keeping fallback clean.
                first = next(gen, None)
            except LLMTemporaryError as exc:
                logger.warning(f"{name} rate-limited/errored before first token, trying fallback: {exc}")
                last_err = exc
                continue

            # We have at least one token — yield through. A mid-stream failure
            # here can't fall back cleanly, so let it propagate.
            if first is not None:
                yield first
            yield from gen
            return

        raise RuntimeError(
            f"All LLM providers exhausted. Last error: {last_err}"
        )

    def get_answer(self, question: str, context: str, chat_history: list[dict] | None = None) -> str:
        last_err: Exception | None = None

        for provider in self._providers:
            name = provider.__class__.__name__
            try:
                return provider.get_answer(question, context, chat_history=chat_history)
            except LLMTemporaryError as exc:
                logger.warning(f"{name} rate-limited/errored, trying fallback: {exc}")
                last_err = exc

        raise RuntimeError(
            f"All LLM providers exhausted. Last error: {last_err}"
        )
