"""Build the instrumented test programs once and merge verified fixture profiles."""

from contextlib import ExitStack, suppress
import json
import os
from pathlib import Path
import re
import signal
import socket
import subprocess
import sys
from tempfile import TemporaryDirectory
from time import sleep


CONFIG = Path(__file__).resolve().parent
PROJECT = CONFIG.parents[2]
NATIVE = PROJECT / "src-tauri"
MANIFEST = NATIVE / "Cargo.toml"
TARGET = Path(os.environ["CARGO_LLVM_COV_TARGET_DIR"]).resolve()
CARGO_REPORT = [
    "cargo", "llvm-cov", "report", "--locked", "--manifest-path", MANIFEST,
    "--profile", "coverage", "--summary-only",
]
BUILD = """export CARGO_TARGET_DIR="$3"
coverage_env=$(cargo llvm-cov show-env --sh --locked --manifest-path "$1")
eval "$coverage_env"
export LLVM_PROFILE_FILE="$2"
export CARGO_LLVM_COV_TARGET_DIR="$3" CARGO_LLVM_COV_BUILD_DIR="$3"
exec cargo test --locked --manifest-path "$1" --target-dir "$CARGO_LLVM_COV_TARGET_DIR" \\
  --profile coverage --no-run --lib --test regtest_multisig --message-format=json
"""


def stop_processes(processes):
    running = [process for process in processes if process.poll() is None]
    for process in running:
        with suppress(ProcessLookupError):
            os.killpg(process.pid, signal.SIGTERM)
    for process in running:
        try:
            process.wait(timeout=18)
        except subprocess.TimeoutExpired:
            with suppress(ProcessLookupError):
                os.killpg(process.pid, signal.SIGKILL)
            process.wait()


def build_executables(scratch):
    expected = {"groot_lib", "regtest_multisig"}
    executables = {}
    with subprocess.Popen(
        ["bash", "-ec", BUILD, "coverage-build", MANIFEST, scratch / "build-%p-%10m.profraw", TARGET],
        cwd=CONFIG,
        env={**os.environ, "CARGO_LLVM_COV_TARGET_DIR": str(TARGET)},
        stdout=subprocess.PIPE,
        text=True,
        start_new_session=True,
    ) as cargo:
        try:
            for line in cargo.stdout:
                event = json.loads(line)
                if event["reason"] == "compiler-message":
                    sys.stderr.write(event["message"].get("rendered") or "")
                if event["reason"] != "compiler-artifact" or not event["profile"]["test"]:
                    continue
                name = event["target"]["name"]
                if name not in expected or not event["executable"]:
                    continue
                if name in executables or Path(event["manifest_path"]).resolve() != MANIFEST:
                    raise RuntimeError(f"Unexpected duplicate or foreign coverage executable for {name}")
                executable = Path(event["executable"]).resolve(strict=True)
                if not executable.is_relative_to(TARGET) or not os.access(executable, os.X_OK):
                    raise RuntimeError(f"Invalid coverage executable for {name}")
                executables[name] = executable
            if cargo.wait() != 0:
                raise RuntimeError("Instrumented test build failed")
        finally:
            stop_processes([cargo])
    if set(executables) != expected:
        raise RuntimeError("Cargo did not report both instrumented test executables")
    return executables


def distinct_ports(count):
    # Hold all reservations together so our own fixtures cannot pick the same ports.
    with ExitStack() as stack:
        ports = []
        for _ in range(count):
            port = stack.enter_context(socket.socket())
            port.bind(("127.0.0.1", 0))
            ports.append(str(port.getsockname()[1]))
        return ports


def raw_profiles(directory, minimum):
    profiles = sorted(directory.glob("*.profraw"))
    if len(profiles) < minimum or any(
        not raw.is_file() or raw.is_symlink() or raw.stat().st_size == 0 for raw in profiles
    ):
        raise RuntimeError(f"Missing or invalid raw profiles for {directory.name}")
    return profiles


