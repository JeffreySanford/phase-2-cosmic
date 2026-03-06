package com.cosmic.governance.api.service;

import org.springframework.stereotype.Service;

import java.util.Map;

/**
 * Stubbed VO service providing discovery of Virtual Observatory endpoints.
 * Can be expanded to query configuration or registry in the future.
 */
@Service
public class VoService {
    public Map<String, String> getServices() {
        // placeholder values; real deployment should supply actual URLs
        return Map.of(
                "tapUrl", "https://ngvla.example.com/tap",
                "dataLinkUrl", "https://ngvla.example.com/datalink"
        );
    }
}
