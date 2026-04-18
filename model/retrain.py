import argparse, json, os
from train_lstm_pipeline import train

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--dataset', required=True)
    ap.add_argument('--outdir', required=True)
    args = ap.parse_args()
    os.makedirs(args.outdir, exist_ok=True)
    train(args.dataset, args.outdir)
    keras_model = os.path.join(args.outdir, 'model.keras')
    tfjs_dir = args.outdir
    code = os.system(f'tensorflowjs_converter --input_format=keras {keras_model} {tfjs_dir}')
    with open(os.path.join(args.outdir, 'retrain_result.json'), 'w', encoding='utf-8') as f:
        json.dump({'dataset': args.dataset, 'outdir': args.outdir, 'tfjs_conversion_exit_code': code}, f, indent=2)

if __name__ == '__main__':
    main()
