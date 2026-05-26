from fastapi import APIRouter, HTTPException, Query
from typing import List

from app.models.chat import FAQItem
from app.services.faq_service import faq_service

router = APIRouter()


@router.get("/", response_model=List[FAQItem])
async def get_all_faqs() -> List[FAQItem]:
    return faq_service.get_all()


@router.get("/categories")
async def get_categories() -> dict:
    return {"categories": faq_service.get_categories()}


@router.get("/search")
async def search_faqs(q: str = Query(..., min_length=2)) -> dict:
    results = faq_service.search(q)
    return {
        "results": [
            {"item": r.item.model_dump(), "score": round(r.score, 3)} for r in results
        ]
    }


@router.get("/{faq_id}", response_model=FAQItem)
async def get_faq(faq_id: str) -> FAQItem:
    faq = faq_service.get_by_id(faq_id)
    if not faq:
        raise HTTPException(status_code=404, detail="FAQ não encontrado")
    return faq
