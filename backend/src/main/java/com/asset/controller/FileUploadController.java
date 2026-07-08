package com.asset.controller;

import com.asset.dto.ApiResponse;
import com.asset.dto.FileUploadResponse;
import com.asset.model.FileUpload;
import com.asset.service.FileUploadService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.util.List;
import java.util.stream.Collectors;

@RestController
@RequestMapping("/api/files")
@RequiredArgsConstructor
@CrossOrigin(origins = "*")
public class FileUploadController {
    
    private final FileUploadService fileUploadService;
    
    @GetMapping
    public ResponseEntity<ApiResponse<List<FileUploadResponse>>> getAllFiles() {
        List<FileUploadResponse> files = fileUploadService.getAllFiles().stream()
            .map(f -> FileUploadResponse.builder()
                .id(f.getId())
                .filename(f.getFilename())
                .originalFilename(f.getOriginalFilename())
                .fileType(f.getFileType().name())
                .status(f.getStatus().name())
                .applied(f.getApplied())
                .build())
            .collect(Collectors.toList());
        return ResponseEntity.ok(ApiResponse.success(files));
    }
    
    @PostMapping("/upload")
    public ResponseEntity<ApiResponse<FileUploadResponse>> uploadFile(@RequestParam("file") MultipartFile file) {
        try {
            FileUpload uploaded = fileUploadService.uploadFile(file);
            FileUploadResponse response = FileUploadResponse.builder()
                .id(uploaded.getId())
                .filename(uploaded.getFilename())
                .originalFilename(uploaded.getOriginalFilename())
                .fileType(uploaded.getFileType().name())
                .status(uploaded.getStatus().name())
                .applied(uploaded.getApplied())
                .build();
            return ResponseEntity.ok(ApiResponse.success("File uploaded successfully", response));
        } catch (IOException e) {
            return ResponseEntity.badRequest()
                .body(ApiResponse.error("File upload failed: " + e.getMessage()));
        }
    }
    
    @PostMapping("/{id}/process")
    public ResponseEntity<ApiResponse<FileUploadResponse>> processFile(@PathVariable Long id) {
        try {
            FileUpload processed = fileUploadService.processFile(id);
            FileUploadResponse response = FileUploadResponse.builder()
                .id(processed.getId())
                .filename(processed.getFilename())
                .originalFilename(processed.getOriginalFilename())
                .fileType(processed.getFileType().name())
                .status(processed.getStatus().name())
                .applied(processed.getApplied())
                .build();
            return ResponseEntity.ok(ApiResponse.success("File processed successfully", response));
        } catch (Exception e) {
            return ResponseEntity.badRequest()
                .body(ApiResponse.error("File processing failed: " + e.getMessage()));
        }
    }
    
    @PostMapping("/{id}/apply")
    public ResponseEntity<ApiResponse<FileUploadResponse>> applyFile(@PathVariable Long id) {
        try {
            FileUpload applied = fileUploadService.applyFile(id);
            FileUploadResponse response = FileUploadResponse.builder()
                .id(applied.getId())
                .filename(applied.getFilename())
                .originalFilename(applied.getOriginalFilename())
                .fileType(applied.getFileType().name())
                .status(applied.getStatus().name())
                .applied(applied.getApplied())
                .build();
            return ResponseEntity.ok(ApiResponse.success("File applied successfully", response));
        } catch (Exception e) {
            return ResponseEntity.badRequest()
                .body(ApiResponse.error("File application failed: " + e.getMessage()));
        }
    }
    
    @DeleteMapping("/{id}")
    public ResponseEntity<ApiResponse<Void>> deleteFile(@PathVariable Long id) {
        try {
            fileUploadService.deleteFile(id);
            return ResponseEntity.ok(ApiResponse.success("File deleted successfully", null));
        } catch (Exception e) {
            return ResponseEntity.badRequest()
                .body(ApiResponse.error("File deletion failed: " + e.getMessage()));
        }
    }
}