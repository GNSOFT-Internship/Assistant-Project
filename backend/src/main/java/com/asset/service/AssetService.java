package com.asset.service;

import com.asset.dto.DashboardData;
import com.asset.model.Asset;
import com.asset.model.MaintenanceRecord;
import com.asset.repository.AssetRepository;
import com.asset.repository.MaintenanceRecordRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.Period;
import java.util.*;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
public class AssetService {
    
    private final AssetRepository assetRepository;
    private final MaintenanceRecordRepository maintenanceRecordRepository;
    
    @Value("${demo.mode:false}")
    private boolean demoMode;
    
    private final Random random = new Random();
    
    public List<com.asset.dto.AssetDTO> getAllAssets() {
        return assetRepository.findAll().stream()
            .map(com.asset.dto.AssetDTO::fromEntity)
            .collect(Collectors.toList());
    }
    
    public Optional<com.asset.dto.AssetDTO> getAssetById(Long id) {
        return assetRepository.findById(id).map(com.asset.dto.AssetDTO::fromEntity);
    }
    
    public com.asset.dto.AssetDTO createAsset(com.asset.dto.AssetRequest request) {
        Asset asset = Asset.builder()
            .assetName(request.getAssetName())
            .assetCode(request.getAssetCode())
            .category(request.getCategory())
            .location(request.getLocation())
            .responsiblePerson(request.getResponsiblePerson())
            .purchaseDate(LocalDate.parse(request.getPurchaseDate()))
            .purchasePrice(new java.math.BigDecimal(request.getPurchasePrice()))
            .usefulLife(request.getUsefulLife())
            .status(Asset.Status.valueOf(request.getStatus() != null ? request.getStatus() : "ACTIVE"))
            .description(request.getDescription())
            .build();
        return com.asset.dto.AssetDTO.fromEntity(assetRepository.save(asset));
    }
    
    public void deleteAsset(Long id) {
        assetRepository.deleteById(id);
    }
    
    public com.asset.dto.DashboardData getDashboardData() {
        List<Asset> allAssets = assetRepository.findAll();
        int totalAssets = allAssets.size();
        int activeAssets = (int) allAssets.stream()
            .filter(a -> a.getStatus() == Asset.Status.ACTIVE).count();
        int replacementNeededAssets = (int) allAssets.stream()
            .filter(a -> a.getStatus() == Asset.Status.REPLACEMENT_NEEDED).count();
        
        int currentMonth = LocalDateTime.now().getMonthValue();
        int currentYear = LocalDateTime.now().getYear();
        
        double currentMonthCost = maintenanceRecordRepository.findAll().stream()
            .filter(r -> r.getMaintenanceDate() != null && 
                       r.getMaintenanceDate().getMonthValue() == currentMonth &&
                       r.getMaintenanceDate().getYear() == currentYear)
            .mapToDouble(r -> r.getCost() != null ? r.getCost().doubleValue() : 0)
            .sum();
        
        double operationRate = totalAssets > 0 ? (activeAssets * 100.0 / totalAssets) : 100.0;
        double budgetConsumptionRate = 45.0;
        
        if (demoMode) {
            double factor = 1.0 + (random.nextDouble() * 0.2 - 0.1);
            currentMonthCost *= factor;
            operationRate = Math.max(0, Math.min(100, operationRate + random.nextDouble() * 4 - 2));
            budgetConsumptionRate *= factor;
        }
        
        return com.asset.dto.DashboardData.builder()
            .currentMonthMaintenanceCost(currentMonthCost)
            .newFailureCount(5)
            .operationRate(operationRate)
            .budgetConsumptionRate(budgetConsumptionRate)
            .totalAssets(totalAssets)
            .activeAssets(activeAssets)
            .replacementNeededAssets(replacementNeededAssets)
            .isSimulated(demoMode)
            .build();
    }
}