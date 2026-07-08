package com.asset.dto;

import lombok.*;

@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class DashboardData {
    private Double currentMonthMaintenanceCost;
    private Integer newFailureCount;
    private Double operationRate;
    private Double budgetConsumptionRate;
    private Integer totalAssets;
    private Integer activeAssets;
    private Integer replacementNeededAssets;
    private Boolean isSimulated;
}