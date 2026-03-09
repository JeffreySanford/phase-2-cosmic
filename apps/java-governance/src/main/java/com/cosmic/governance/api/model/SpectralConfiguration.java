package com.cosmic.governance.api.model;

public record SpectralConfiguration(
        String band,
        Double centerFrequencyHz,
        Double channelWidth,
        Integer numChannels
) {}
