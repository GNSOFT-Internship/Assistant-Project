package com.asset.controller;

import com.asset.dto.*;
import com.asset.service.AssetService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/assets")
@RequiredArgsConstructor
@CrossOrigin(origins = "*")
public class AssetController {
    
    private final AssetService assetService;
    
    @GetMapping
    public ResponseEntity<ApiResponse<List<AssetDTO>>> getAllAssets() {
        List<AssetDTO> assets = assetService.getAllAssets();
        return ResponseEntity.ok(ApiResponse.success(assets));
    }
    
    @GetMapping("/{id}")
    public ResponseEntity<ApiResponse<AssetDTO>> getAsset(@PathVariable Long id) {
        return assetService.getAssetById(id)
            .map(asset -> ResponseEntity.ok(ApiResponse.success(asset)))
            .orElse(ResponseEntity.notFound().build());
    }
    
    @PostMapping
    public ResponseEntity<ApiResponse<AssetDTO>> createAsset(@RequestBody AssetRequest request) {
        AssetDTO created = assetService.createAsset(request);
        return ResponseEntity.ok(ApiResponse.success("Asset created successfully", created));
    }
    
    @DeleteMapping("/{id}")
    public ResponseEntity<ApiResponse<Void>> deleteAsset(@PathVariable Long id) {
        assetService.deleteAsset(id);
        return ResponseEntity.ok(ApiResponse.success("Asset deleted", null));
    }
}