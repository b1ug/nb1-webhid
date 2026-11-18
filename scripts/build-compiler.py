#!/usr/bin/env python3
"""Build a thin browser bridge inside an exact upstream nb1 module archive.

The tracked compiler algorithms are not copied or rewritten in this repository.
Only owned ignored staging/output paths are written. No USB or daemon is used.
"""
from __future__ import annotations

import argparse
import hashlib
import io
import json
import os
from pathlib import Path, PurePosixPath
import shutil
import subprocess
import tarfile
import tempfile
from datetime import datetime, timezone

ROOT = Path(__file__).resolve().parents[1]
CACHE = ROOT / ".cache"
LOCK = ROOT / "compiler/source-lock.json"
UPSTREAM = "https://github.com/b1ug/nb1.git"
PIN = "b5cfe68cbb412d81a80d948b845aee5b0aba586b"
PURE = ["actionv1", "sequence", "colorinput", "jsoninput"]
MARKER = "nb1-browser-owned-upstream-cache-v1\n"


def run(args, *, cwd=ROOT, env=None, timeout=180, binary=False):
    result = subprocess.run(args, cwd=cwd, env=env, capture_output=True,
                            text=not binary, timeout=timeout)
    if result.returncode:
        message = result.stderr.decode(errors="replace") if binary else result.stderr
        raise RuntimeError(f"Command failed ({result.returncode}): {args[0]}: {message[-6000:]}")
    return result.stdout


def digest(data):
    return hashlib.sha256(data).hexdigest()


def source_repository(provided):
    if provided:
        repository = Path(provided).expanduser().resolve()
        head = run(["git", "-C", str(repository), "rev-parse", "HEAD"]).strip()
        if head != PIN:
            raise RuntimeError("The supplied checkout must be at the pinned nb1 source commit")
        if run(["git", "-C", str(repository), "status", "--porcelain"]).strip():
            raise RuntimeError("The supplied nb1 checkout must be clean")
        return repository, "explicit-clean-checkout"

    repository = CACHE / "nb1-upstream.git"
    marker = CACHE / "nb1-upstream.owner"
    if repository.is_symlink() or marker.is_symlink():
        raise RuntimeError("Refusing a symlinked upstream cache")
    if repository.exists():
        if not marker.is_file() or marker.read_text() != MARKER:
            raise RuntimeError("Existing upstream cache is not owned by this builder")
        if run(["git", "--git-dir", str(repository), "config", "--get", "remote.origin.url"]).strip() != UPSTREAM:
            raise RuntimeError("Upstream cache origin does not match the pinned repository")
    else:
        run(["git", "init", "--bare", str(repository)])
        run(["git", "--git-dir", str(repository), "remote", "add", "origin", UPSTREAM])
        marker.write_text(MARKER)
    present = subprocess.run(["git", "--git-dir", str(repository), "cat-file", "-e", PIN + "^{commit}"],
                             capture_output=True, timeout=10).returncode == 0
    if not present:
        run(["git", "--git-dir", str(repository), "fetch", "--depth=1", "origin", PIN], timeout=180)
    actual = run(["git", "--git-dir", str(repository), "rev-parse", PIN + "^{commit}"]).strip()
    if actual != PIN:
        raise RuntimeError("Fetched source identity mismatch")
    return repository, "pinned-public-git-object"


def extract_archive(repository, destination):
    archive = run(["git", "-C", str(repository), "archive", "--format=tar", PIN], binary=True)
    with tarfile.open(fileobj=io.BytesIO(archive), mode="r:") as source:
        members = source.getmembers()
        if len(members) > 10000 or sum(m.size for m in members) > 256 * 1024 * 1024:
            raise RuntimeError("Unexpectedly large upstream archive")
        for member in members:
            name = PurePosixPath(member.name)
            if name.is_absolute() or ".." in name.parts or not (member.isfile() or member.isdir()):
                raise RuntimeError("Unsupported or unsafe upstream archive member")
            target = destination.joinpath(*name.parts)
            if member.isdir():
                target.mkdir(parents=True, exist_ok=True)
            else:
                target.parent.mkdir(parents=True, exist_ok=True)
                data = source.extractfile(member).read()
                target.write_bytes(data)
                target.chmod(0o755 if member.mode & 0o111 else 0o644)
    return digest(archive), len(members)


