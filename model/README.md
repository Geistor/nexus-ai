# Model workflow

1. Collect journal-driven dataset automatically from the running bot
2. `retrain.py` trains a candidate model from `data/datasets/candidate_dataset.csv`
3. `evaluate.py` writes structured metrics for promotion
4. Candidate is promoted only if metrics are better

To convert Keras -> TensorFlow.js, install `tensorflowjs_converter` in your Python environment.
