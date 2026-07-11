#!/usr/bin/env python
"""Run the full offline pipeline 01 -> 05, then QA. Spec §10.

  python pipeline/run.py                      # build goat-data.json + run QA
  python pipeline/run.py --no-qa              # build only
  python pipeline/run.py --verify-determinism # build twice, assert byte-identical (§11)

06_montecarlo.py runs last: it reads the freshly-scored goat-data.json and writes the
score->percentile table the app ships. §10 requires regenerating both together.
"""
import sys, os, subprocess, hashlib, shutil

PIPELINE_DIR = os.path.dirname(os.path.abspath(__file__))
PY = sys.executable
STAGES = ["01_ingest.py", "01b_playoffs.py", "01c_clutch.py", "02_filter.py", "03_normalize.py",
          "04_score.py", "05_curate.py", "06_montecarlo.py"]


def run_stage(name):
    print(f"\n>>> {name}")
    r = subprocess.run([PY, os.path.join(PIPELINE_DIR, name)])
    if r.returncode != 0:
        sys.exit(f"[run] stage {name} failed (exit {r.returncode})")


def build():
    for s in STAGES:
        run_stage(s)


def out_path():
    from common import load_config, repo_path  # local import: common is alongside
    cfg = load_config()
    return repo_path(cfg["paths"]["out"])


def sha(path):
    return hashlib.sha256(open(path, "rb").read()).hexdigest()


def main():
    sys.path.insert(0, PIPELINE_DIR)
    args = set(sys.argv[1:])

    if "--verify-determinism" in args:
        build()
        h1 = sha(out_path())
        snap = out_path() + ".run1"
        shutil.copy(out_path(), snap)
        build()
        h2 = sha(out_path())
        os.remove(snap)
        print(f"\n[determinism] run1={h1[:16]}…  run2={h2[:16]}…")
        if h1 != h2:
            sys.exit("[determinism] FAIL — outputs differ across runs")
        print("[determinism] PASS — byte-identical outputs")
        return

    build()
    if "--no-qa" not in args:
        run_stage("qa.py")


if __name__ == "__main__":
    main()
