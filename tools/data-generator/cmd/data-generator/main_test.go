package main

import (
	"testing"
)

// ── parseSegmentWeights ──────────────────────────────────────────────────────

func TestParseSegmentWeights_ValidThreeSegments(t *testing.T) {
	segs, err := parseSegmentWeights("main:48,lbl:24,sba:21")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(segs) != 3 {
		t.Fatalf("expected 3 segments, got %d", len(segs))
	}
	cases := []struct {
		name   string
		weight int
	}{
		{"main", 48}, {"lbl", 24}, {"sba", 21},
	}
	for i, c := range cases {
		if segs[i].name != c.name || segs[i].weight != c.weight {
			t.Errorf("segment %d: want %s:%d, got %s:%d",
				i, c.name, c.weight, segs[i].name, segs[i].weight)
		}
	}
}

func TestParseSegmentWeights_SingleSegment(t *testing.T) {
	segs, err := parseSegmentWeights("only:100")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(segs) != 1 || segs[0].name != "only" || segs[0].weight != 100 {
		t.Errorf("unexpected result: %+v", segs)
	}
}

func TestParseSegmentWeights_SpacesTrimmed(t *testing.T) {
	segs, err := parseSegmentWeights(" main : 48 , lbl : 24 ")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(segs) != 2 {
		t.Fatalf("expected 2 segments, got %d", len(segs))
	}
	if segs[0].name != "main" || segs[1].name != "lbl" {
		t.Errorf("names not trimmed: %+v", segs)
	}
}

func TestParseSegmentWeights_EmptyString(t *testing.T) {
	if _, err := parseSegmentWeights(""); err == nil {
		t.Error("expected error for empty input, got nil")
	}
}

func TestParseSegmentWeights_MissingColon(t *testing.T) {
	if _, err := parseSegmentWeights("main48"); err == nil {
		t.Error("expected error for missing colon, got nil")
	}
}

func TestParseSegmentWeights_ZeroWeight(t *testing.T) {
	if _, err := parseSegmentWeights("main:0"); err == nil {
		t.Error("expected error for zero weight, got nil")
	}
}

func TestParseSegmentWeights_NegativeWeight(t *testing.T) {
	if _, err := parseSegmentWeights("main:-5"); err == nil {
		t.Error("expected error for negative weight, got nil")
	}
}

func TestParseSegmentWeights_EmptyName(t *testing.T) {
	if _, err := parseSegmentWeights(":50"); err == nil {
		t.Error("expected error for empty segment name, got nil")
	}
}

func TestParseSegmentWeights_NonIntegerWeight(t *testing.T) {
	if _, err := parseSegmentWeights("main:abc"); err == nil {
		t.Error("expected error for non-integer weight, got nil")
	}
}

// ── allocateSegments ─────────────────────────────────────────────────────────

func TestAllocateSegments_ZeroRecords(t *testing.T) {
	result := allocateSegments(0, []segmentWeight{{name: "a", weight: 1}})
	if len(result) != 0 {
		t.Errorf("expected empty slice, got %v", result)
	}
}

func TestAllocateSegments_EmptySegments(t *testing.T) {
	result := allocateSegments(10, []segmentWeight{})
	if len(result) != 0 {
		t.Errorf("expected empty slice for no segments, got %v", result)
	}
}

func TestAllocateSegments_SingleSegmentAllRecords(t *testing.T) {
	result := allocateSegments(10, []segmentWeight{{name: "only", weight: 1}})
	if len(result) != 10 {
		t.Fatalf("expected 10 records, got %d", len(result))
	}
	for _, s := range result {
		if s != "only" {
			t.Errorf("expected 'only', got %q", s)
		}
	}
}

func TestAllocateSegments_TotalAlwaysMatchesRequest(t *testing.T) {
	segs := []segmentWeight{
		{name: "main", weight: 48},
		{name: "lbl", weight: 24},
		{name: "sba", weight: 21},
	}
	for _, n := range []int{1, 7, 93, 100, 1000} {
		result := allocateSegments(n, segs)
		if len(result) != n {
			t.Errorf("allocateSegments(%d): got %d records", n, len(result))
		}
	}
}

func TestAllocateSegments_EqualWeightSplitsEvenly(t *testing.T) {
	segs := []segmentWeight{
		{name: "a", weight: 1},
		{name: "b", weight: 1},
	}
	result := allocateSegments(100, segs)
	counts := map[string]int{}
	for _, s := range result {
		counts[s]++
	}
	if counts["a"] != 50 || counts["b"] != 50 {
		t.Errorf("expected 50/50 split, got a=%d b=%d", counts["a"], counts["b"])
	}
}

func TestAllocateSegments_ProportionalWeights(t *testing.T) {
	// 1:3 ratio → 25 % and 75 % of 100 records
	segs := []segmentWeight{
		{name: "small", weight: 1},
		{name: "large", weight: 3},
	}
	result := allocateSegments(100, segs)
	counts := map[string]int{}
	for _, s := range result {
		counts[s]++
	}
	if counts["small"] != 25 || counts["large"] != 75 {
		t.Errorf("expected 25/75 split, got small=%d large=%d",
			counts["small"], counts["large"])
	}
}

func TestAllocateSegments_SingleRecord(t *testing.T) {
	segs := []segmentWeight{
		{name: "main", weight: 48},
		{name: "lbl", weight: 24},
	}
	result := allocateSegments(1, segs)
	if len(result) != 1 {
		t.Fatalf("expected 1 record, got %d", len(result))
	}
}
