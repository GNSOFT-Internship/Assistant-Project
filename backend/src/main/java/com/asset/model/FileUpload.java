package com.asset.model;

import jakarta.persistence.*;
import lombok.*;
import java.time.LocalDateTime;

@Entity
@Table(name = "file_upload")
@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class FileUpload {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;
    
    private String filename;
    
    @Column(name = "original_filename")
    private String originalFilename;
    
    @Enumerated(EnumType.STRING)
    @Column(name = "file_type")
    private FileType fileType;
    
    @Column(name = "file_path")
    private String filePath;
    
    @Enumerated(EnumType.STRING)
    private UploadStatus status;
    
    @Column(columnDefinition = "TEXT")
    private String extractedData;
    
    @Column(name = "error_message", columnDefinition = "TEXT")
    private String errorMessage;
    
    private Boolean applied;
    
    @Column(name = "created_at")
    private LocalDateTime createdAt;
    
    public enum FileType {
        EXCEL, CSV, PDF
    }
    
    public enum UploadStatus {
        PENDING, PROCESSING, COMPLETED, FAILED
    }
}