package com.asset.dto;

import lombok.*;
import com.asset.model.Asset;
import java.time.LocalDateTime;

@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class AssetDTO {
    private Long id;
    private String assetName;
    private String assetCode;
    private String category;
    private String location;
    private String responsiblePerson;
    private String purchaseDate;
    private Double purchasePrice;
    private Integer usefulLife;
    private String status;
    private String description;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;
    
    public static AssetDTO fromEntity(Asset asset) {
        return AssetDTO.builder()
            .id(asset.getId())
            .assetName(asset.getAssetName())
            .assetCode(asset.getAssetCode())
            .category(asset.getCategory())
            .location(asset.getLocation())
            .responsiblePerson(asset.getResponsiblePerson())
            .purchaseDate(asset.getPurchaseDate() != null ? asset.getPurchaseDate().toString() : null)
            .purchasePrice(asset.getPurchasePrice() != null ? asset.getPurchasePrice().doubleValue() : 0.0)
            .usefulLife(asset.getUsefulLife())
            .status(asset.getStatus() != null ? asset.getStatus().name() : "ACTIVE")
            .description(asset.getDescription())
            .createdAt(asset.getCreatedAt())
            .updatedAt(asset.getUpdatedAt())
            .build();
    }
}