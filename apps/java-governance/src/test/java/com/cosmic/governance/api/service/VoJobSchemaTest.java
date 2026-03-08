package com.cosmic.governance.api.service;

import com.cosmic.governance.api.service.SchemaService.ValidationResult;
import com.cosmic.governance.test.AbstractRedisTest;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;

import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Contract tests for the 8 VO workflow JSON schemas.
 * Each type must accept a fully-valid payload and reject a payload missing
 * a required field.
 */
@SpringBootTest
class VoJobSchemaTest extends AbstractRedisTest {

    @Autowired
    private SchemaService schemas;

    // ── vo.cone-search ───────────────────────────────────────────────────────

    @Test
    void coneSearchValidPayloadPasses() {
        var result = schemas.validate("vo.cone-search", Map.of(
                "provider", "CHANDRA",
                "serviceUrl", "https://cxc.cfa.harvard.edu/cgi-bin/browse/cone.pl"
        ));
        assertFound(result);
        assertThat(result.valid()).isTrue();
    }

    @Test
    void coneSearchMissingProviderFails() {
        var result = schemas.validate("vo.cone-search", Map.of(
                "serviceUrl", "https://cxc.cfa.harvard.edu/cgi-bin/browse/cone.pl"
        ));
        assertFound(result);
        assertThat(result.valid()).isFalse();
    }

    @Test
    void coneSearchMissingServiceUrlFails() {
        var result = schemas.validate("vo.cone-search", Map.of("provider", "CHANDRA"));
        assertFound(result);
        assertThat(result.valid()).isFalse();
    }

    // ── vo.adql.query ────────────────────────────────────────────────────────

    @Test
    void adqlQueryValidPayloadPasses() {
        var result = schemas.validate("vo.adql.query", Map.of(
                "provider", "ESAC",
                "tapUrl", "https://gea.esac.esa.int/tap-server/tap/sync",
                "adql", "SELECT TOP 10 * FROM gaiadr3.gaia_source"
        ));
        assertFound(result);
        assertThat(result.valid()).isTrue();
    }

    @Test
    void adqlQueryMissingAdqlFails() {
        var result = schemas.validate("vo.adql.query", Map.of(
                "provider", "ESAC",
                "tapUrl", "https://gea.esac.esa.int/tap-server/tap/sync"
        ));
        assertFound(result);
        assertThat(result.valid()).isFalse();
    }

    // ── vo.obscore.search ────────────────────────────────────────────────────

    @Test
    void obscoreSearchValidPayloadPasses() {
        var result = schemas.validate("vo.obscore.search", Map.of(
                "provider", "CADC",
                "tapUrl", "https://www.cadc-ccda.hia-iha.nrc-cnrc.gc.ca/tap/sync"
        ));
        assertFound(result);
        assertThat(result.valid()).isTrue();
    }

    @Test
    void obscoreSearchMissingTapUrlFails() {
        var result = schemas.validate("vo.obscore.search", Map.of("provider", "CADC"));
        assertFound(result);
        assertThat(result.valid()).isFalse();
    }

    // ── vo.votable.fetch ──────────────────────────────────────────────────────

    @Test
    void votableFetchValidPayloadPasses() {
        var result = schemas.validate("vo.votable.fetch", Map.of(
                "provider", "VizieR",
                "votableUrl", "https://vizier.cds.unistra.fr/viz-bin/votable?-source=I/355/gaiadr3"
        ));
        assertFound(result);
        assertThat(result.valid()).isTrue();
    }

    @Test
    void votableFetchMissingVotableUrlFails() {
        var result = schemas.validate("vo.votable.fetch", Map.of("provider", "VizieR"));
        assertFound(result);
        assertThat(result.valid()).isFalse();
    }

    // ── vo.datalink.resolve ───────────────────────────────────────────────────

    @Test
    void datalinkResolveValidPayloadPasses() {
        var result = schemas.validate("vo.datalink.resolve", Map.of(
                "provider", "MAST",
                "datalinkUrl", "https://mast.stsci.edu/api/v0.1/Download/file/bundle.sh?obsid=2003505090",
                "datasetIdentifier", "2003505090"
        ));
        assertFound(result);
        assertThat(result.valid()).isTrue();
    }

    @Test
    void datalinkResolveMissingDatasetIdentifierFails() {
        var result = schemas.validate("vo.datalink.resolve", Map.of(
                "provider", "MAST",
                "datalinkUrl", "https://mast.stsci.edu/api"
        ));
        assertFound(result);
        assertThat(result.valid()).isFalse();
    }

    // ── vo.product.fetch ──────────────────────────────────────────────────────

    @Test
    void productFetchValidPayloadPasses() {
        var result = schemas.validate("vo.product.fetch", Map.of(
                "provider", "MAST",
                "productUrl", "https://mast.stsci.edu/api/v0.1/Download/file?uri=mast:HST/some.fits"
        ));
        assertFound(result);
        assertThat(result.valid()).isTrue();
    }

    @Test
    void productFetchMissingProductUrlFails() {
        var result = schemas.validate("vo.product.fetch", Map.of("provider", "MAST"));
        assertFound(result);
        assertThat(result.valid()).isFalse();
    }

    // ── vo.soda.cutout ────────────────────────────────────────────────────────

    @Test
    void sodaCutoutValidPayloadPasses() {
        var result = schemas.validate("vo.soda.cutout", Map.of(
                "provider", "CADC",
                "sodaUrl", "https://www.cadc-ccda.hia-iha.nrc-cnrc.gc.ca/caom2ops/sync",
                "datasetIdentifier", "cadc:HST/ACS_WFC_F435W_drizzle.fits"
        ));
        assertFound(result);
        assertThat(result.valid()).isTrue();
    }

    @Test
    void sodaCutoutMissingSodaUrlFails() {
        var result = schemas.validate("vo.soda.cutout", Map.of(
                "provider", "CADC",
                "datasetIdentifier", "cadc:HST/some.fits"
        ));
        assertFound(result);
        assertThat(result.valid()).isFalse();
    }

    // ── vo.preview.fetch ──────────────────────────────────────────────────────

    @Test
    void previewFetchValidPayloadPasses() {
        var result = schemas.validate("vo.preview.fetch", Map.of(
                "provider", "ESO",
                "previewUrl", "https://archive.eso.org/hdr?DpId=ADP.2024.01.01T00:00:00.000"
        ));
        assertFound(result);
        assertThat(result.valid()).isTrue();
    }

    @Test
    void previewFetchMissingPreviewUrlFails() {
        var result = schemas.validate("vo.preview.fetch", Map.of("provider", "ESO"));
        assertFound(result);
        assertThat(result.valid()).isFalse();
    }

    // ── helpers ───────────────────────────────────────────────────────────────

    private void assertFound(ValidationResult r) {
        assertThat(r.schemaFound())
                .as("Schema should be loaded in SchemaService builtins")
                .isTrue();
    }
}
