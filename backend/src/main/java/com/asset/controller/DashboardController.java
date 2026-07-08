package com.asset.controller;

import com.asset.dto.*;
import com.asset.service.AssetService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/dashboard")
@RequiredArgsConstructor
@CrossOrigin(origins = "*")
public class DashboardController {
    
    private final AssetService assetService;
    
    @GetMapping
    public ResponseEntity<ApiResponse<DashboardData>> getDashboardData() {
        DashboardData data = assetService.getDashboardData();
        return ResponseEntity.ok(ApiResponse.success(data));
    }
}