def verify_source(stage, lock):
    for item in lock["files"]:
        name = PurePosixPath(item["path"])
        if name.is_absolute() or ".." in name.parts:
            raise RuntimeError("Unsafe path in compiler source lock")
        path = stage.joinpath(*name.parts)
        data = path.read_bytes()
        if len(data) != item["bytes"] or digest(data) != item["sha256"]:
            raise RuntimeError("Pinned compiler source mismatch: " + item["path"])
    expected = {item["path"] for item in lock["files"]}
    actual = {str(path.relative_to(stage)).replace(os.sep, "/")
              for package in PURE for path in (stage / "internal" / package).rglob("*") if path.is_file()}
    if not actual.issubset(expected):
        raise RuntimeError("Unlocked files appeared in the shared compiler packages")


def atomic_copy(source, destination):
    if destination.is_symlink():
        raise RuntimeError("Refusing to overwrite a symlinked output")
    destination.parent.mkdir(parents=True, exist_ok=True)
    temporary = destination.with_name(destination.name + ".new")
    if temporary.is_symlink():
        raise RuntimeError("Refusing a symlinked temporary output")
    shutil.copyfile(source, temporary)
    os.replace(temporary, destination)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source-repo", help="Optional clean checkout at the pinned commit; relative to the current directory")
    parser.add_argument("--pure-tests", action="store_true", help="Also run the four upstream package suites in Node/WASM")
    options = parser.parse_args()
    if CACHE.is_symlink():
        raise RuntimeError("Refusing a symlinked build cache")
    CACHE.mkdir(exist_ok=True)
    lock = json.loads(LOCK.read_text())
    if lock["source_commit"] != PIN or lock["repository"] != UPSTREAM or lock["packages"] != PURE:
        raise RuntimeError("Unexpected compiler source lock identity")
    repository, source_mode = source_repository(options.source_repo)
    # TemporaryDirectory owns this newly created path; no existing source tree is removed.
    with tempfile.TemporaryDirectory(prefix="nb1-compiler-", dir=CACHE) as temporary:
        stage = Path(temporary)
        archive_sha, members = extract_archive(repository, stage)
        verify_source(stage, lock)
        overlays = {"compiler/bridge/bridge.go": "internal/browsercompiler/bridge.go",
                    "compiler/wasm/main.go": "cmd/nb1-browser-wasm/main.go",
                    "compiler/oracle/main.go": "cmd/nb1-browser-oracle/main.go"}
        overlay_files = {}
        for original, name in overlays.items():
            source = ROOT / original
            if source.is_symlink():
                raise RuntimeError("Refusing a symlinked compiler bridge")
            if (stage / name).exists():
                raise RuntimeError("The bridge would overwrite an upstream source file")
            (stage / name).parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(source, stage / name)
            overlay_files[original] = {"sha256": digest(source.read_bytes()), "bytes": source.stat().st_size}
        if f'const SourceCommit = "{PIN}"' not in (ROOT / "compiler/bridge/bridge.go").read_text():
            raise RuntimeError("The bridge source identity must match the source lock")
        go_root = Path(run(["go", "env", "GOROOT"]).strip())
        go_version = run(["go", "env", "GOVERSION"]).strip()
        # Homebrew keeps the top-level license beside libexec; official Go
        # archives keep it inside GOROOT. Both belong to this same installation.
        go_license = next((name for name in [go_root / "LICENSE", go_root.parent / "LICENSE"] if name.is_file()), None)
        if go_license is None:
            raise RuntimeError("Could not locate the current Go distribution's license")
        host_os, host_arch = run(["go", "env", "GOHOSTOS", "GOHOSTARCH"]).splitlines()
        env = {**os.environ, "GOWORK": "off", "CGO_ENABLED": "0", "GOOS": "js", "GOARCH": "wasm"}
        dependencies = run(["go", "list", "-deps", "./cmd/nb1-browser-wasm"], cwd=stage, env=env).splitlines()
        if any(name.startswith(("github.com/b1ug/gid", "github.com/b1ug/blink1-go")) for name in dependencies):
            raise RuntimeError("A native HID backend entered the browser compiler dependency graph")
        colorkit = json.loads(run(["go", "list", "-m", "-json", "github.com/b1ug/colorkit"], cwd=stage, env=env))
        if colorkit.get("Version") != "v0.1.0" or colorkit.get("Replace") or not colorkit.get("Sum"):
            raise RuntimeError("The shared color dependency must be the fixed public colorkit v0.1.0")
        color_license = Path(colorkit["Dir"]) / "LICENSE"
        if not color_license.is_file() or color_license.is_symlink():
            raise RuntimeError("The linked colorkit distribution must include its original license")
        wasm = stage / "nb1.wasm"
        run(["go", "build", "-trimpath", "-buildvcs=false", "-ldflags=-s", "-o", str(wasm), "./cmd/nb1-browser-wasm"], cwd=stage, env=env)
        oracle_name = "native-oracle.exe" if host_os == "windows" else "native-oracle"
        oracle = stage / oracle_name
        run(["go", "build", "-trimpath", "-buildvcs=false", "-ldflags=-s", "-o", str(oracle), "./cmd/nb1-browser-oracle"],
            cwd=stage, env={**env, "GOOS": host_os, "GOARCH": host_arch})
        pure_test = {"run": False}
        if options.pure_tests:
            output = run(["go", "test", "-count=1", "-json", "-exec", str(go_root / "lib/wasm/go_js_wasm_exec"),
                          *["./internal/" + name for name in PURE]], cwd=stage, env=env)
            events = [json.loads(line) for line in output.splitlines() if line.startswith("{")]
            pure_test = {"run": True, "status": "PASS", "test_pass_events": sum(e.get("Action") == "pass" and "Test" in e for e in events),
                         "package_pass_events": sum(e.get("Action") == "pass" and "Test" not in e for e in events)}
            test_dir = ROOT / "artifacts/compiler"
            test_dir.mkdir(parents=True, exist_ok=True)
            (test_dir / "pure-tests.jsonl").write_text(output)
        # Recheck after compilation to detect accidental changes to shared source.
        verify_source(stage, lock)
        output_dir = CACHE / "compiler"
        if output_dir.is_symlink():
            raise RuntimeError("Refusing a symlinked compiler output")
        output_dir.mkdir(exist_ok=True)
        artifacts = {"nb1.wasm": wasm, "wasm_exec.js": go_root / "lib/wasm/wasm_exec.js",
                     "GO-LICENSE.txt": go_license, "NB1-LICENSE.txt": stage / "LICENSE",
                     "COLORKIT-LICENSE.txt": color_license}
        files = {}
        for name, source in artifacts.items():
            atomic_copy(source, output_dir / name)
            files[name] = {"sha256": digest(source.read_bytes()), "bytes": source.stat().st_size}
        oracle_path = CACHE / "compiler-test" / oracle_name
        atomic_copy(oracle, oracle_path)
        oracle_path.chmod(0o755)
        metadata = {"schema_version": 1, "artifact_kind": "nb1-browser-pure-go-compiler",
                    "status": "PASS", "source_commit": PIN, "repository": UPSTREAM,
                    "source_mode": source_mode, "archive_sha256": archive_sha, "archive_members": members,
                    "source_lock_sha256": digest(LOCK.read_bytes()), "locked_files": lock["files"],
                    "bridge_files": overlay_files, "go_version": go_version, "go_target": "js/wasm",
                    "go_runtime_matches_compiler": True, "native_backend_imported": False,
                    "nb1_dependency_packages": [name for name in dependencies if name.startswith("github.com/b1ug/nb1/")],
                    "public_modules": [{key: colorkit[key] for key in ("Path", "Version", "Sum")}],
                    "hardware_access": False, "pure_package_tests": pure_test, "files": files,
                    "recorded_at": datetime.now(timezone.utc).isoformat()}
        meta_temporary = output_dir / "compiler-source.json.new"
        if meta_temporary.is_symlink():
            raise RuntimeError("Refusing a symlinked compiler receipt")
        meta_temporary.write_text(json.dumps(metadata, indent=2) + "\n")
        os.replace(meta_temporary, output_dir / "compiler-source.json")
        print(json.dumps({"status": "PASS", "source_commit": PIN, "go_version": go_version,
                          "wasm_bytes": files["nb1.wasm"]["bytes"], "locked_files": len(lock["files"]),
                          "pure_package_tests": pure_test, "output": str(output_dir)}))


if __name__ == "__main__":
    main()
