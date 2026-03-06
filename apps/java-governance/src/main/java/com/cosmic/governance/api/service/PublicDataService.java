package com.cosmic.governance.api.service;

import org.springframework.stereotype.Service;

import java.util.List;
import java.util.Map;

/**
 * Stub service representing a registry of public data sources.
 * Used by the public-data integration slice.
 */
@Service
public class PublicDataService {
    public List<Map<String,String>> getSources() {
        return List.of(
            Map.of("name","NRAO TAP","url","https://data-query.nrao.edu/tap"),
            Map.of("name","VLASS HiPS","url","https://vlass-dl.nrao.edu"),
            Map.of("name","data.gov NVSS","url","https://catalog.data.gov/dataset/nrao-vla-sky-survey-catalog")
        );
    }
}
