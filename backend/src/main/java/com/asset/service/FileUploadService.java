package com.asset.service;

import com.asset.model.FileUpload;
import com.asset.repository.FileUploadRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;
import java.util.UUID;

@Service
@RequiredArgsConstructor
public class FileUploadService {
    
    private final FileUploadRepository fileUploadRepository;
    
    @Value("${upload.directory:./uploads}")
    private String uploadDirectory;
    
    public List<FileUpload> getAllFiles() {
        return fileUploadRepository.findAll();
    }
    
    public FileUpload uploadFile(MultipartFile file) throws IOException {
        Path uploadPath = Paths.get(uploadDirectory);
        if (!Files.exists(uploadPath)) {
            Files.createDirectories(uploadPath);
        }
        
        String originalFilename = file.getOriginalFilename();
        String filename = UUID.randomUUID() + "_" + originalFilename;
        Path filePath = uploadPath.resolve(filename);
        Files.copy(file.getInputStream(), filePath);
        
        FileUpload.FileType fileType = detectFileType(originalFilename);
        
        FileUpload fileUpload = FileUpload.builder()
            .filename(filename)
            .originalFilename(originalFilename)
            .fileType(fileType)
            .filePath(filePath.toString())
            .status(FileUpload.UploadStatus.PENDING)
            .applied(false)
            .createdAt(LocalDateTime.now())
            .build();
        
        return fileUploadRepository.save(fileUpload);
    }
    
    public FileUpload processFile(Long id) {
        FileUpload fileUpload = fileUploadRepository.findById(id)
            .orElseThrow(() -> new RuntimeException("File not found"));
        
        try {
            fileUpload.setStatus(FileUpload.UploadStatus.PROCESSING);
            fileUploadRepository.save(fileUpload);
            
            // Mock 분석 결과 생성
            Map<String, Object> mockResult = Map.of(
                "message", "Mock 분석 완료",
                "filename", fileUpload.getOriginalFilename(),
                "fileType", fileUpload.getFileType().name(),
                "uploadTime", fileUpload.getCreatedAt().toString(),
                "estimatedRows", 10,
                "sheets", 1
            );
            
            fileUpload.setStatus(FileUpload.UploadStatus.COMPLETED);
            fileUpload.setExtractedData(mockResult.toString());
            
        } catch (Exception e) {
            fileUpload.setStatus(FileUpload.UploadStatus.FAILED);
            fileUpload.setErrorMessage(e.getMessage());
        }
        
        fileUpload.setUpdatedAt(LocalDateTime.now());
        return fileUploadRepository.save(fileUpload);
    }
    
    public FileUpload applyFile(Long id) {
        FileUpload fileUpload = fileUploadRepository.findById(id)
            .orElseThrow(() -> new RuntimeException("File not found"));
        
        if (fileUpload.getStatus() != FileUpload.UploadStatus.COMPLETED) {
            throw new RuntimeException("Completed file only can be applied");
        }
        
        fileUpload.setApplied(true);
        fileUpload.setUpdatedAt(LocalDateTime.now());
        return fileUploadRepository.save(fileUpload);
    }
    
    public void deleteFile(Long id) {
        FileUpload fileUpload = fileUploadRepository.findById(id)
            .orElseThrow(() -> new RuntimeException("File not found"));
        
        try {
            Path filePath = Paths.get(fileUpload.getFilePath());
            if (Files.exists(filePath)) {
                Files.delete(filePath);
            }
        } catch (IOException e) {
            System.err.println("File deletion failed: " + e.getMessage());
        }
        
        fileUploadRepository.deleteById(id);
    }
    
    private FileUpload.FileType detectFileType(String filename) {
        if (filename == null) return FileUpload.FileType.PDF;
        String lower = filename.toLowerCase();
        if (lower.endsWith(".csv")) return FileUpload.FileType.CSV;
        if (lower.endsWith(".xlsx") || lower.endsWith(".xls")) return FileUpload.FileType.EXCEL;
        return FileUpload.FileType.PDF;
    }
}