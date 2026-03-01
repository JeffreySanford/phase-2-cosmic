package com.cosmic.governance.api.dto;

import com.cosmic.governance.api.model.JobState;
import jakarta.validation.constraints.NotNull;

public record JobTransitionRequest(@NotNull JobState state) {}
