package com.cosmic.governance.api.service;

import com.cosmic.governance.api.dto.CommissioningValidateRequest;
import com.cosmic.governance.api.dto.CommissioningValidateResult;
import com.cosmic.governance.api.model.CommissioningScenario;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Optional;

@Service
public class CommissioningScenarioService {

    private static final List<CommissioningScenario> BUILT_IN = List.of(
            new CommissioningScenario(
                    "antenna_calibration",
                    "Antenna Calibration",
                    "aiv",
                    "Validates antenna calibration parameters including pointing model, noise temperature, and efficiency at target frequencies.",
                    List.of("antennaId", "targetFrequencyMHz", "pointingModelVersion")),
            new CommissioningScenario(
                    "timing_sync",
                    "Timing Synchronisation",
                    "aiv",
                    "Validates that all array elements are synchronised to the timing reference within the accepted drift window.",
                    List.of("referenceElementId", "maxDriftNs", "syncProtocol")),
            new CommissioningScenario(
                    "rfi_baseline",
                    "RFI Baseline Survey",
                    "aiv",
                    "Validates the RFI environment baseline against the expected spectral occupancy thresholds for science operations.",
                    List.of("siteId", "frequencyRangeMHz", "maxOccupancyPercent")));

    public List<CommissioningScenario> getScenarios() {
        return BUILT_IN;
    }

    public Optional<CommissioningScenario> findById(String id) {
        return BUILT_IN.stream().filter(s -> s.id().equals(id)).findFirst();
    }

    public CommissioningValidateResult validate(CommissioningValidateRequest req) {
        Optional<CommissioningScenario> opt = findById(req.scenarioId());
        if (opt.isEmpty()) {
            return new CommissioningValidateResult(
                    req.scenarioId(),
                    null,
                    false,
                    List.of("scenario_not_found: " + req.scenarioId()),
                    Instant.now().toString());
        }
        CommissioningScenario scenario = opt.get();
        Map<String, Object> params = req.parameters() != null ? req.parameters() : Map.of();
        List<String> failures = new ArrayList<>();
        for (String required : scenario.requiredParameters()) {
            if (!params.containsKey(required) || params.get(required) == null) {
                failures.add("missing_required_parameter: " + required);
            }
        }
        return new CommissioningValidateResult(
                scenario.id(),
                scenario.name(),
                failures.isEmpty(),
                failures,
                Instant.now().toString());
    }
}
