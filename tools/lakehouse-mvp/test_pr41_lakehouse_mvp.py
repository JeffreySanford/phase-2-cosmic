"""Unit tests for the PR41 Lakehouse MVP reference runner."""

from __future__ import annotations

import os
import shutil
import unittest
from pathlib import Path

import pr41_lakehouse_mvp as mvp


class LakehouseMvpRunnerTests(unittest.TestCase):
    def setUp(self) -> None:
        self.previous_profile = os.environ.pop("LAKEHOUSE_SCALE_PROFILE", None)
        self.previous_allow_large = os.environ.pop(
            "LAKEHOUSE_ALLOW_LARGE_SAMPLE", None
        )

    def tearDown(self) -> None:
        if self.previous_profile is not None:
            os.environ["LAKEHOUSE_SCALE_PROFILE"] = self.previous_profile
        else:
            os.environ.pop("LAKEHOUSE_SCALE_PROFILE", None)

        if self.previous_allow_large is not None:
            os.environ["LAKEHOUSE_ALLOW_LARGE_SAMPLE"] = self.previous_allow_large
        else:
            os.environ.pop("LAKEHOUSE_ALLOW_LARGE_SAMPLE", None)

    def test_default_profile_is_tiny(self) -> None:
        name, profile = mvp.resolve_profile(None, allow_large=False)

        self.assertEqual(name, "tiny")
        self.assertFalse(profile["requiresExplicitApproval"])

    def test_environment_profile_requires_large_guard(self) -> None:
        os.environ["LAKEHOUSE_SCALE_PROFILE"] = "10gb"

        with self.assertRaisesRegex(ValueError, "Refusing to run"):
            mvp.resolve_profile(None, allow_large=False)

        name, profile = mvp.resolve_profile(None, allow_large=True)
        self.assertEqual(name, "10gb")
        self.assertTrue(profile["requiresExplicitApproval"])

    def test_unknown_profile_is_rejected(self) -> None:
        with self.assertRaisesRegex(ValueError, "Unknown Lakehouse scale profile"):
            mvp.resolve_profile("unknown", allow_large=False)

    def test_output_must_stay_under_tmp_lakehouse(self) -> None:
        with self.assertRaisesRegex(ValueError, "Refusing to write outside"):
            mvp.resolve_output(str(mvp.REPO_ROOT / "dist" / "bad-lakehouse"))

    def test_bronze_rows_preserve_source_fidelity(self) -> None:
        bronze_rows = mvp.build_bronze_rows("offline-fixture")

        self.assertEqual(len(bronze_rows), 5)
        self.assertEqual(bronze_rows[0]["source_provider"], "ESO")
        self.assertEqual(bronze_rows[0]["source_profile"], "offline-fixture")
        self.assertIn("obs_publisher_did", bronze_rows[0]["source_payload_json"])
        self.assertEqual(
            bronze_rows[0]["event_hash"],
            mvp.stable_hash(mvp.SOURCE_ROWS[0]),
        )

    def test_source_bundle_resolution_uses_registry_default(self) -> None:
        name, bundle = mvp.resolve_source_bundle(None)

        self.assertEqual(name, "offline-fixture")
        self.assertEqual(bundle["profileRefs"], ["deterministic-obscore-fixture"])
        self.assertEqual(bundle["activeProfileRefs"], ["deterministic-obscore-fixture"])

    def test_source_bundle_selection_excludes_planned_profiles(self) -> None:
        name, bundle = mvp.resolve_source_bundle("expanded-development")

        self.assertEqual(name, "expanded-development")
        self.assertIn("nrao-vlass-development", bundle["profileRefs"])
        self.assertNotIn("nrao-vlass-development", bundle["activeProfileRefs"])

    def test_unknown_source_bundle_is_rejected(self) -> None:
        with self.assertRaisesRegex(ValueError, "Unknown Lakehouse source bundle"):
            mvp.resolve_source_bundle("not-a-bundle")

    def test_silver_promotes_canonical_rows_and_quarantines_failures(self) -> None:
        bronze_rows = mvp.build_bronze_rows()
        silver_rows, quarantine_rows = mvp.build_silver(bronze_rows)

        self.assertEqual(len(silver_rows), 3)
        self.assertEqual(len(quarantine_rows), 2)
        self.assertTrue(
            all(row["bronze_event_id"].startswith("bronze-") for row in silver_rows)
        )

        reason_sets = [row["reason_codes"] for row in quarantine_rows]
        self.assertTrue(
            any("duplicate_source_identifier" in reasons for reasons in reason_sets)
        )
        self.assertTrue(
            any("missing_source_identifier" in reasons for reasons in reason_sets)
        )
        self.assertTrue(any("invalid_dec" in reasons for reasons in reason_sets))

    def test_gold_summary_retains_bronze_lineage(self) -> None:
        bronze_rows = mvp.build_bronze_rows()
        silver_rows, quarantine_rows = mvp.build_silver(bronze_rows)
        gold_rows = mvp.build_gold(silver_rows, quarantine_rows)

        self.assertEqual(len(gold_rows), 3)
        self.assertTrue(
            all(
                row["lineage_bronze_event_ids"].startswith("bronze-")
                for row in gold_rows
            )
        )
        self.assertTrue(
            all(row["quarantined_records"] == len(quarantine_rows) for row in gold_rows)
        )

    def test_writer_manifest_contains_diagnostic_contract(self) -> None:
        output = mvp.SAFE_OUTPUT_ROOT / "pr41-unit-test"
        if output.exists():
            shutil.rmtree(output)

        try:
            output.mkdir(parents=True, exist_ok=True)
            bronze_rows = mvp.build_bronze_rows()
            silver_rows, quarantine_rows = mvp.build_silver(bronze_rows)
            gold_rows = mvp.build_gold(silver_rows, quarantine_rows)
            table_entries = {
                "bronze.observation_events": mvp.write_table(
                    output / "bronze" / "observation_events",
                    bronze_rows,
                    "bronze.observation_events",
                ),
                "silver.observations": mvp.write_table(
                    output / "silver" / "observations",
                    silver_rows,
                    "silver.observations",
                ),
                "silver.quarantine": mvp.write_table(
                    output / "silver" / "quarantine",
                    quarantine_rows,
                    "silver.quarantine",
                ),
                "gold.observation_summary": mvp.write_table(
                    output / "gold" / "observation_summary",
                    gold_rows,
                    "gold.observation_summary",
                ),
            }
            _, profile = mvp.resolve_profile("tiny", allow_large=False)
            source_bundle_name, source_bundle = mvp.resolve_source_bundle(
                "offline-fixture"
            )

            mvp.write_manifest(
                output,
                "tiny",
                profile,
                source_bundle_name,
                source_bundle,
                table_entries,
            )
            manifest = mvp.json.loads((output / "manifest.json").read_text())

            self.assertEqual(manifest["diagnosticState"], "local_mvp_verified")
            self.assertEqual(manifest["evidenceSource"], "pr41-local-manifest")
            self.assertEqual(manifest["scaleProfile"]["name"], "tiny")
            self.assertEqual(manifest["sourceBundle"]["name"], "offline-fixture")
            self.assertEqual(
                manifest["sourceBundle"]["activeProfileRefs"],
                ["deterministic-obscore-fixture"],
            )
            self.assertGreater(manifest["bytesByLayer"]["bronze"], 0)
            self.assertEqual(
                manifest["tables"]["bronze.observation_events"]["rows"], 5
            )
        finally:
            shutil.rmtree(output, ignore_errors=True)


if __name__ == "__main__":
    unittest.main(verbosity=2)
