package com.asset.model;

import jakarta.persistence.*;
import lombok.*;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;

@Entity
@Table(name = "asset")
@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class Asset {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;
    
    @Column(name = "asset_name", nullable = false, length = 200)
    private String assetName;
    
    @Column(name = "asset_code", nullable = false, unique = true, length = 50)
    private String assetCode;
    
    @Column(nullable = false, length = 100)
    private String category;
    
    private String location;
    
    @Column(name = "responsible_person", length = 100)
    private String responsiblePerson;
    
    @Column(name = "purchase_date", nullable = false)
    private LocalDate purchaseDate;
    
    @Column(name = "purchase_price", nullable = false, precision = 15, scale = 2)
    private BigDecimal purchasePrice;
    
    @Column(name = "useful_life", nullable = false)
    private Integer usefulLife;
    
    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private Status status;
    
    private String description;
    
    @Column(name = "created_at")
    private LocalDateTime createdAt;
    
    @Column(name = "updated_at")
    private LocalDateTime updatedAt;
    
    public enum Status {
        ACTIVE, INACTIVE, REPLACEMENT_NEEDED, UNDER_MAINTENANCE
    }
}