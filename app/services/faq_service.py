import json
import logging
import os
import re
from typing import List, Optional

from app.models.chat import FAQItem, FAQSearchResult

logger = logging.getLogger(__name__)

_DATA_FILE = os.path.join(os.path.dirname(__file__), "..", "data", "faq.json")


class FAQService:
    def __init__(self) -> None:
        self.faqs: List[FAQItem] = []
        self._load()

    def _load(self) -> None:
        path = os.path.normpath(_DATA_FILE)
        if not os.path.exists(path):
            logger.warning("FAQ file not found: %s", path)
            return
        with open(path, "r", encoding="utf-8") as f:
            data = json.load(f)
        self.faqs = [FAQItem(**item) for item in data.get("faqs", [])]
        logger.info("Loaded %d FAQ entries", len(self.faqs))

    def get_all(self) -> List[FAQItem]:
        return self.faqs

    def get_by_id(self, faq_id: str) -> Optional[FAQItem]:
        return next((f for f in self.faqs if f.id == faq_id), None)

    def get_categories(self) -> List[str]:
        seen: dict = {}
        for faq in self.faqs:
            seen[faq.category] = True
        return list(seen.keys())

    def search(self, query: str, threshold: float = 0.25) -> List[FAQSearchResult]:
        q = query.lower()
        q_words = set(q.split())
        results: List[FAQSearchResult] = []

        for faq in self.faqs:
            score = 0.0
            combined = (faq.question + " " + " ".join(faq.keywords)).lower()

            # BUG-003 fix: whole-word matching instead of substring to avoid
            # false positives like "red" matching "thread"
            for kw in faq.keywords:
                pattern = r"(?<!\w)" + re.escape(kw.lower()) + r"(?!\w)"
                if re.search(pattern, q):
                    score += 0.6

            faq_words = set(combined.split())
            overlap = len(q_words & faq_words) / max(len(q_words), 1)
            score += overlap * 0.4

            score = min(score, 1.0)
            if score >= threshold:
                results.append(FAQSearchResult(item=faq, score=score))

        return sorted(results, key=lambda r: r.score, reverse=True)[:5]

    def find_best_match(self, query: str, threshold: float = 0.55) -> Optional[FAQItem]:
        # Two-stage filter: broad candidates at 0.25, strict match at threshold
        results = self.search(query, threshold=0.25)
        if results and results[0].score >= threshold:
            return results[0].item
        return None


faq_service = FAQService()
