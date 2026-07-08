package com.asset.model;

import jakarta.persistence.*;
import lombok.*;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;

@Entity
@Table(name = "maintenance_record")
@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class MaintenanceRecord {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;
    
    @Column(name = "asset_id", nullable = false)
    private Long assetId;
    
    @Column(name = "maintenance_date", nullable = false)
    private LocalDate maintenanceDate;
    
    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private MaintenanceType maintenanceType;
    
    private BigDecimal cost;
    
    private String description;
    
    @Column(length = 100)
    private String technician;
    
    @Column(name = "failure_type", length = 200)
    private String failureType;
    
    @Column(name = "created_at")
    private LocalDateTime createdAt;
    
    public enum MaintenanceType {
        ROUTINE, REPAIR, REPLACEMENT, INSPECTION
    }
}