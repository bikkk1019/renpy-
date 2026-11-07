"""Build and verify a portable source release using only Python's standard library."""
import argparse
import hashlib
import json
import re
import zipfile
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
TOP = "GalgameVisualEditor"
ROOT_FILES = [
    "README.md", "CHANGELOG.md", "package.json", ".gitignore", ".editorconfig",
    "renpy_performance_maker.html", "启动编辑器.cmd", "打开工程检查工具.cmd",
]
DIRECTORIES = {
    "src": {".js", ".css"}, "docs": {".md"}, "examples": {".json"},
    "tools": {".py"}, "scripts": {".py", ".cjs", ".ps1"},
}


def release_files():
    files = [ROOT / name for name in ROOT_FILES]
    for directory, extensions in DIRECTORIES.items():
        files.extend(p for p in (ROOT / directory).rglob("*") if p.is_file() and p.suffix in extensions)
    files.extend((ROOT / "tests").glob("*.cjs"))
    files.extend((ROOT / "tests" / "helpers").glob("*.cjs"))
    for file in files:
        if not file.is_file() or file.is_symlink() or not file.resolve().is_relative_to(ROOT):
            raise ValueError(f"Missing or unsafe release file: {file}")
    entry = (ROOT / "renpy_performance_maker.html").read_text(encoding="utf-8")
    for name in re.findall(r'(?:src|href)="([^"#]+)"', entry):
        if ":" not in name and not (ROOT / name).is_file():
            raise ValueError(f"Broken entry reference: {name}")
    return sorted(set(files))


def build(destination):
    version = json.loads((ROOT / "package.json").read_text(encoding="utf-8"))["version"]
    files = release_files()
    manifest = {
        "project": TOP, "version": version,
        "created_utc": datetime.now(timezone.utc).isoformat(),
        "files": {},
    }
    destination.mkdir(parents=True, exist_ok=True)
    archive = destination / f"{TOP}-{version}.zip"
    with zipfile.ZipFile(archive, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=9) as z:
        for file in files:
            name, data = file.relative_to(ROOT).as_posix(), file.read_bytes()
            manifest["files"][name] = {"bytes": len(data), "sha256": hashlib.sha256(data).hexdigest()}
            z.writestr(f"{TOP}/{name}", data)
        z.writestr(f"{TOP}/BUILD-MANIFEST.json", json.dumps(manifest, ensure_ascii=False, indent=2))
    with zipfile.ZipFile(archive) as z:
        if z.testzip() is not None:
            raise ValueError("Archive CRC verification failed")
        for name, info in manifest["files"].items():
            if hashlib.sha256(z.read(f"{TOP}/{name}")).hexdigest() != info["sha256"]:
                raise ValueError(f"Archive content verification failed: {name}")
    digest = hashlib.sha256(archive.read_bytes()).hexdigest()
    checksum = archive.with_suffix(".zip.sha256")
    checksum.write_text(f"{digest}  {archive.name}\n", encoding="ascii")
    print(json.dumps({"archive": str(archive), "checksum": str(checksum), "files": len(files), "bytes": archive.stat().st_size}, ensure_ascii=False))


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output-dir", type=Path, default=ROOT / "dist")
    build(parser.parse_args().output_dir)
