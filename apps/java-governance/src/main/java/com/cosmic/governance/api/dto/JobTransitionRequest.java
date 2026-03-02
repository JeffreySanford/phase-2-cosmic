package com.cosmic.governance.api.dto;

import com.cosmic.governance.api.model.JobState;
import jakarta.validation.constraints.NotNull;

public record JobTransitionRequest(
        @NotNull JobState state,
        /**
         * Optional optimistic lock token: transition will only succeed if the
         * stored record version matches this value.  If omitted, no version
         * check is performed.
         */
        Long expectedVersion
) {}
