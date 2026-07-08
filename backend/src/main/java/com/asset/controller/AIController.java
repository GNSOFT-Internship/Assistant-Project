package com.asset.controller;

import com.asset.dto.ApiResponse;
import com.asset.dto.QnARequest;
import com.asset.dto.QnAResponse;
import com.asset.service.QnAService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/ai")
@RequiredArgsConstructor
@CrossOrigin(origins = "*")
public class AIController {
    
    private final QnAService qnaService;
    
    @PostMapping("/qa")
    public ResponseEntity<ApiResponse<QnAResponse>> askQuestion(@RequestBody QnARequest request) {
        QnAResponse response = qnaService.askQuestion(request);
        return ResponseEntity.ok(ApiResponse.success(response));
    }
    
    @PostMapping("/natural-language-search")
    public ResponseEntity<ApiResponse<Object>> naturalLanguageSearch(@RequestBody Object request) {
        Object response = Map.of(
            "assets", List.of(),
            "explanation", "검색 조건이 설정되었습니다.",
            "isSimulated", false
        );
        return ResponseEntity.ok(ApiResponse.success(response));
    }
    
    @PostMapping("/replacement-recommendation")
    public ResponseEntity<ApiResponse<Object>> getReplacementRecommendation(@RequestBody Object request) {
        Object response = Map.of(
            "recommendations", List.of(),
            "aiAnalysis", "현재 교체 권장 자산이 없습니다.",
            "budget", null,
            "totalRecommendedCost", 0.0
        );
        return ResponseEntity.ok(ApiResponse.success(response));
    }
    
    @GetMapping("/maintenance-analysis")
    public ResponseEntity<ApiResponse<Object>> getMaintenanceAnalysis() {
        Object response = Map.of(
            "statistics", Map.of("totalRecords", 0, "totalCost", 0.0),
            "aiAnalysis", "분석 데이터가 없습니다.",
            "costTrend", Map.of(),
            "failurePatterns", Map.of()
        );
        return ResponseEntity.ok(ApiResponse.success(response));
    }
}