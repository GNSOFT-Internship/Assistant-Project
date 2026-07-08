from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Dict, Any, Optional, List
import json
import os
import re

app = FastAPI(title="AI Asset Management Server")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class QueryRequest(BaseModel):
    query: str

class AnalyzeRequest(BaseModel):
    prompt: str
    max_tokens: int = 1000

class FileAnalyzeRequest(BaseModel):
    filename: str
    content: str
    filetype: str

class ReplacementRequest(BaseModel):
    budget: Optional[float] = None

@app.get("/")
def read_root():
    return {"status": "AI Server is running"}

@app.post("/api/ai/parse-query")
def parse_query(request: QueryRequest):
    query = request.query.lower()
    # 공백 유무와 관계없이 매칭되도록 공백을 제거한 버전도 함께 사용한다.
    query_nospace = re.sub(r"\s+", "", query)
    criteria = {}

    if "노트북" in query or "pc" in query or "컴퓨터" in query:
        criteria["category"] = "IT 장비"

    if "프린터" in query or "복사기" in query:
        criteria["category"] = "사무기기"

    if "에어컨" in query or "설비" in query:
        criteria["category"] = "설비"

    # "N년 이상" 형태의 사용 기간 조건을 숫자와 함께 추출한다.
    year_match = re.search(r"(\d+)\s*년\s*이상", query)
    if year_match:
        criteria["minUsageYears"] = float(year_match.group(1))

    if "고장" in query or "교체" in query:
        criteria["status"] = "REPLACEMENT_NEEDED"

    # "100만원 이상" 등 금액 조건 추출 (만원 단위)
    price_match = re.search(r"(\d+)\s*만\s*원?\s*이상", query)
    if price_match:
        criteria["minPrice"] = float(price_match.group(1)) * 10000
    elif "1000000" in query_nospace:
        criteria["minPrice"] = 1000000.0

    return {
        "criteria": criteria,
        "explanation": f"'{request.query}'를 검색 조건으로 변환했습니다."
    }

@app.post("/api/ai/analyze")
def analyze_text(request: AnalyzeRequest):
    answer = generate_fallback_answer(request.prompt)
    return {"answer": answer}

@app.post("/api/ai/generate-text")
def generate_text(request: AnalyzeRequest):
    return {"answer": generate_fallback_answer(request.prompt)}

@app.post("/api/ai/generate-report")
def generate_report(request: AnalyzeRequest):
    return {"report": generate_fallback_report(request.prompt)}

@app.post("/api/ai/analyze-file")
def analyze_file(request: FileAnalyzeRequest):
    extracted = extract_from_content(request.content, request.filetype)
    return {"extractedData": extracted}

def generate_fallback_answer(prompt: str) -> str:
    return """AI 분석이 비활성화되어 있습니다. Claude API 키를 설정하면 더 정확한 분석이 가능합니다.

현재 제공되는 데이터는 기본 통계 정보입니다."""

def generate_fallback_report(prompt: str) -> str:
    return """=== 자산 관리 보고서 ===

본 보고서는 AI 서버 연결 없이 기본 데이터로 생성되었습니다.

## 자산 현황
- 총 자산 수: 시스템 데이터 참조
- 가동률: 시스템 데이터 참조

## 유지보수 비용
- 이번 달 비용: 시스템 데이터 참조
- 누적 비용: 시스템 데이터 참조

## 개선사항
AI 서버를 연결하면 더 상세한 분석과 추천을 받을 수 있습니다.

Claude API 키 설정 방법:
1. backend/src/main/resources/application.properties 파일에서 claude.api.key 설정
2. AI 서버에서도 API 키 설정"""

def extract_from_content(content: str, filetype: str) -> Dict[str, Any]:
    if filetype == "CSV":
        lines = content.strip().split('\n')
        if len(lines) > 1:
            headers = lines[0].split(',')
            first_data = lines[1].split(',') if len(lines) > 1 else []
            return {
                "message": "CSV 파일 분석 완료",
                "headers": headers,
                "firstRow": first_data,
                "rowCount": len(lines) - 1
            }
    
    elif filetype == "EXCEL":
        return {
            "message": "Excel 파일 - 텍스트 추출 필요",
            "note": "실제 구현에서는 openpyxl 라이브러리를 사용해야 합니다."
        }
    
    elif filetype == "PDF":
        return {
            "message": "PDF 파일 - 텍스트 추출 필요",
            "note": "실제 구현에서는 PyPDF2 또는 pdfplumber 라이브러리를 사용해야 합니다."
        }
    
    return {
        "message": "파일 분석 완료",
        "content": content[:500] if len(content) > 500 else content
    }

@app.get("/health")
def health_check():
    return {"status": "healthy"}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8001)