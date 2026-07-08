package com.asset.controller;

import com.asset.dto.ApiResponse;
import com.asset.dto.QnARequest;
import com.asset.dto.QnAResponse;
import com.asset.model.Asset;
import com.asset.model.MaintenanceRecord;
import com.asset.repository.AssetRepository;
import com.asset.repository.MaintenanceRecordRepository;
import com.asset.service.QnAService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.Period;
import java.util.*;
import java.util.stream.Collectors;

@RestController
@RequestMapping("/api/ai")
@RequiredArgsConstructor
@CrossOrigin(origins = "*")
public class AIController {

    private final QnAService qnaService;
    private final AssetRepository assetRepository;
    private final MaintenanceRecordRepository maintenanceRecordRepository;

    @PostMapping("/qa")
    public ResponseEntity<ApiResponse<QnAResponse>> askQuestion(@RequestBody QnARequest request) {
        QnAResponse response = qnaService.askQuestion(request);
        return ResponseEntity.ok(ApiResponse.success(response));
    }

    @PostMapping("/natural-language-search")
    public ResponseEntity<ApiResponse<Object>> naturalLanguageSearch(@RequestBody Map<String, Object> request) {
        String query = String.valueOf(request.getOrDefault("query", "")).toLowerCase();

        List<Asset> allAssets = assetRepository.findAll();
        List<Asset> filtered = allAssets.stream()
            .filter(a -> matchesQuery(a, query))
            .collect(Collectors.toList());

        // 조건에 매칭되는 자산이 없고 질의가 비어있지 않다면 전체 목록을 참고용으로 반환한다.
        boolean isDefaultResult = filtered.isEmpty() && !query.isBlank();
        List<Asset> resultAssets = isDefaultResult ? allAssets : filtered;

        Map<String, Object> response = new HashMap<>();
        response.put("assets", resultAssets);
        response.put("explanation", String.format("'%s'에 대한 검색 결과 %d건을 찾았습니다.", request.getOrDefault("query", ""), resultAssets.size()));
        response.put("isSimulated", false);
        return ResponseEntity.ok(ApiResponse.success(response));
    }

    private boolean matchesQuery(Asset asset, String query) {
        if (query.isBlank()) {
            return true;
        }
        boolean matched = true;

        if (asset.getAssetName() != null && query.contains(asset.getAssetName().toLowerCase())) {
            return true;
        }
        if (asset.getCategory() != null && (query.contains(asset.getCategory().toLowerCase())
            || (query.contains("노트북") && asset.getCategory().toLowerCase().contains("it"))
            || (query.contains("프린터") && asset.getCategory().toLowerCase().contains("사무")))) {
            matched = true;
        } else {
            matched = false;
        }

        if (asset.getLocation() != null && query.contains(asset.getLocation().toLowerCase())) {
            matched = true;
        }

        java.util.regex.Matcher yearMatcher = java.util.regex.Pattern.compile("(\\d+)\\s*년\\s*이상").matcher(query);
        if (yearMatcher.find()) {
            int minYears = Integer.parseInt(yearMatcher.group(1));
            int usedYears = Period.between(asset.getPurchaseDate(), LocalDate.now()).getYears();
            matched = matched && usedYears >= minYears;
        }

        if (query.contains("교체") || query.contains("고장")) {
            matched = matched && asset.getStatus() == Asset.Status.REPLACEMENT_NEEDED;
        }

        return matched;
    }

