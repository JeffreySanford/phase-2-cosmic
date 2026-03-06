package com.cosmic.governance.api.service;

import org.junit.jupiter.api.Test;
import java.util.List;
import java.util.Map;
import static org.assertj.core.api.Assertions.assertThat;

class PublicDataServiceTest {

    @Test
    void getSourcesReturnsNonEmptyList() {
        PublicDataService svc = new PublicDataService();
        List<Map<String,String>> sources = svc.getSources();
        assertThat(sources).isNotEmpty();
        assertThat(sources.get(0)).containsKeys("name","url");
    }
}
