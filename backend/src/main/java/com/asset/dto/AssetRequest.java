package com.asset.dto;

import lombok.*;

@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class AssetRequest {
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
}