    @PostMapping("/replacement-recommendation")
    public ResponseEntity<ApiResponse<Object>> getReplacementRecommendation(@RequestBody(required = false) Map<String, Object> request) {
        Double budget = null;
        if (request != null && request.get("budget") != null) {
            budget = Double.valueOf(String.valueOf(request.get("budget")));
        }

        List<Asset> allAssets = assetRepository.findAll();
        List<Map<String, Object>> recommendations = new ArrayList<>();

        for (Asset asset : allAssets) {
            List<MaintenanceRecord> records = maintenanceRecordRepository.findByAssetId(asset.getId());
            int maintenanceCount = records.size();
            BigDecimal totalRepairCost = records.stream()
                .map(r -> r.getCost() == null ? BigDecimal.ZERO : r.getCost())
                .reduce(BigDecimal.ZERO, BigDecimal::add);
            int usedYears = Period.between(asset.getPurchaseDate(), LocalDate.now()).getYears();

            double repairRatio = asset.getPurchasePrice().doubleValue() > 0
                ? totalRepairCost.doubleValue() / asset.getPurchasePrice().doubleValue()
                : 0.0;

            // 점수가 높을수록 교체 우선순위가 높다.
            double score = (usedYears / (double) Math.max(asset.getUsefulLife(), 1)) * 40
                + repairRatio * 40
                + Math.min(maintenanceCount, 10) * 2;

            if (asset.getStatus() == Asset.Status.REPLACEMENT_NEEDED) {
                score += 20;
            }

            Map<String, Object> item = new HashMap<>();
            item.put("assetId", asset.getId());
            item.put("assetName", asset.getAssetName());
            item.put("assetCode", asset.getAssetCode());
            item.put("usedYears", usedYears);
            item.put("usefulLife", asset.getUsefulLife());
            item.put("maintenanceCount", maintenanceCount);
            item.put("totalRepairCost", totalRepairCost);
            item.put("purchasePrice", asset.getPurchasePrice());
            item.put("score", Math.round(score * 10.0) / 10.0);
            item.put("reason", String.format(
                "사용기간 %d년(내용연수 %d년), 수리비가 구매가의 %.0f%% 수준이며 최근 유지보수 %d회가 발생했습니다.",
                usedYears, asset.getUsefulLife(), repairRatio * 100, maintenanceCount));

            recommendations.add(item);
        }

        recommendations.sort((a, b) -> Double.compare((Double) b.get("score"), (Double) a.get("score")));

        double totalRecommendedCost = 0.0;
        if (budget != null) {
            List<Map<String, Object>> withinBudget = new ArrayList<>();
            double remaining = budget;
            for (Map<String, Object> rec : recommendations) {
                double price = ((BigDecimal) rec.get("purchasePrice")).doubleValue();
                if (price <= remaining) {
                    withinBudget.add(rec);
                    remaining -= price;
                    totalRecommendedCost += price;
                }
            }
            recommendations = withinBudget;
        } else {
            recommendations = recommendations.stream().limit(5).collect(Collectors.toList());
            totalRecommendedCost = recommendations.stream()
                .mapToDouble(r -> ((BigDecimal) r.get("purchasePrice")).doubleValue())
                .sum();
        }

        Map<String, Object> response = new HashMap<>();
        response.put("recommendations", recommendations);
        response.put("aiAnalysis", recommendations.isEmpty()
            ? "현재 교체 권장 자산이 없습니다."
            : String.format("총 %d건의 교체 우선순위 추천 결과입니다.", recommendations.size()));
        response.put("budget", budget);
        response.put("totalRecommendedCost", totalRecommendedCost);
        return ResponseEntity.ok(ApiResponse.success(response));
    }

    @GetMapping("/maintenance-analysis")
    public ResponseEntity<ApiResponse<Object>> getMaintenanceAnalysis() {
        List<MaintenanceRecord> allRecords = maintenanceRecordRepository.findAll();

        long totalRecords = allRecords.size();
        BigDecimal totalCost = allRecords.stream()
            .map(r -> r.getCost() == null ? BigDecimal.ZERO : r.getCost())
            .reduce(BigDecimal.ZERO, BigDecimal::add);

        Map<Long, Long> failureCountByAsset = allRecords.stream()
            .filter(r -> r.getMaintenanceType() == MaintenanceRecord.MaintenanceType.REPAIR)
            .collect(Collectors.groupingBy(MaintenanceRecord::getAssetId, Collectors.counting()));

        Map<String, Long> failurePatterns = allRecords.stream()
            .filter(r -> r.getFailureType() != null && !r.getFailureType().isBlank())
            .collect(Collectors.groupingBy(MaintenanceRecord::getFailureType, Collectors.counting()));

        Map<String, Object> statistics = new HashMap<>();
        statistics.put("totalRecords", totalRecords);
        statistics.put("totalCost", totalCost);
        statistics.put("repeatedFailureAssetCount", failureCountByAsset.values().stream().filter(c -> c >= 2).count());

        String aiAnalysis = totalRecords == 0
            ? "분석할 유지보수 데이터가 없습니다."
            : String.format("총 %d건의 유지보수 기록이 있으며, 누적 비용은 %s원입니다. 반복 고장 자산은 %d건입니다.",
                totalRecords, totalCost.toPlainString(),
                failureCountByAsset.values().stream().filter(c -> c >= 2).count());

        Map<String, Object> response = new HashMap<>();
        response.put("statistics", statistics);
        response.put("aiAnalysis", aiAnalysis);
        response.put("costTrend", Collections.emptyMap());
        response.put("failurePatterns", failurePatterns);
        return ResponseEntity.ok(ApiResponse.success(response));
    }
}
