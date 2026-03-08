package com.cosmic.governance.api.controller;

import com.cosmic.governance.api.dto.CommissioningValidateRequest;
import com.cosmic.governance.api.dto.CommissioningValidateResult;
import com.cosmic.governance.api.model.CommissioningScenario;
import com.cosmic.governance.api.service.CommissioningScenarioService;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@RestController
@RequestMapping("/api/v1/commissioning")
public class CommissioningController {

    private final CommissioningScenarioService commissioningService;

    public CommissioningController(CommissioningScenarioService commissioningService) {
        this.commissioningService = commissioningService;
    }

    @GetMapping("/scenarios")
    public ResponseEntity<List<CommissioningScenario>> getScenarios() {
        return ResponseEntity.ok(commissioningService.getScenarios());
    }

    @PostMapping("/validate")
    public ResponseEntity<CommissioningValidateResult> validate(@RequestBody CommissioningValidateRequest request) {
        CommissioningValidateResult result = commissioningService.validate(request);
        if (!result.pass() && result.failures().stream()
                .anyMatch(f -> f.startsWith("scenario_not_found:"))) {
            return ResponseEntity.status(404).body(result);
        }
        return ResponseEntity.ok(result);
    }
}
