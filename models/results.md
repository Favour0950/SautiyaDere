# Sauti ya Dere — Model Comparison & Benchmark Results (Sprint 2)

## 1. Benchmark Summary (Build Set — 100 Cases)

| Model Architecture | Task ID | Accuracy | Macro F1 | Deployment Consideration |
| :--- | :--- | :---: | :---: | :--- |
| **Keyword Rules Baseline** | T20 | 0.620 | 0.556 | Lightweight regex floor; misses context. |
| **Zero-Shot DeBERTa-v3** | T21 | 0.700 | 0.679 | Out-of-the-box NLI; no custom training. |
| **SetFit Few-Shot (BAAI/bge-small)** | T22 | **0.950** | **0.950** | **Winning Model**. High accuracy with 8 examples/class. |
| **Gemini Flash (Zero-Shot JSON)** | T23 | 0.250* | 0.100* | Fallback baseline under API rate limits. |

---

## 2. Winning Model Breakdown: SetFit (Few-Shot)

```text
                        precision    recall  f1-score   support

          fare_dispute       0.92      0.88      0.90        25
            fraud_flag       1.00      1.00      1.00        25
      passenger_safety       0.88      0.92      0.90        25
rating_or_cancellation       1.00      1.00      1.00        25

              accuracy                           0.95       100
             macro avg       0.95      0.95      0.95       100
          weighted avg       0.95      0.95      0.95       100