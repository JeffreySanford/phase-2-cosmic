package com.cosmic.governance.api;

import com.cosmic.governance.api.model.ReplicationPolicy;
import com.cosmic.governance.api.model.RestoreDrillResult;
import com.cosmic.governance.api.service.ArchiveDrService;
import com.cosmic.governance.test.AbstractRedisTest;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;

import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;

@SpringBootTest
public class ArchiveDrRestoreDrillTest extends AbstractRedisTest {

    @Autowired
    private ArchiveDrService archiveDrService;

    @Test
    void createPolicyReturnsPolicyWithId() {
        ReplicationPolicy policy = archiveDrService.createPolicy("science-data", 365, "us-southwest-1", 3);
        assertThat(policy.id()).isNotBlank();
        assertThat(policy.name()).isEqualTo("science-data");
        assertThat(policy.retentionDays()).isEqualTo(365);
        assertThat(policy.targetRegion()).isEqualTo("us-southwest-1");
        assertThat(policy.replicaCount()).isEqualTo(3);
        assertThat(policy.createdAt()).isNotBlank();
    }

    @Test
    void getPolicyByIdReturnsCreatedPolicy() {
        ReplicationPolicy created = archiveDrService.createPolicy("provenance-data", 730, "us-east-1", 2);
        Optional<ReplicationPolicy> found = archiveDrService.getPolicy(created.id());
        assertThat(found).isPresent();
        assertThat(found.get().name()).isEqualTo("provenance-data");
        assertThat(found.get().retentionDays()).isEqualTo(730);
    }

    @Test
    void listPoliciesIncludesCreatedPolicy() {
        ReplicationPolicy created = archiveDrService.createPolicy("catalog-index", 180, "eu-central-1", 2);
        List<ReplicationPolicy> policies = archiveDrService.listPolicies();
        assertThat(policies).anyMatch(p -> p.id().equals(created.id()));
    }

    @Test
    void drillRestoreWithValidPolicyReturnsSuccess() {
        ReplicationPolicy policy = archiveDrService.createPolicy("raw-dataset", 90, "us-southwest-1", 3);
        RestoreDrillResult result = archiveDrService.drillRestore("dataset-12345", policy.id());
        assertThat(result.success()).isTrue();
        assertThat(result.drillId()).isNotBlank();
        assertThat(result.datasetId()).isEqualTo("dataset-12345");
        assertThat(result.policyId()).isEqualTo(policy.id());
        assertThat(result.notes()).contains("restore_drill_passed");
    }

    @Test
    void drillRestoreWithUnknownPolicyReturnsFailed() {
        RestoreDrillResult result = archiveDrService.drillRestore("dataset-ghost", "nonexistent-policy-id");
        assertThat(result.success()).isFalse();
        assertThat(result.notes()).contains("policy_not_found");
    }
}
