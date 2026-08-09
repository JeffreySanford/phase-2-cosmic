# mypy: ignore-errors
"""PR41 Lakehouse MVP reference runner.

This creates a small local medallion lakehouse artifact set:

source extract -> Bronze Parquet + Delta log
Bronze -> Silver canonical observations + Silver quarantine
Silver -> Gold observation summary

The runner is intentionally local-first and dependency-light. It uses pyarrow
for Parquet files and writes Delta transaction metadata beside each table so
the MVP has durable, inspectable Bronze/Silver/Gold table artifacts without
adding Spark to the repository.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import shutil
import urllib.error
import urllib.parse
import urllib.request
from collections import Counter
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

import pyarrow as pa
import pyarrow.parquet as pq


REPO_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_OUTPUT = REPO_ROOT / "tmp" / "lakehouse" / "pr41-delta"
SAFE_OUTPUT_ROOT = REPO_ROOT / "tmp" / "lakehouse"
SCALE_PROFILES_PATH = REPO_ROOT / "tools" / "lakehouse-mvp" / "scale-profiles.json"
SOURCE_REGISTRY_PATH = (
    REPO_ROOT / "tools" / "lakehouse-mvp" / "source-registry.example.json"
)


CANONICAL_FIELDS = (
    "sourceIdentifier",
    "collection",
    "dataProductType",
    "ra",
    "dec",
    "accessUri",
)

# Explicit column types so a legitimately empty medallion table still writes a
# valid, typed Parquet file instead of failing the run. A live source can return
# clean data and produce no quarantine rows.
_STR = "string"
_F64 = "double"
_I64 = "int64"

TABLE_SCHEMAS: dict[str, list[tuple[str, str]]] = {
    "bronze.observation_events": [
        ("bronze_event_id", _STR),
        ("source_provider", _STR),
        ("source_profile", _STR),
        ("source_bundle", _STR),
        ("source_mode", _STR),
        ("adapter_contract", _STR),
        ("schema_version", _STR),
        ("source_identifier", _STR),
        ("event_hash", _STR),
        ("ingest_run_id", _STR),
        ("ingested_at", _STR),
        ("source_payload_json", _STR),
    ],
    "silver.observations": [
        ("observation_id", _STR),
        ("source_identifier", _STR),
        ("source_provider", _STR),
        ("source_profile", _STR),
        ("collection", _STR),
        ("data_product_type", _STR),
        ("ra_degrees", _F64),
        ("dec_degrees", _F64),
        ("object_uri", _STR),
        ("bronze_event_id", _STR),
        ("canonicalized_at", _STR),
    ],
    "silver.quarantine": [
        ("quarantine_id", _STR),
        ("bronze_event_id", _STR),
        ("source_provider", _STR),
        ("source_identifier", _STR),
        ("reason_codes", _STR),
        ("source_payload_json", _STR),
        ("quarantined_at", _STR),
    ],
    "gold.observation_summary": [
        ("summary_id", _STR),
        ("collection", _STR),
        ("accepted_observations", _I64),
        ("quarantined_records", _I64),
        ("source_silver_table", _STR),
        ("lineage_bronze_event_ids", _STR),
        ("refreshed_at", _STR),
    ],
}

SOURCE_MODES = ("auto", "live", "fixture")
LIVE_TIMEOUT_SECONDS = 20
LIVE_ROW_LIMIT = 5


def now_iso() -> str:
    return datetime.now(UTC).isoformat(timespec="seconds").replace("+00:00", "Z")


def stable_hash(payload: Any) -> str:
    encoded = json.dumps(payload, sort_keys=True, separators=(",", ":")).encode(
        "utf-8"
    )
    return hashlib.sha256(encoded).hexdigest()


def resolve_output(path_value: str | None) -> Path:
    output = Path(path_value).resolve() if path_value else DEFAULT_OUTPUT.resolve()
    safe_root = SAFE_OUTPUT_ROOT.resolve()
    if safe_root not in output.parents and output != safe_root:
        raise ValueError(f"Refusing to write outside {safe_root}: {output}")
    return output


def load_scale_profiles() -> dict[str, Any]:
    return json.loads(SCALE_PROFILES_PATH.read_text(encoding="utf-8"))


def load_source_registry() -> dict[str, Any]:
    return json.loads(SOURCE_REGISTRY_PATH.read_text(encoding="utf-8"))


def resolve_source_bundle(bundle_value: str | None) -> tuple[str, dict[str, Any]]:
    registry = load_source_registry()
    default_bundle = registry.get("defaultBundle", "offline-fixture")
    bundle_name = (
        bundle_value or os.environ.get("LAKEHOUSE_SOURCE_BUNDLE") or default_bundle
    )
    bundles = registry.get("bundles", {})

    if bundle_name not in bundles:
        raise ValueError(
            f"Unknown Lakehouse source bundle {bundle_name!r}; expected one of {', '.join(sorted(bundles))}"
        )

    profile_refs = bundles[bundle_name].get("profileRefs", [])
    profiles = registry.get("profiles", {})
    missing_profiles = [ref for ref in profile_refs if ref not in profiles]
    if missing_profiles:
        raise ValueError(
            f"Lakehouse source bundle {bundle_name!r} references unknown profile(s): {', '.join(missing_profiles)}"
        )

    bundle = dict(bundles[bundle_name])
    active_states = set(registry.get("selectionPolicy", {}).get("activeStates", []))
    active_profile_refs = [
        ref
        for ref in bundle.get("profileRefs", [])
        if profiles[ref].get("activationState") in active_states
    ]
    if not active_profile_refs:
        raise ValueError(
            f"Lakehouse source bundle {bundle_name!r} has no active fixture/included profile"
        )

    # An active profile must be able to produce rows, otherwise the bundle would
    # silently contribute nothing while still being reported as active.
    active_profiles: list[dict[str, Any]] = []
    for ref in active_profile_refs:
        profile = dict(profiles[ref])
        adapter = profile.get("adapter")
        if not adapter:
            raise ValueError(
                f"Active Lakehouse source profile {ref!r} has no adapter; "
                "only inactive profiles may omit an adapter"
            )
        missing_fields = [
            field
            for field in CANONICAL_FIELDS
            if field not in adapter.get("fieldMap", {})
        ]
        if missing_fields:
            raise ValueError(
                f"Lakehouse source profile {ref!r} adapter fieldMap is missing "
                f"canonical field(s): {', '.join(missing_fields)}"
            )
        profile["ref"] = ref
        active_profiles.append(profile)

    bundle["activeProfileRefs"] = active_profile_refs
    bundle["activeProfiles"] = active_profiles
    bundle["providers"] = sorted(
        {profile.get("provider", "unknown") for profile in active_profiles}
    )

    return bundle_name, bundle


def load_source_rows(profile: dict[str, Any]) -> list[dict[str, Any]]:
    """Read a profile's offline fixture rows through its adapter contract.

    Each active profile points at a checked-in fixture so a run stays possible
    without network access and bundle selection changes real data rather than
    only a manifest label.
    """
    adapter = profile.get("adapter", {})
    fixture_path = REPO_ROOT / "tools" / "lakehouse-mvp" / adapter["fixturePath"]
    if not fixture_path.exists():
        raise ValueError(
            f"Lakehouse source profile {profile.get('ref')!r} references missing "
            f"fixture {fixture_path}"
        )
    fixture = json.loads(fixture_path.read_text(encoding="utf-8"))
    return list(fixture.get("rows", []))


def is_ci() -> bool:
    return os.environ.get("CI", "").lower() in {"1", "true"}


def resolve_source_mode(mode_value: str | None) -> str:
    """Resolve the requested source mode.

    `auto` prefers a live query on a developer machine and falls back to
    fixtures in CI, so the quality gate stays hermetic while live remains the
    normal local posture.
    """
    mode = mode_value or os.environ.get("LAKEHOUSE_SOURCE_MODE") or "auto"
    if mode not in SOURCE_MODES:
        raise ValueError(
            f"Unknown Lakehouse source mode {mode!r}; expected one of {', '.join(SOURCE_MODES)}"
        )
    return mode


def fetch_live_rows(profile: dict[str, Any]) -> list[dict[str, Any]]:
    """Run a bounded VO/TAP sync query and return provider-shaped rows.

    Uses the stdlib so the MVP does not gain an HTTP dependency. The response is
    VOTable JSON: column names in `metadata`, values in positional `data` rows.
    """
    endpoint = profile.get("endpoint")
    query = profile.get("query")
    if not endpoint or not query:
        raise ValueError(
            f"Lakehouse source profile {profile.get('ref')!r} cannot run live "
            "without an endpoint and query"
        )

    params = urllib.parse.urlencode(
        {
            "REQUEST": "doQuery",
            "LANG": "ADQL",
            "FORMAT": "json",
            "MAXREC": str(LIVE_ROW_LIMIT),
            "QUERY": query,
        }
    )
    url = f"{endpoint.rstrip('/')}/sync?{params}"
    request = urllib.request.Request(
        url, headers={"User-Agent": "phase-2-cosmic-pr41-lakehouse-mvp"}
    )
    with urllib.request.urlopen(request, timeout=LIVE_TIMEOUT_SECONDS) as response:
        payload = json.loads(response.read().decode("utf-8"))

    columns = [
        column.get("name") for column in payload.get("metadata", payload.get("columns", []))
    ]
    if not columns:
        raise ValueError("live TAP response contained no column metadata")

    rows = [dict(zip(columns, values, strict=False)) for values in payload.get("data", [])]
    if not rows:
        raise ValueError("live TAP response contained no rows")
    return rows


def resolve_source_data(
    active_profiles: list[dict[str, Any]], mode: str
) -> list[dict[str, Any]]:
    """Resolve rows for each active profile and record how they were obtained.

    The resolved mode is reported per profile so the manifest never implies a
    live extract when a fixture was actually used.
    """
    resolved: list[dict[str, Any]] = []

    for profile in active_profiles:
        can_run_live = bool(profile.get("endpoint") and profile.get("query"))
        reason: str | None = None

        if mode == "fixture" or not can_run_live:
            # A fixture-only profile has no live counterpart to demand, so live
            # mode applies to the live-capable profiles in the bundle rather
            # than failing the whole run.
            resolved_mode = "fixture"
            if not can_run_live:
                reason = "profile declares no live endpoint/query"
            rows = load_source_rows(profile)
        elif mode == "auto" and is_ci():
            resolved_mode = "fixture"
            reason = "CI runs stay hermetic and do not query public archives"
            rows = load_source_rows(profile)
        else:
            try:
                rows = fetch_live_rows(profile)
                resolved_mode = "live"
            except (urllib.error.URLError, TimeoutError, ValueError, OSError) as error:
                if mode == "live":
                    # An explicit live request must not silently degrade.
                    raise ValueError(
                        f"live source query failed for profile {profile['ref']!r}: {error}"
                    ) from error
                resolved_mode = "fixture-fallback"
                reason = f"live query failed: {error}"
                rows = load_source_rows(profile)

        resolved.append(
            {
                "profile": profile,
                "rows": rows,
                "mode": resolved_mode,
                "reason": reason,
            }
        )

    return resolved


def resolve_profile(profile_value: str | None, allow_large: bool) -> tuple[str, dict[str, Any]]:
    registry = load_scale_profiles()
    default_profile = registry.get("defaultProfile", "tiny")
    profile_name = profile_value or os.environ.get("LAKEHOUSE_SCALE_PROFILE") or default_profile
    profiles = registry.get("profiles", {})

    if profile_name not in profiles:
        raise ValueError(
            f"Unknown Lakehouse scale profile {profile_name!r}; expected one of {', '.join(sorted(profiles))}"
        )

    profile = profiles[profile_name]
    large_allowed = allow_large or os.environ.get("LAKEHOUSE_ALLOW_LARGE_SAMPLE") == "true"
    if profile.get("requiresExplicitApproval") and not large_allowed:
        guard = profile.get("guard", "LAKEHOUSE_ALLOW_LARGE_SAMPLE=true")
        raise ValueError(
            f"Refusing to run Lakehouse scale profile {profile_name!r} without {guard}. "
            "Large profiles can generate tens of GB to TB per medallion layer."
        )

    return profile_name, profile


def reset_output(output: Path) -> None:
    if output.exists():
        shutil.rmtree(output)
    output.mkdir(parents=True, exist_ok=True)


def build_bronze_rows(
    source_bundle_name: str,
    resolved_sources: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    """Build source-faithful Bronze rows from every active profile in the bundle.

    Attribution comes from the profile that produced the row, so Bronze records
    which provider, which source profile, and whether the payload came from a
    live query or a checked-in fixture.
    """
    rows: list[dict[str, Any]] = []
    ingest_run_id = f"pr41-mvp-{now_iso()}"
    index = 0

    for resolved in resolved_sources:
        profile = resolved["profile"]
        field_map = profile["adapter"]["fieldMap"]
        identifier_field = field_map["sourceIdentifier"]
        for source in resolved["rows"]:
            index += 1
            rows.append(
                {
                    "bronze_event_id": f"bronze-{index:04d}",
                    "source_provider": str(profile.get("provider") or "unknown"),
                    "source_profile": str(profile["ref"]),
                    "source_bundle": source_bundle_name,
                    "source_mode": str(resolved["mode"]),
                    "adapter_contract": str(profile["adapter"]["contract"]),
                    "schema_version": "obs-event.v1",
                    "source_identifier": source.get(identifier_field) or None,
                    "event_hash": stable_hash(source),
                    "ingest_run_id": ingest_run_id,
                    "ingested_at": now_iso(),
                    "source_payload_json": json.dumps(source, sort_keys=True),
                }
            )
    return rows


def canonicalize(
    payload: dict[str, Any], field_map: dict[str, str]
) -> dict[str, Any]:
    """Project a provider payload onto the canonical Lakehouse observation fields."""
    return {
        canonical: payload.get(provider_field)
        for canonical, provider_field in field_map.items()
    }


def validate_silver(canonical: dict[str, Any]) -> list[str]:
    """Validate a canonicalized record, independent of provider column names."""
    reasons: list[str] = []
    if not canonical.get("sourceIdentifier"):
        reasons.append("missing_source_identifier")
    if not canonical.get("accessUri"):
        reasons.append("missing_object_or_access_uri")
    ra = canonical.get("ra")
    dec = canonical.get("dec")
    if not isinstance(ra, int | float) or not 0 <= float(ra) <= 360:
        reasons.append("invalid_ra")
    if not isinstance(dec, int | float) or not -90 <= float(dec) <= 90:
        reasons.append("invalid_dec")
    return reasons


def build_silver(
    bronze_rows: list[dict[str, Any]],
    profiles_by_ref: dict[str, dict[str, Any]] | None = None,
) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    if profiles_by_ref is None:
        _, bundle = resolve_source_bundle(None)
        profiles_by_ref = {
            profile["ref"]: profile for profile in bundle["activeProfiles"]
        }

    observations: list[dict[str, Any]] = []
    quarantine: list[dict[str, Any]] = []
    seen: set[str] = set()

    for row in bronze_rows:
        payload = json.loads(row["source_payload_json"])
        profile = profiles_by_ref.get(row["source_profile"])
        if profile is None:
            raise ValueError(
                f"Bronze row {row['bronze_event_id']} references source profile "
                f"{row['source_profile']!r} that is not active in this run"
            )

        canonical = canonicalize(payload, profile["adapter"]["fieldMap"])
        reasons = validate_silver(canonical)
        source_identifier = canonical.get("sourceIdentifier") or ""

        if source_identifier in seen:
            reasons.append("duplicate_source_identifier")

        if reasons:
            quarantine.append(
                {
                    "quarantine_id": f"quarantine-{row['bronze_event_id']}",
                    "bronze_event_id": row["bronze_event_id"],
                    "source_provider": row["source_provider"],
                    "source_identifier": source_identifier or None,
                    "reason_codes": ",".join(reasons),
                    "source_payload_json": row["source_payload_json"],
                    "quarantined_at": now_iso(),
                }
            )
            continue

        seen.add(source_identifier)
        observations.append(
            {
                "observation_id": f"obs-{stable_hash(source_identifier)[:12]}",
                "source_identifier": source_identifier,
                "source_provider": row["source_provider"],
                "source_profile": row["source_profile"],
                "collection": str(canonical.get("collection") or "unknown"),
                "data_product_type": str(
                    canonical.get("dataProductType") or "unknown"
                ),
                "ra_degrees": float(canonical["ra"]),
                "dec_degrees": float(canonical["dec"]),
                "object_uri": str(canonical.get("accessUri") or ""),
                "bronze_event_id": row["bronze_event_id"],
                "canonicalized_at": now_iso(),
            }
        )

    return observations, quarantine


def build_gold(
    silver_observations: list[dict[str, Any]],
    silver_quarantine: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    by_collection = Counter(row["collection"] for row in silver_observations)
    rows: list[dict[str, Any]] = []
    for collection, accepted_count in sorted(by_collection.items()):
        bronze_ids = sorted(
            row["bronze_event_id"]
            for row in silver_observations
            if row["collection"] == collection
        )
        rows.append(
            {
                "summary_id": f"summary-{collection.lower()}",
                "collection": collection,
                "accepted_observations": int(accepted_count),
                "quarantined_records": len(silver_quarantine),
                "source_silver_table": "silver.observations",
                "lineage_bronze_event_ids": ",".join(bronze_ids),
                "refreshed_at": now_iso(),
            }
        )
    return rows


def pyarrow_type(value: Any) -> pa.DataType:
    if isinstance(value, int):
        return pa.int64()
    if isinstance(value, float):
        return pa.float64()
    return pa.string()


def declared_schema(table_name: str) -> pa.Schema:
    type_by_name = {"string": pa.string(), "double": pa.float64(), "int64": pa.int64()}
    return pa.schema(
        [
            (column, type_by_name[type_name])
            for column, type_name in TABLE_SCHEMAS[table_name]
        ]
    )


def write_table(
    table_path: Path, rows: list[dict[str, Any]], table_name: str
) -> dict[str, Any]:
    table_path.mkdir(parents=True, exist_ok=True)
    parquet_name = "part-00000.parquet"
    parquet_path = table_path / parquet_name

    if rows:
        schema = pa.schema(
            [(key, pyarrow_type(rows[0][key])) for key in rows[0].keys()]
        )
    elif table_name in TABLE_SCHEMAS:
        # An empty layer is a real outcome, not a failure. Keep the table typed
        # and inspectable so downstream evidence can report zero rows honestly.
        schema = declared_schema(table_name)
    else:
        raise ValueError(f"{table_name} has no rows and no declared schema")

    table = pa.Table.from_pylist(rows, schema=schema)
    pq.write_table(table, parquet_path)

    delta_log = table_path / "_delta_log"
    delta_log.mkdir(exist_ok=True)
    delta_entry = {
        "commitInfo": {
            "timestamp": now_iso(),
            "operation": "WRITE",
            "operationParameters": {"mode": "Overwrite"},
            "engineInfo": "phase-2-cosmic PR41 local MVP",
        }
    }
    metadata = {
        "metaData": {
            "id": stable_hash(table_name)[:32],
            "name": table_name,
            "description": "Lakehouse Initiative PR41 MVP table",
            "format": {"provider": "parquet", "options": {}},
            "schemaString": table.schema.to_string(),
            "partitionColumns": [],
            "configuration": {"phase2.pr": "PR41", "phase2.mvp": "true"},
            "createdTime": int(datetime.now(UTC).timestamp() * 1000),
        }
    }
    add = {
        "add": {
            "path": parquet_name,
            "partitionValues": {},
            "size": parquet_path.stat().st_size,
            "modificationTime": int(datetime.now(UTC).timestamp() * 1000),
            "dataChange": True,
            "stats": json.dumps({"numRecords": len(rows)}),
        }
    }
    protocol = {"protocol": {"minReaderVersion": 1, "minWriterVersion": 2}}
    log_path = delta_log / "00000000000000000000.json"
    with log_path.open("w", encoding="utf-8") as handle:
        for action in [delta_entry, protocol, metadata, add]:
            handle.write(json.dumps(action, sort_keys=True) + "\n")

    output_root = table_path.parents[1]
    return {
        "path": str(table_path.relative_to(output_root)),
        "parquetPath": str((table_path / parquet_name).relative_to(output_root)),
        "deltaLogPath": str(log_path.relative_to(output_root)),
        "rows": len(rows),
        "bytes": parquet_path.stat().st_size,
    }


def write_manifest(
    output: Path,
    profile_name: str,
    profile: dict[str, Any],
    source_bundle_name: str,
    source_bundle: dict[str, Any],
    table_entries: dict[str, dict[str, Any]],
    large_profiles_allowed: bool = False,
    requested_source_mode: str = "fixture",
    resolved_sources: list[dict[str, Any]] | None = None,
) -> None:
    bronze_rows = table_entries["bronze.observation_events"]["rows"]
    silver_rows = table_entries["silver.observations"]["rows"]
    quarantine_rows = table_entries["silver.quarantine"]["rows"]
    gold_rows = table_entries["gold.observation_summary"]["rows"]
    bytes_by_layer = {
        "bronze": table_entries["bronze.observation_events"]["bytes"],
        "silver": table_entries["silver.observations"]["bytes"]
        + table_entries["silver.quarantine"]["bytes"],
        "gold": table_entries["gold.observation_summary"]["bytes"],
    }
    manifest = {
        "label": "Lakehouse Initiative PR41 MVP",
        "generatedAt": now_iso(),
        "runtime": "local pyarrow parquet writer with Delta transaction metadata",
        "diagnosticState": "local_mvp_verified",
        "evidenceSource": "pr41-local-manifest",
        "artifactKind": "generated-local-mvp",
        # Guard state: whether large-profile generation was authorized for this
        # run, not whether the selected profile happens to require approval.
        "largeProfilesAllowed": large_profiles_allowed,
        "reproductionCommand": f"pnpm nx run lakehouse-mvp:test -- --profile {profile_name}",
        "sourceBundle": {
            "name": source_bundle_name,
            "label": source_bundle.get("label"),
            "profileRefs": source_bundle.get("profileRefs", []),
            "activeProfileRefs": source_bundle.get("activeProfileRefs", []),
            "providers": source_bundle.get("providers", []),
            "requestedMode": requested_source_mode,
            # Per-profile truth: a bundle can mix a live extract with fixture
            # rows, and the manifest must never imply live data that was not
            # actually fetched.
            "resolvedProfiles": [
                {
                    "ref": resolved["profile"]["ref"],
                    "provider": resolved["profile"].get("provider"),
                    "mode": resolved["mode"],
                    "rows": len(resolved["rows"]),
                    "reason": resolved["reason"],
                }
                for resolved in (resolved_sources or [])
            ],
            "hasLiveRows": any(
                resolved["mode"] == "live" for resolved in (resolved_sources or [])
            ),
            "adapterContracts": sorted(
                {
                    profile_entry["adapter"]["contract"]
                    for profile_entry in source_bundle.get("activeProfiles", [])
                }
            ),
            "intendedUse": source_bundle.get("intendedUse"),
        },
        "scaleProfile": {
            "name": profile_name,
            "label": profile.get("label"),
            "targetBytesPerMedallionLayer": profile.get("targetBytesPerMedallionLayer"),
            "intendedUse": profile.get("intendedUse"),
            "requiresExplicitApproval": profile.get("requiresExplicitApproval", False),
        },
        "outputRoot": str(output),
        "tables": table_entries,
        "bytesByLayer": bytes_by_layer,
        "evidence": {
            "hasBronzeSourceFidelity": True,
            "hasSilverCanonicalEntity": silver_rows > 0,
            "hasSilverQuarantine": quarantine_rows > 0,
            "hasGoldAggregate": gold_rows > 0,
            "lineage": "gold.lineage_bronze_event_ids -> bronze.bronze_event_id",
        },
        "warnings": [
            "PR41 local artifacts are not Databricks evidence.",
            "Generated stress profiles are not real public-source evidence.",
        ],
    }
    (output / "manifest.json").write_text(
        json.dumps(manifest, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", help="Output directory under tmp/lakehouse")
    parser.add_argument(
        "--profile",
        help="Lakehouse scale profile from tools/lakehouse-mvp/scale-profiles.json",
    )
    parser.add_argument(
        "--allow-large",
        action="store_true",
        help="Allow guarded large profiles when intentionally generating large local samples",
    )
    parser.add_argument(
        "--source-bundle",
        help="Lakehouse source bundle from tools/lakehouse-mvp/source-registry.example.json",
    )
    parser.add_argument(
        "--source-mode",
        choices=SOURCE_MODES,
        help=(
            "auto (default) queries live locally and uses fixtures in CI, "
            "live requires a successful query, fixture never uses the network"
        ),
    )
    args = parser.parse_args()

    output = resolve_output(args.output)
    large_profiles_allowed = (
        args.allow_large or os.environ.get("LAKEHOUSE_ALLOW_LARGE_SAMPLE") == "true"
    )
    profile_name, profile = resolve_profile(args.profile, args.allow_large)
    source_bundle_name, source_bundle = resolve_source_bundle(args.source_bundle)
    reset_output(output)

    active_profiles = source_bundle["activeProfiles"]
    profiles_by_ref = {profile_entry["ref"]: profile_entry for profile_entry in active_profiles}

    source_mode = resolve_source_mode(args.source_mode)
    resolved_sources = resolve_source_data(active_profiles, source_mode)

    bronze_rows = build_bronze_rows(source_bundle_name, resolved_sources)
    silver_rows, quarantine_rows = build_silver(bronze_rows, profiles_by_ref)
    gold_rows = build_gold(silver_rows, quarantine_rows)

    table_entries = {}
    table_entries["bronze.observation_events"] = write_table(
        output / "bronze" / "observation_events",
        bronze_rows,
        "bronze.observation_events",
    )
    table_entries["silver.observations"] = write_table(
        output / "silver" / "observations",
        silver_rows,
        "silver.observations",
    )
    table_entries["silver.quarantine"] = write_table(
        output / "silver" / "quarantine",
        quarantine_rows,
        "silver.quarantine",
    )
    table_entries["gold.observation_summary"] = write_table(
        output / "gold" / "observation_summary",
        gold_rows,
        "gold.observation_summary",
    )
    write_manifest(
        output,
        profile_name,
        profile,
        source_bundle_name,
        source_bundle,
        table_entries,
        large_profiles_allowed,
        source_mode,
        resolved_sources,
    )

    print(f"[lakehouse-pr41] wrote MVP lakehouse artifacts to {output}")
    print(f"[lakehouse-pr41] scale-profile={profile_name}")
    print(f"[lakehouse-pr41] source-bundle={source_bundle_name}")
    print(
        "[lakehouse-pr41] providers=%s" % ",".join(source_bundle.get("providers", []))
    )
    print(f"[lakehouse-pr41] source-mode={source_mode}")
    for resolved in resolved_sources:
        suffix = f" ({resolved['reason']})" if resolved["reason"] else ""
        print(
            "[lakehouse-pr41]   %s -> %s, %d row(s)%s"
            % (
                resolved["profile"]["ref"],
                resolved["mode"],
                len(resolved["rows"]),
                suffix,
            )
        )
    print(
        "[lakehouse-pr41] bronze=%d silver=%d quarantine=%d gold=%d"
        % (len(bronze_rows), len(silver_rows), len(quarantine_rows), len(gold_rows))
    )


if __name__ == "__main__":
    main()
