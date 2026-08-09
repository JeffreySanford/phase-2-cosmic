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
        self.previous_source_mode = os.environ.pop("LAKEHOUSE_SOURCE_MODE", None)
        self.previous_ci = os.environ.pop("CI", None)

    def tearDown(self) -> None:
        if self.previous_profile is not None:
            os.environ["LAKEHOUSE_SCALE_PROFILE"] = self.previous_profile
        else:
            os.environ.pop("LAKEHOUSE_SCALE_PROFILE", None)

        if self.previous_allow_large is not None:
            os.environ["LAKEHOUSE_ALLOW_LARGE_SAMPLE"] = self.previous_allow_large
        else:
            os.environ.pop("LAKEHOUSE_ALLOW_LARGE_SAMPLE", None)

        if self.previous_source_mode is not None:
            os.environ["LAKEHOUSE_SOURCE_MODE"] = self.previous_source_mode
        else:
            os.environ.pop("LAKEHOUSE_SOURCE_MODE", None)

        if self.previous_ci is not None:
            os.environ["CI"] = self.previous_ci
        else:
            os.environ.pop("CI", None)

    def fixture_sources(
        self, bundle_name: str = "offline-fixture"
    ) -> tuple[dict, list[dict]]:
        """Resolve a bundle in fixture mode so unit tests never hit the network."""
        _, bundle = mvp.resolve_source_bundle(bundle_name)
        return bundle, mvp.resolve_source_data(bundle["activeProfiles"], "fixture")

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
        bundle, sources = self.fixture_sources()
        profile = bundle["activeProfiles"][0]
        source_rows = mvp.load_source_rows(profile)
        bronze_rows = mvp.build_bronze_rows("offline-fixture", sources)

        self.assertEqual(len(bronze_rows), 5)
        # Attribution comes from the producing profile, not a hardcoded provider.
        self.assertEqual(bronze_rows[0]["source_provider"], "PR41 fixture")
        self.assertEqual(
            bronze_rows[0]["source_profile"], "deterministic-obscore-fixture"
        )
        self.assertEqual(bronze_rows[0]["source_bundle"], "offline-fixture")
        self.assertEqual(bronze_rows[0]["adapter_contract"], "vo-tap-obscore.v1")
        self.assertIn("obs_publisher_did", bronze_rows[0]["source_payload_json"])
        self.assertEqual(
            bronze_rows[0]["event_hash"],
            mvp.stable_hash(source_rows[0]),
        )

    def test_source_bundle_selection_changes_rows_and_providers(self) -> None:
        """Bundle selection must change real data, not only a manifest label."""
        offline, offline_sources = self.fixture_sources("offline-fixture")
        expanded, expanded_sources = self.fixture_sources("expanded-development")

        offline_rows = mvp.build_bronze_rows("offline-fixture", offline_sources)
        expanded_rows = mvp.build_bronze_rows(
            "expanded-development", expanded_sources
        )

        self.assertEqual(offline["providers"], ["PR41 fixture"])
        self.assertEqual(expanded["providers"], ["ESO", "NRAO", "PR41 fixture"])
        self.assertGreater(len(expanded_rows), len(offline_rows))
        self.assertEqual(
            {row["source_provider"] for row in expanded_rows},
            {"PR41 fixture", "ESO", "NRAO"},
        )

    def test_adapter_field_map_canonicalizes_non_obscore_vocabulary(self) -> None:
        """NRAO column names differ from ObsCore and must still canonicalize."""
        bundle, sources = self.fixture_sources("expanded-development")
        profiles_by_ref = {
            profile["ref"]: profile for profile in bundle["activeProfiles"]
        }
        nrao = profiles_by_ref["nrao-vlass-development"]

        self.assertEqual(nrao["adapter"]["fieldMap"]["sourceIdentifier"], "product_id")
        self.assertEqual(nrao["adapter"]["fieldMap"]["ra"], "ra_deg")

        bronze_rows = mvp.build_bronze_rows("expanded-development", sources)
        silver_rows, _ = mvp.build_silver(bronze_rows, profiles_by_ref)
        nrao_rows = [
            row for row in silver_rows if row["source_provider"] == "NRAO"
        ]

        self.assertTrue(nrao_rows)
        self.assertTrue(all(row["collection"].startswith("VLASS") for row in nrao_rows))
        self.assertTrue(
            all(0 <= row["ra_degrees"] <= 360 for row in nrao_rows)
        )

    def test_active_profile_without_adapter_is_rejected(self) -> None:
        """An active profile that cannot produce rows must not be silently accepted."""
        registry = mvp.load_source_registry()
        self.assertEqual(
            registry["profiles"]["nrao-tap-live"]["activationState"], "planned"
        )
        self.assertNotIn("adapter", registry["profiles"]["nrao-tap-live"])

    def test_source_bundle_resolution_uses_registry_default(self) -> None:
        name, bundle = mvp.resolve_source_bundle(None)

        # The default bundle pairs a live-capable ESO profile with the
        # deterministic fixture so quarantine coverage does not depend on what a
        # live archive happens to return.
        self.assertEqual(name, "live-default")
        self.assertIn("deterministic-obscore-fixture", bundle["activeProfileRefs"])
        self.assertIn("eso-obscore-core-proof", bundle["activeProfileRefs"])

    def test_source_bundle_selection_excludes_planned_profiles(self) -> None:
        name, bundle = mvp.resolve_source_bundle("expanded-development")

        self.assertEqual(name, "expanded-development")
        # nrao-tap-live requires network access and stays planned/inactive.
        self.assertIn("nrao-tap-live", bundle["profileRefs"])
        self.assertNotIn("nrao-tap-live", bundle["activeProfileRefs"])
        # The offline VLASS fixture profile is active so the adapter contract is
        # exercised against a radio-astronomy vocabulary.
        self.assertIn("nrao-vlass-development", bundle["activeProfileRefs"])

    def test_source_mode_defaults_to_auto(self) -> None:
        self.assertEqual(mvp.resolve_source_mode(None), "auto")

        os.environ["LAKEHOUSE_SOURCE_MODE"] = "fixture"
        self.assertEqual(mvp.resolve_source_mode(None), "fixture")
        # An explicit argument still wins over the environment.
        self.assertEqual(mvp.resolve_source_mode("live"), "live")

    def test_unknown_source_mode_is_rejected(self) -> None:
        with self.assertRaisesRegex(ValueError, "Unknown Lakehouse source mode"):
            mvp.resolve_source_mode("sometimes")

    def test_ci_auto_mode_falls_back_to_fixture(self) -> None:
        """CI must stay hermetic even though live is the normal local default."""
        os.environ["CI"] = "true"
        _, bundle = mvp.resolve_source_bundle("live-default")
        resolved = mvp.resolve_source_data(bundle["activeProfiles"], "auto")

        by_ref = {entry["profile"]["ref"]: entry for entry in resolved}
        eso = by_ref["eso-obscore-core-proof"]

        self.assertEqual(eso["mode"], "fixture")
        self.assertIn("hermetic", eso["reason"])
        self.assertFalse(any(entry["mode"] == "live" for entry in resolved))

    def test_fixture_mode_never_resolves_live(self) -> None:
        _, bundle = mvp.resolve_source_bundle("live-default")
        resolved = mvp.resolve_source_data(bundle["activeProfiles"], "fixture")

        self.assertTrue(all(entry["mode"] == "fixture" for entry in resolved))
        self.assertTrue(all(entry["rows"] for entry in resolved))

    def test_empty_layer_writes_typed_table_instead_of_failing(self) -> None:
        """A live source can return clean data, so an empty layer is a real outcome."""
        output = mvp.SAFE_OUTPUT_ROOT / "pr41-empty-test"
        if output.exists():
            shutil.rmtree(output)

        try:
            entry = mvp.write_table(
                output / "silver" / "quarantine", [], "silver.quarantine"
            )
            self.assertEqual(entry["rows"], 0)
            self.assertTrue((output / "silver" / "quarantine").exists())
        finally:
            shutil.rmtree(output, ignore_errors=True)

    def test_unknown_source_bundle_is_rejected(self) -> None:
        with self.assertRaisesRegex(ValueError, "Unknown Lakehouse source bundle"):
            mvp.resolve_source_bundle("not-a-bundle")

    def test_silver_promotes_canonical_rows_and_quarantines_failures(self) -> None:
        _, sources = self.fixture_sources()
        bronze_rows = mvp.build_bronze_rows("offline-fixture", sources)
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
        _, sources = self.fixture_sources()
        bronze_rows = mvp.build_bronze_rows("offline-fixture", sources)
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
            _, sources = self.fixture_sources()
            bronze_rows = mvp.build_bronze_rows("offline-fixture", sources)
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
            self.assertEqual(manifest["sourceBundle"]["providers"], ["PR41 fixture"])
            self.assertEqual(
                manifest["sourceBundle"]["adapterContracts"], ["vo-tap-obscore.v1"]
            )
            # Guard state reflects whether large generation was authorized, not
            # whether the selected profile happens to require approval.
            self.assertFalse(manifest["largeProfilesAllowed"])
        finally:
            shutil.rmtree(output, ignore_errors=True)

    def test_manifest_records_large_guard_state_not_profile_requirement(self) -> None:
        output = mvp.SAFE_OUTPUT_ROOT / "pr41-guard-test"
        if output.exists():
            shutil.rmtree(output)

        try:
            output.mkdir(parents=True, exist_ok=True)
            bundle, sources = self.fixture_sources()
            bronze_rows = mvp.build_bronze_rows("offline-fixture", sources)
            silver_rows, quarantine_rows = mvp.build_silver(
                bronze_rows,
                {profile["ref"]: profile for profile in bundle["activeProfiles"]},
            )
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

            # A guarded profile run WITHOUT approval would never reach the writer,
            # so an approved large run must report the guard as granted.
            _, large_profile = mvp.resolve_profile("10gb", allow_large=True)
            mvp.write_manifest(
                output,
                "10gb",
                large_profile,
                "offline-fixture",
                bundle,
                table_entries,
                large_profiles_allowed=True,
            )
            manifest = mvp.json.loads((output / "manifest.json").read_text())
            self.assertTrue(manifest["largeProfilesAllowed"])

            # The tiny profile does not require approval, and none was granted.
            _, tiny_profile = mvp.resolve_profile("tiny", allow_large=False)
            mvp.write_manifest(
                output,
                "tiny",
                tiny_profile,
                "offline-fixture",
                bundle,
                table_entries,
                large_profiles_allowed=False,
            )
            manifest = mvp.json.loads((output / "manifest.json").read_text())
            self.assertFalse(manifest["largeProfilesAllowed"])
        finally:
            shutil.rmtree(output, ignore_errors=True)


if __name__ == "__main__":
    unittest.main(verbosity=2)
