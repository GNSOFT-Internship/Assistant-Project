package com.asset.dto;

import lombok.*;

import java.util.List;

@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class QnAResponse {
    private String answer;
    private List<Object> sourceData;
    private boolean hasData;
}