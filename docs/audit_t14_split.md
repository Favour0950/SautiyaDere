# Task T14: Synthetic Data Integrity Verification & Split Report

This report documents the verification audit and train/test partition executed on [`data/synthetic/cases.jsonl`](file:///C:/Users/Violet/Desktop/github projects/SautiyaDere/data/synthetic/cases.jsonl) under Task T14.

---

## 1. Executive Summary

- **Total Benchmark Records Processed**: 150 records audited.
- **Schema Conformance**: 150/150 records validated with zero schema violations against [`data/schema.json`](file:///C:/Users/Violet/Desktop/github projects/SautiyaDere/data/schema.json).
- **Entity & PII Span Offset Verification**:
  - Total Named Entity Spans Audited: **512 spans** (`DATE`, `LOCATION`, `TIME`, `MONEY`, `TRIP_ID`).
  - Total PII Spans Audited: **68 spans** (`PLATE`, `PERSON`, `PHONE`, `MPESA_CODE`).
  - Misaligned Offsets / Adjustments Required: **0**. Every `narrative[start:end]` strictly matches `span["text"]` with zero character deviations and zero overlapping bounding spans.
- **Dataset Partitioning (Seed = 42)**:
  - [`data/synthetic/build_set.jsonl`](file:///C:/Users/Violet/Desktop/github projects/SautiyaDere/data/synthetic/build_set.jsonl): **110 records** allocated for model training, SetFit fine-tuning, and rule development.
  - [`data/synthetic/held_out_set.jsonl`](file:///C:/Users/Violet/Desktop/github projects/SautiyaDere/data/synthetic/held_out_set.jsonl): **40 records** reserved strictly for untouched evaluation of the 4 core dispute categories.

---

## 2. Entity Span & Schema Audit

### 2.1 Audit Methodology
Each case record was evaluated using two complementary checks:
1. **JSON Schema Validator (`data/validate.py`)**: Checked strict conformance with Draft 2020-12 specifications, regex constraints (`case_id: ^(SYN|REAL)-[0-9]{3,}$`, `policy_rules: ^[A-Z0-9_-]+$`), evidence enums, and mutual exclusivity between `evidence_held` and `evidence_missing`.
2. **Programmatic Substring Span Verification**:
   ```python
   for kind in ["entities", "pii"]:
       for span in record["labels"][kind]:
           assert record["narrative"][span["start"]:span["end"]] == span["text"]
   ```

### 2.2 Audit Findings
- **Schema Errors**: **0**.
- **Span Offset Corrections Made**: **None required**. The programmatic generator ([`data/generate.py`](file:///C:/Users/Violet/Desktop/github projects/SautiyaDere/data/generate.py)) computes character slice indices directly during template slot compilation, ensuring 100% precision.
- **Entity Label Counts (Across all 150 cases)**:
  - `DATE`: 150
  - `LOCATION`: 217
  - `TIME`: 56
  - `MONEY`: 75
  - `TRIP_ID`: 14
  - *Total Entities*: **512**
- **PII Label Counts (Across all 150 cases)**:
  - `PLATE`: 24
  - `PERSON`: 25
  - `PHONE`: 12
  - `MPESA_CODE`: 7
  - *Total PII*: **68**

---

## 3. Dataset Partition Breakdown

Partitioning was performed with a fixed random seed (`random.Random(42)`) stratified across dispute categories to ensure balanced representation.

### 3.1 Category Distribution

| Dispute Category | Total Cases | `build_set.jsonl` (Train/Dev) | `held_out_set.jsonl` (Eval) |
| :--- | :---: | :---: | :---: |
| `fare_dispute` | 35 | **25** (22.7%) | **10** (25.0%) |
| `passenger_safety` | 35 | **25** (22.7%) | **10** (25.0%) |
| `rating_or_cancellation` | 35 | **25** (22.7%) | **10** (25.0%) |
| `fraud_flag` | 35 | **25** (22.7%) | **10** (25.0%) |
| `out_of_scope` | 10 | **10** (9.1%) | **0** (0.0%) |
| **Total** | **150** | **110** (100%) | **40** (100%) |

*Note*: The 4 core dispute categories have an identical, perfectly balanced distribution in both partitions: **25 cases each** in `build_set.jsonl` and **10 cases each** in `held_out_set.jsonl`.

---

### 3.2 Platform & Language Representation

#### Platform Distribution
| Platform | `build_set.jsonl` | `held_out_set.jsonl` | Total |
| :--- | :---: | :---: | :---: |
| **Bolt** | 28 | 10 | 38 |
| **Uber** | 28 | 9 | 37 |
| **Little** | 29 | 9 | 38 |
| **Faras** | 25 | 12 | 37 |
| **Total** | **110** | **40** | **150** |

#### Language Distribution
| Language Mode | `build_set.jsonl` | `held_out_set.jsonl` | Total |
| :--- | :---: | :---: | :---: |
| **English** | 61 (55.5%) | 23 (57.5%) | 84 (56.0%) |
| **Mixed (Kenyan English / Swahili / Sheng)** | 49 (44.5%) | 17 (42.5%) | 66 (44.0%) |
| **Total** | **110** | **40** | **150** |

---

### 3.3 Extracted Span Counts by Partition

| Span Label | `build_set.jsonl` | `held_out_set.jsonl` | Total |
| :--- | :---: | :---: | :---: |
| **Entity: DATE** | 110 | 40 | 150 |
| **Entity: LOCATION** | 155 | 62 | 217 |
| **Entity: MONEY** | 53 | 22 | 75 |
| **Entity: TIME** | 41 | 15 | 56 |
| **Entity: TRIP_ID** | 13 | 1 | 14 |
| **PII: PLATE** | 18 | 6 | 24 |
| **PII: PERSON** | 20 | 5 | 25 |
| **PII: PHONE** | 7 | 5 | 12 |
| **PII: MPESA_CODE** | 4 | 3 | 7 |

---

## 4. Case ID Manifest for `held_out_set.jsonl`

The following 40 case records are strictly partitioned into [`data/synthetic/held_out_set.jsonl`](file:///C:/Users/Violet/Desktop/github projects/SautiyaDere/data/synthetic/held_out_set.jsonl):

- **`fare_dispute` (10 cases)**:
  `SYN-013`, `SYN-027`, `SYN-044`, `SYN-061`, `SYN-068`, `SYN-072`, `SYN-077`, `SYN-086`, `SYN-096`, `SYN-142`
- **`passenger_safety` (10 cases)**:
  `SYN-005`, `SYN-023`, `SYN-038`, `SYN-041`, `SYN-073`, `SYN-093`, `SYN-095`, `SYN-103`, `SYN-115`, `SYN-123`
- **`rating_or_cancellation` (10 cases)**:
  `SYN-002`, `SYN-003`, `SYN-007`, `SYN-026`, `SYN-036`, `SYN-037`, `SYN-039`, `SYN-067`, `SYN-108`, `SYN-139`
- **`fraud_flag` (10 cases)**:
  `SYN-009`, `SYN-011`, `SYN-028`, `SYN-030`, `SYN-033`, `SYN-040`, `SYN-051`, `SYN-062`, `SYN-090`, `SYN-125`

---

## 5. Verification Command Output

Validation executed via [`data/validate.py`](file:///C:/Users/Violet/Desktop/github projects/SautiyaDere/data/validate.py):
```bash
cd data
python validate.py synthetic/cases.jsonl synthetic/build_set.jsonl synthetic/held_out_set.jsonl
```
Output:
```
300/300 records valid
```

Unit tests executed via `pytest`:
```bash
cd data
python -m pytest
```
Output:
```
============================= 11 passed in 0.50s ==============================
```
