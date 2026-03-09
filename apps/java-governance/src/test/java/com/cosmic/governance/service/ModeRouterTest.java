package com.cosmic.governance.service;

import static org.junit.jupiter.api.Assertions.*;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

public class ModeRouterTest {
    private ModeRouter router;

    @BeforeEach
    public void setUp() {
        router = new ModeRouter();
    }

    @Test
    public void returnsTemplateForEachMode() {
        for (ModeRouter.JobMode mode : ModeRouter.JobMode.values()) {
            String tmpl = router.selectTemplate(mode);
            String pattern = mode.name().toLowerCase().replace("_", "-");
            assertTrue(tmpl.contains(pattern), "template " + tmpl + " should contain " + pattern);
        }
    }

    @Test
    public void throwsForUnknownMode() {
        assertThrows(IllegalArgumentException.class, () -> router.selectTemplate(null));
    }
}
