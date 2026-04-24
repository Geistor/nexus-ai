import argparse, os, subprocess, sys

ap = argparse.ArgumentParser()
ap.add_argument("--dataset", required=True)
ap.add_argument("--outdir", required=True)
args = ap.parse_args()

os.makedirs(args.outdir, exist_ok=True)
out = os.path.join(args.outdir, "model.nn.json")
subprocess.check_call([sys.executable, os.path.join(os.path.dirname(__file__), "train_mlp_cloud.py"), "--dataset", args.dataset, "--out", out])
