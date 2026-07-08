package com.asset.dto;

import lombok.*;

@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class FileUploadResponse {
    private Long id;
    private String filename;
    private String originalFilename;
    private String fileType;
    private String status;
    private Boolean applied;
}