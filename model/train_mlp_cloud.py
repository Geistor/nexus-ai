import argparse, json, os
import pandas as pd
from sklearn.model_selection import train_test_split
from sklearn.neural_network import MLPClassifier
from sklearn.preprocessing import StandardScaler

FEATURES = ["close","rsi14","ema20","ema50","ema_spread","atr14","vol_z","ret1"]

ap = argparse.ArgumentParser()
ap.add_argument("--dataset", required=True)
ap.add_argument("--out", required=True)
args = ap.parse_args()

df = pd.read_csv(args.dataset)
if len(df) < 40:
    raise RuntimeError("Nincs elég adat a cloud-kompatibilis NN tanításhoz.")

X = df[FEATURES].fillna(0).values
y = df["label"].astype(int).values

scaler = StandardScaler()
Xs = scaler.fit_transform(X)
X_train, X_val, y_train, y_val = train_test_split(Xs, y, test_size=0.2, shuffle=False)

clf = MLPClassifier(
    hidden_layer_sizes=(24, 12),
    activation="relu",
    solver="adam",
    learning_rate_init=0.001,
    max_iter=250,
    random_state=42,
    early_stopping=True,
    validation_fraction=0.15,
    n_iter_no_change=12
)
clf.fit(X_train, y_train)

model = {
    "format": "custom-json-mlp",
    "feature_names": FEATURES,
    "classes": [int(x) for x in clf.classes_.tolist()],
    "scaler": {"mean": scaler.mean_.tolist(), "scale": scaler.scale_.tolist()},
    "layers": [
        {"weights": clf.coefs_[0].tolist(), "bias": clf.intercepts_[0].tolist()},
        {"weights": clf.coefs_[1].tolist(), "bias": clf.intercepts_[1].tolist()},
        {"weights": clf.coefs_[2].tolist(), "bias": clf.intercepts_[2].tolist()}
    ],
    "metadata": {"train_rows": int(len(X_train)), "validation_rows": int(len(X_val))}
}

os.makedirs(os.path.dirname(args.out), exist_ok=True)
with open(args.out, "w", encoding="utf-8") as f:
    json.dump(model, f, indent=2)
