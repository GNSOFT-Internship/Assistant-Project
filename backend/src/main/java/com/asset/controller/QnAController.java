package com.asset.controller;

import com.asset.dto.ApiResponse;
import com.asset.dto.QnARequest;
import com.asset.dto.QnAResponse;
import com.asset.service.QnAService;
import lombok.RequiredArgsConstructor;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/qa")
@RequiredArgsConstructor
@CrossOrigin(origins = "*")
public class QnAController {
    
    private static final Logger logger = LoggerFactory.getLogger(QnAController.class);
    private final QnAService qnaService;
    
    @PostMapping("/ask")
    public ResponseEntity<ApiResponse<QnAResponse>> askQuestion(@RequestBody QnARequest request) {
        logger.info("QnAController.askQuestion called with question: {}", request.getQuestion());
        QnAResponse response = qnaService.askQuestion(request);
        logger.info("QnAController.askQuestion returning response: {}", response.getAnswer());
        return ResponseEntity.ok(ApiResponse.success(response));
    }
}