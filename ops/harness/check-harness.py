#!/usr/bin/env python3
"""Repo-local Harness gate for Markweave."""

from __future__ import annotations

import re
import subprocess
import sys
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[2]
AUDIT_SCRIPT = Path.home() / ".codex/skills/harness-init/scripts/harness_audit.py"
REQUIRED_DOCS = [
    "docs/README.md",
    "docs/architecture/overview.md",
    "docs/config/reference.md",
    "docs/standards/coding.md",
    "docs/standards/security.md",
    "docs/domain/glossary.md",
    "docs/guides/runbook.md",
]
REQUIRED_METADATA = ("owner", "updated", "status", "referenced_by")
DATE_RE = re.compile(r"^updated:\s+\d{4}-\d{2}-\d{2}\s*$", re.MULTILINE)


def read_text(path: Path) -> str:
    return path.read_text(encoding="utf-8")


def has_frontmatter_key(text: str, key: str) -> bool:
    return re.search(rf"^{re.escape(key)}:\s+.+$", text, re.MULTILINE) is not None


def run_bundled_audit() -> int:
    if not AUDIT_SCRIPT.exists():
        print(f"ERROR: missing bundled Harness audit script: {AUDIT_SCRIPT}", file=sys.stderr)
        return 1

    result = subprocess.run(
        ["python3", str(AUDIT_SCRIPT), str(REPO_ROOT)],
        cwd=REPO_ROOT,
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        check=False,
    )
    print(result.stdout, end="")
    return result.returncode


def check_required_docs() -> list[str]:
    errors: list[str] = []
    agents_text = read_text(REPO_ROOT / "AGENTS.md") if (REPO_ROOT / "AGENTS.md").exists() else ""
    docs_readme_text = read_text(REPO_ROOT / "docs/README.md") if (REPO_ROOT / "docs/README.md").exists() else ""
    route_text = agents_text + "\n" + docs_readme_text

    for rel_path in REQUIRED_DOCS:
        path = REPO_ROOT / rel_path
        if not path.exists():
            errors.append(f"missing required docs path: {rel_path}")
            continue

        if rel_path not in route_text:
            errors.append(f"required docs path is not routed: {rel_path}")

        text = read_text(path)
        for key in REQUIRED_METADATA:
            if not has_frontmatter_key(text, key):
                errors.append(f"{rel_path}: front matter missing {key}")
        if not DATE_RE.search(text):
            errors.append(f"{rel_path}: updated must use YYYY-MM-DD")

    return errors


def main() -> int:
    exit_code = run_bundled_audit()
    errors = check_required_docs()

    if errors:
        print("\nRepo Harness gate errors:")
        for error in errors:
            print(f"- {error}")
        exit_code = 1

    if exit_code == 0:
        print("Repo Harness gate: passed")

    return exit_code


if __name__ == "__main__":
    sys.exit(main())
