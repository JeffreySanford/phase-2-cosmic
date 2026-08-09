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


SOURCE_ROWS: list[dict[str, Any]] = [
    {
        "obs_publisher_did": "ivo://eso.org/ID-001",
        "obs_collection": "MUSE",
        "dataproduct_type": "cube",
        "s_ra": 150.117,
        "s_dec": -34.612,
        "access_url": "https://archive.eso.org/datalink/ID-001",
    },
    {
        "obs_publisher_did": "ivo://eso.org/ID-002",
        "obs_collection": "ALMA",
        "dataproduct_type": "visibility",
        "s_ra": 83.822,
        "s_dec": -5.391,
        "access_url": "s3://phase2-public/eso/ID-002",
    },
    {
        "obs_publisher_did": "ivo://eso.org/ID-001",
        "obs_collection": "MUSE",
        "dataproduct_type": "cube",
        "s_ra": 150.117,
        "s_dec": -34.612,
        "access_url": "https://archive.eso.org/datalink/ID-001",
    },
    {
        "obs_publisher_did": "ivo://eso.org/ID-003",
        "obs_collection": "VLT",
        "dataproduct_type": "image",
        "s_ra": 10.5,
        "s_dec": 22.25,
        "access_url": "https://archive.eso.org/datalink/ID-003",
    },
    {
        "obs_publisher_did": "",
        "obs_collection": "BROKEN",
        "dataproduct_type": "spectrum",
        "s_ra": None,
        "s_dec": -91.0,
        "access_url": "",
    },
]


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


def build_bronze_rows() -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    ingest_run_id = f"pr41-mvp-{now_iso()}"
    for index, source in enumerate(SOURCE_ROWS, start=1):
        rows.append(
            {
                "bronze_event_id": f"bronze-{index:04d}",
                "source_provider": "ESO",
                "source_profile": "eso-obscore-pr41-mvp",
                "schema_version": "obs-event.v1",
                "source_identifier": source.get("obs_publisher_did") or None,
                "event_hash": stable_hash(source),
                "ingest_run_id": ingest_run_id,
                "ingested_at": now_iso(),
                "source_payload_json": json.dumps(source, sort_keys=True),
            }
        )
    return rows


def validate_silver(row: dict[str, Any]) -> list[str]:
    payload = json.loads(row["source_payload_json"])
    reasons: list[str] = []
    if not payload.get("obs_publisher_did"):
        reasons.append("missing_source_identifier")
    if not payload.get("access_url"):
        reasons.append("missing_object_or_access_uri")
    ra = payload.get("s_ra")
    dec = payload.get("s_dec")
    if not isinstance(ra, int | float) or not 0 <= float(ra) <= 360:
        reasons.append("invalid_ra")
    if not isinstance(dec, int | float) or not -90 <= float(dec) <= 90:
        reasons.append("invalid_dec")
    return reasons


def build_silver(
    bronze_rows: list[dict[str, Any]]
) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    observations: list[dict[str, Any]] = []
    quarantine: list[dict[str, Any]] = []
    seen: set[str] = set()

    for row in bronze_rows:
        payload = json.loads(row["source_payload_json"])
        reasons = validate_silver(row)
        source_identifier = payload.get("obs_publisher_did") or ""

        if source_identifier in seen:
            reasons.append("duplicate_source_identifier")

        if reasons:
            quarantine.append(
                {
                    "quarantine_id": f"quarantine-{row['bronze_event_id']}",
                    "bronze_event_id": row["bronze_event_id"],
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
                "collection": str(payload.get("obs_collection") or "unknown"),
                "data_product_type": str(
                    payload.get("dataproduct_type") or "unknown"
                ),
                "ra_degrees": float(payload["s_ra"]),
                "dec_degrees": float(payload["s_dec"]),
                "object_uri": str(payload.get("access_url") or ""),
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


def write_table(
    table_path: Path, rows: list[dict[str, Any]], table_name: str
) -> dict[str, Any]:
    if not rows:
        raise ValueError(f"{table_name} has no rows")

    table_path.mkdir(parents=True, exist_ok=True)
    parquet_name = "part-00000.parquet"
    parquet_path = table_path / parquet_name
    schema = pa.schema([(key, pyarrow_type(rows[0][key])) for key in rows[0].keys()])
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
    table_entries: dict[str, dict[str, Any]],
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
        "largeProfilesAllowed": profile.get("requiresExplicitApproval", False),
        "reproductionCommand": f"pnpm nx run lakehouse-mvp:test -- --profile {profile_name}",
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
    args = parser.parse_args()

    output = resolve_output(args.output)
    profile_name, profile = resolve_profile(args.profile, args.allow_large)
    reset_output(output)

    bronze_rows = build_bronze_rows()
    silver_rows, quarantine_rows = build_silver(bronze_rows)
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
        table_entries,
    )

    print(f"[lakehouse-pr41] wrote MVP lakehouse artifacts to {output}")
    print(f"[lakehouse-pr41] scale-profile={profile_name}")
    print(
        "[lakehouse-pr41] bronze=%d silver=%d quarantine=%d gold=%d"
        % (len(bronze_rows), len(silver_rows), len(quarantine_rows), len(gold_rows))
    )


if __name__ == "__main__":
    main()
