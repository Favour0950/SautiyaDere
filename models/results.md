Markdown
# Sauti ya Dere — Empirical Classifier Benchmark & Evaluation Report (Sprint 2 & 3)

## 1. Executive Summary

To determine the dispute triage classifier for Kenyan ride-hailing recourse under NTSA Legal Notice 120, we evaluated four distinct classification paradigms across 100 build cases (`data/synthetic/build_set.jsonl`) and verified generalization performance against 40 unseen held-out cases (`data/synthetic/held_out_set.jsonl`).

                     data/synthetic/build_set.jsonl (100 cases)
                                   │
 ┌──────────────────┬──────────────┴─────┬─────────────────┐
 ▼                  ▼                    ▼                 ▼
Keyword Baseline   Zero-Shot DeBERTa    Gemini Flash       SetFit Few-Shot
(62.0% Acc)        (70.0% Acc)        (91.0% Acc)         (95.0% Acc)


---

## 2. Benchmark Comparison (Build Set — 100 Cases)

| Architecture | Task ID | Paradigm | Accuracy | Macro F1 | Latency / Compute Profile |
| :--- | :---: | :--- | :---: | :---: | :--- |
| **Keyword Rules Baseline** | T20 | Rule-based regex dictionary | 0.620 | 0.556 | < 1ms; misses local Sheng and nuance. |
| **Zero-Shot DeBERTa-v3** | T21 | Cross-encoder NLI inference | 0.700 | 0.679 | ~180ms; GPU dependent, misclassifies conduct flags. |
| **Gemini Flash (Prompted)** | T23 | Zero-shot structured LLM JSON | 0.910 | 0.904 | ~850ms; API/network bound, strong reasoning. |
| **SetFit Few-Shot (bge-small)** | T22 | Contrastive Sentence Transformer | **0.950** | **0.950** | **~25ms; CPU/GPU capable, private on-device/server execution.** |

---

## 3. Generalization Performance on Held-Out Test Set (40 Unseen Cases)

Evaluating the winning SetFit model on the untouched 40-case held-out partition confirmed consistent generalization:

- **Overall Accuracy**: **97.5%** (39 / 40 correct)
- **Macro-Averaged F1**: **0.975**
- **Weighted-Averaged F1**: **0.975**

### Classification Report (Held-Out Test Set)
```text
                        precision    recall  f1-score   support

          fare_dispute       0.91      1.00      0.95        10
            fraud_flag       1.00      1.00      1.00        10
      passenger_safety       1.00      0.90      0.95        10
rating_or_cancellation       1.00      1.00      1.00        10

              accuracy                           0.97        40
             macro avg       0.98      0.97      0.97        40
          weighted avg       0.98      0.97      0.97        40
Confusion Matrix (Held-Out Test Set)
Plaintext
Actual \ Predicted       fare_dispute   fraud_flag   passenger_safety   rating_or_cancellation
fare_dispute                  10            0               0                     0
fraud_flag                     0           10               0                     0
passenger_safety               1            0               9                     0
rating_or_cancellation         0            0               0                    10