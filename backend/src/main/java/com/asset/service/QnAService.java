package com.asset.service;

import com.asset.dto.QnARequest;
import com.asset.dto.QnAResponse;
import com.asset.model.Asset;
import com.asset.repository.AssetRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.time.LocalDate;
import java.time.Period;
import java.util.*;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
public class QnAService {
    
    private final AssetRepository assetRepository;
    
    public QnAResponse askQuestion(QnARequest request) {
        List<Asset> allAssets = assetRepository.findAll();
        String question = request.getQuestion().toLowerCase();
        
        // 데이터 기반 응답 생성
        if (question.contains("자산") || question.contains("목록") || question.contains("전체")) {
            return QnAResponse.builder()
                .answer(String.format("총 %d 개의 자산이 등록되어 있습니다.", allAssets.size()))
                .sourceData(convertToSourceData(allAssets))
                .hasData(true)
                .build();
        }
        
        if (question.contains("노트북") || question.contains("pc") || question.contains("컴퓨터")) {
            List<Asset> itAssets = allAssets.stream()
                .filter(a -> a.getCategory().toLowerCase().contains("it"))
                .collect(Collectors.toList());
            return QnAResponse.builder()
                .answer(String.format("IT 장비는 총 %d 개 있습니다.", itAssets.size()))
                .sourceData(convertToSourceData(itAssets))
                .hasData(true)
                .build();
        }
        
        if (question.contains("가격") || question.contains("비가") || question.contains("비싸")) {
            List<Asset> expensiveAssets = allAssets.stream()
                .filter(a -> a.getPurchasePrice().doubleValue() > 1000000)
                .collect(Collectors.toList());
            return QnAResponse.builder()
                .answer(String.format("100 만원 이상인 자산은 총 %d 개 있습니다.", expensiveAssets.size()))
                .sourceData(convertToSourceData(expensiveAssets))
                .hasData(true)
                .build();
        }
        
        if (question.contains("상태") || question.contains("고장") || question.contains("교체")) {
            List<Asset> problematicAssets = allAssets.stream()
                .filter(a -> a.getStatus() == Asset.Status.REPLACEMENT_NEEDED || 
                           a.getStatus() == Asset.Status.INACTIVE)
                .collect(Collectors.toList());
            return QnAResponse.builder()
                .answer(String.format("교체나 조치가 필요한 자산은 총 %d 개 있습니다.", problematicAssets.size()))
                .sourceData(convertToSourceData(problematicAssets))
                .hasData(true)
                .build();
        }
        
        if (question.contains("사용") || question.contains("연") || question.contains("기간")) {
            List<Asset> oldAssets = allAssets.stream()
                .filter(a -> {
                    int years = Period.between(a.getPurchaseDate(), LocalDate.now()).getYears();
                    return years >= 5;
                })
                .collect(Collectors.toList());
            return QnAResponse.builder()
                .answer(String.format("5 년 이상 사용한 자산은 총 %d 개 있습니다.", oldAssets.size()))
                .sourceData(convertToSourceData(oldAssets))
                .hasData(true)
                .build();
        }
        
        if (question.contains("카테고리") || question.contains("종류")) {
            Map<String, Long> byCategory = allAssets.stream()
                .collect(Collectors.groupingBy(
                    Asset::getCategory,
                    Collectors.counting()));
            
            StringBuilder answer = new StringBuilder("카테고리별 자산 수:\n");
            byCategory.forEach((cat, count) -> 
                answer.append(String.format("- %s: %d개\n", cat, count)));
            
            return QnAResponse.builder()
                .answer(answer.toString())
                .sourceData(List.of(byCategory))
                .hasData(true)
                .build();
        }
        
        // 기본 응답
        return QnAResponse.builder()
            .answer("해당하는 데이터를 찾을 수 없습니다. 다른 질문을 해주세요.")
            .sourceData(new ArrayList<>())
            .hasData(false)
            .build();
    }
    
    private List<Object> convertToSourceData(List<Asset> assets) {
        return assets.stream()
            .map(a -> {
                Map<String, Object> map = new HashMap<>();
                map.put("id", a.getId());
                map.put("name", a.getAssetName());
                map.put("category", a.getCategory());
                map.put("price", a.getPurchasePrice());
                return map;
            })
            .collect(Collectors.toList());
    }
}