def report_core(scratch, executable, unit_profiles):
    # Give llvm-cov only the exact library object and deterministic unit profiles.
    # It must not discover the compiled descriptor program or funded profiles.
    core = scratch / "core-report"
    deps = core / "coverage" / "deps"
    deps.mkdir(parents=True)
    os.link(executable, deps / executable.name)
    for raw in unit_profiles:
        os.link(raw, core / raw.name)
    subprocess.run(
        ["bash", "-euc", 'source "$1"; coverage_report_core', "coverage-core", CONFIG / "common.sh"],
        cwd=CONFIG,
        env={**os.environ, "CARGO_LLVM_COV_TARGET_DIR": str(core)},
        check=True,
    )


def run_tests(scratch, executables):
    fixture_env = {
        **os.environ,
        "GROOT_RUST_COVERAGE_LIB": str(executables["groot_lib"]),
        "GROOT_RUST_COVERAGE_DESCRIPTOR": str(executables["regtest_multisig"]),
    }
    caller_fixture = any(
        os.environ.get(name)
        for name in ("GROOT_REGTEST_DIR", "GROOT_RPC_PORT", "GROOT_P2P_PORT")
    )
    groups = ("all",) if caller_fixture else ("primary", "descriptor", "continuity")
    assigned_ports = iter(distinct_ports(2 * len(groups))) if not caller_fixture else None
    plans = [("units", [executables["groot_lib"]], os.environ.copy())]
    for group in groups:
        env = fixture_env.copy()
        if assigned_ports is not None:
            env["GROOT_RPC_PORT"] = next(assigned_ports)
            env["GROOT_P2P_PORT"] = next(assigned_ports)
        plans.append((group, ["bash", PROJECT / "scripts/regtest/test.sh", group], env))

    processes = {}
    profiles = {}
    try:
        for name, command, env in plans:
            directory = scratch / name
            temporary_files = directory / "tmp"
            temporary_files.mkdir(parents=True)
            env["TMPDIR"] = str(temporary_files)
            env["LLVM_PROFILE_FILE"] = str(directory / f"{name}-%p-%10m.profraw")
            with (directory / "test.log").open("w") as output:
                processes[name] = subprocess.Popen(
                    command, cwd=NATIVE, env=env, stdout=output, stderr=subprocess.STDOUT,
                    start_new_session=True,
                )
            print(f"Started native coverage group: {name}", flush=True)

        pending = set(processes)
        minimum_profiles = {"units": 1, "all": 12, "primary": 9, "descriptor": 1, "continuity": 2}
        while pending:
            for name, process in processes.items():
                if name not in pending or process.poll() is None:
                    continue
                pending.remove(name)
                output = (scratch / name / "test.log").read_text(errors="replace")
                print(output, end="", flush=True)
                if process.returncode != 0:
                    raise RuntimeError(f"Native coverage group {name} failed ({process.returncode})")
                profiles[name] = raw_profiles(scratch / name, minimum_profiles[name])
                if name == "units":
                    if not re.search(r"^test result: ok\. [1-9][0-9]* passed; 0 failed;", output, re.M):
                        raise RuntimeError("Deterministic coverage run did not execute tests")
                    report_core(scratch, executables["groot_lib"], profiles[name])
            if pending:
                sleep(0.15)
        return [raw for name in processes for raw in profiles[name]]
    finally:
        stop_processes(processes.values())


def interrupt(_signum, _frame):
    raise KeyboardInterrupt


def main():
    signal.signal(signal.SIGTERM, interrupt)
    signal.signal(signal.SIGINT, interrupt)
    TARGET.mkdir(parents=True, exist_ok=True)
    with TemporaryDirectory(prefix="groot-coverage-run-", dir=TARGET) as run:
        scratch = Path(run)
        executables = build_executables(scratch)
        profiles = run_tests(scratch, executables)
        # Both gates depend on fresh profiles from this build. No funded profile
        # reaches llvm-cov's whole-library input until every group has passed.
        for raw in profiles:
            os.link(raw, TARGET / raw.name)
        subprocess.run(
            [*CARGO_REPORT, "--fail-under-lines", "62", "--fail-under-functions", "59",
             "--fail-under-regions", "59"],
            cwd=CONFIG,
            env={**os.environ, "CARGO_LLVM_COV_TARGET_DIR": str(TARGET)},
            check=True,
        )


if __name__ == "__main__":
    try:
        main()
    except (OSError, RuntimeError, subprocess.CalledProcessError) as error:
        sys.exit(f"Native coverage failed: {error}")
    except KeyboardInterrupt:
        sys.exit(130)
