import numpy as np
import pandas as pd
from tensorflow import keras
from sklearn.model_selection import train_test_split

SEQ_LEN = 32
HORIZON = 3
MODEL_OUT = "model.keras"

def ema(arr, period):
    return pd.Series(arr).ewm(span=period, adjust=False).mean().values

def rsi(arr, period=14):
    s = pd.Series(arr)
    delta = s.diff()
    up = delta.clip(lower=0).ewm(alpha=1/period, adjust=False).mean()
    down = (-delta.clip(upper=0)).ewm(alpha=1/period, adjust=False).mean()
    rs = up / down.replace(0, np.nan)
    out = 100 - (100 / (1 + rs))
    return out.fillna(50).values

def atr(high, low, close, period=14):
    high = pd.Series(high); low = pd.Series(low); close = pd.Series(close)
    prev_close = close.shift(1)
    tr = pd.concat([(high - low), (high - prev_close).abs(), (low - prev_close).abs()], axis=1).max(axis=1)
    return tr.ewm(alpha=1/period, adjust=False).mean().bfill().values

def build_features(df):
    out = df.copy()
    out["ret1"] = out["close"].pct_change().fillna(0.0)
    out["ret3"] = out["close"].pct_change(3).fillna(0.0)
    out["ema20"] = ema(out["close"].values, 20)
    out["ema50"] = ema(out["close"].values, 50)
    out["ema_spread"] = (out["ema20"] - out["ema50"]) / out["close"]
    out["rsi14"] = rsi(out["close"].values, 14) / 100.0
    out["atr14"] = atr(out["high"].values, out["low"].values, out["close"].values, 14) / out["close"]
    out["vol_z"] = ((out["volume"] - out["volume"].rolling(20).mean()) / out["volume"].rolling(20).std().replace(0, np.nan)).fillna(0.0).clip(-5, 5)
    keep = ["close", "rsi14", "ema20", "ema50", "ema_spread", "atr14", "vol_z", "ret1"]
    return out[keep].replace([np.inf, -np.inf], 0.0).fillna(0.0)

def build_labels(close, horizon=HORIZON, threshold=0.0015):
    future_ret = (np.roll(close, -horizon) - close) / close
    y = np.full(len(close), 2)
    y[future_ret > threshold] = 0
    y[future_ret < -threshold] = 1
    y[-horizon:] = 2
    return y

def make_sequences(X, y, seq_len=SEQ_LEN):
    xs, ys = [], []
    for i in range(seq_len, len(X)):
        xs.append(X[i-seq_len:i]); ys.append(y[i])
    return np.array(xs, dtype=np.float32), np.array(ys, dtype=np.int32)

def make_model(input_shape, num_classes=3):
    model = keras.Sequential([
        keras.layers.Input(shape=input_shape),
        keras.layers.LayerNormalization(),
        keras.layers.LSTM(64, return_sequences=True),
        keras.layers.Dropout(0.2),
        keras.layers.LSTM(32),
        keras.layers.Dense(32, activation="relu"),
        keras.layers.Dropout(0.2),
        keras.layers.Dense(num_classes, activation="softmax"),
    ])
    model.compile(optimizer=keras.optimizers.Adam(1e-3), loss="sparse_categorical_crossentropy", metrics=["accuracy"])
    return model

def main():
    df = pd.read_csv("ohlcv.csv")
    Xdf = build_features(df)
    y = build_labels(df["close"].values)
    X, y = make_sequences(Xdf.values, y, SEQ_LEN)
    X_train, X_val, y_train, y_val = train_test_split(X, y, test_size=0.2, shuffle=False)

    model = make_model((X.shape[1], X.shape[2]))
    callbacks = [
        keras.callbacks.EarlyStopping(monitor="val_loss", patience=5, restore_best_weights=True),
        keras.callbacks.ModelCheckpoint(MODEL_OUT, monitor="val_loss", save_best_only=True)
    ]
    model.fit(X_train, y_train, validation_data=(X_val, y_val), epochs=40, batch_size=64, callbacks=callbacks, verbose=1)
    model.save(MODEL_OUT)

if __name__ == "__main__":
    main()
