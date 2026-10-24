# Embedding recall spike (nomic-embed-text via Ollama)

Cards: 77 unique (75 eligible after dropping invocable_only, caveman, ponytail). Dev 129 cases (100 positive, 29 neutral), holdout 70 (52 positive, 18 neutral).
One query per case: prompt + all event signals + project summary. Doc variants: **a** = name+description+when_to_use, **b** = a + first 300 body words.
BM25 = existing scorer (unscored cards are not retrieved). hyb-z = z-score(BM25) + z-score(cosine), constants fit on dev pairs; hyb-rank = RRF-style 1/(60+rank) sum over both rankings.
Note: this is raw ranking recall with no thresholds, so it is not comparable to eval.js top1/hit (which also needs hi/lo/margin to fire). hyb-rank top-1 scores are rank-bounded, so its neutral AUC is not meaningful.
Selection on DEV only (mean recall over K): embedding variant -> **emb-b**, hybrid -> **hyb-z-b**. `*` = chosen.

## DEV recall (positives, n=100)

| method | R@1 | R@3 | R@5 | R@8 | R@10 |
|---|---|---|---|---|---|
| bm25 * | 0.610 | 0.740 | 0.800 | 0.830 | 0.830 |
| emb-a | 0.510 | 0.670 | 0.720 | 0.800 | 0.810 |
| hyb-z-a | 0.630 | 0.770 | 0.820 | 0.840 | 0.860 |
| hyb-rank-a | 0.580 | 0.760 | 0.790 | 0.830 | 0.840 |
| emb-b * | 0.580 | 0.740 | 0.750 | 0.810 | 0.830 |
| hyb-z-b * | 0.650 | 0.770 | 0.850 | 0.860 | 0.860 |
| hyb-rank-b | 0.620 | 0.760 | 0.800 | 0.840 | 0.870 |

## HOLDOUT recall (positives, n=52) - chosen methods

| method | R@1 | R@3 | R@5 | R@8 | R@10 |
|---|---|---|---|---|---|
| bm25 * | 0.558 | 0.692 | 0.769 | 0.808 | 0.827 |
| emb-b * | 0.577 | 0.731 | 0.808 | 0.865 | 0.865 |
| hyb-z-b * | 0.596 | 0.731 | 0.769 | 0.788 | 0.808 |

### Second look at the holdout - the non-chosen methods (not used for any decision)

| method | R@1 | R@3 | R@5 | R@8 | R@10 |
|---|---|---|---|---|---|
| emb-a | 0.481 | 0.615 | 0.712 | 0.750 | 0.788 |
| hyb-z-a | 0.577 | 0.731 | 0.788 | 0.788 | 0.788 |
| hyb-rank-a | 0.519 | 0.692 | 0.769 | 0.808 | 0.846 |
| hyb-rank-b | 0.615 | 0.712 | 0.769 | 0.827 | 0.827 |

## Neutral separation (top-1 score, positives vs neutrals)

Scores are on different scales per method; AUC = P(positive top-1 > neutral top-1).

**DEV**

| method | AUC | positive top-1 p10/25/50/75/90 | neutral top-1 p10/25/50/75/90 |
|---|---|---|---|
| bm25 | 0.745 | 2.475 / 4.448 / 7.055 / 11.508 / 16.794 | 0.000 / 2.043 / 4.247 / 5.339 / 8.268 |
| emb-a | 0.678 | 0.570 / 0.596 / 0.632 / 0.678 / 0.720 | 0.531 / 0.565 / 0.590 / 0.634 / 0.676 |
| hyb-z-a | 0.759 | 1.689 / 3.322 / 5.276 / 8.936 / 11.574 | -0.185 / 1.432 / 2.824 / 4.315 / 6.257 |
| hyb-rank-a | 0.649 | 0.031 / 0.032 / 0.033 / 0.033 / 0.033 | 0.017 / 0.032 / 0.033 / 0.033 / 0.033 |
| emb-b | 0.704 | 0.580 / 0.614 / 0.651 / 0.695 / 0.731 | 0.530 / 0.573 / 0.615 / 0.644 / 0.705 |
| hyb-z-b | 0.774 | 1.830 / 3.538 / 5.482 / 8.893 / 12.071 | -0.138 / 1.202 / 2.435 / 3.999 / 5.785 |
| hyb-rank-b | 0.750 | 0.031 / 0.033 / 0.033 / 0.033 / 0.033 | 0.017 / 0.031 / 0.032 / 0.033 / 0.033 |

**HOLDOUT**

| method | AUC | positive top-1 p10/25/50/75/90 | neutral top-1 p10/25/50/75/90 |
|---|---|---|---|
| bm25 | 0.756 | 4.150 / 6.383 / 8.547 / 12.194 / 16.420 | 2.271 / 4.408 / 5.530 / 6.925 / 9.200 |
| emb-a | 0.706 | 0.577 / 0.608 / 0.636 / 0.668 / 0.703 | 0.564 / 0.575 / 0.602 / 0.633 / 0.672 |
| hyb-z-a | 0.759 | 3.020 / 4.178 / 6.335 / 9.040 / 11.478 | 0.672 / 2.774 / 4.151 / 4.875 / 6.913 |
| hyb-rank-a | 0.585 | 0.031 / 0.032 / 0.033 / 0.033 / 0.033 | 0.031 / 0.032 / 0.033 / 0.033 / 0.033 |
| emb-b | 0.726 | 0.597 / 0.627 / 0.658 / 0.694 / 0.733 | 0.567 / 0.583 / 0.611 / 0.655 / 0.704 |
| hyb-z-b | 0.778 | 3.193 / 4.490 / 6.636 / 9.749 / 11.848 | 0.403 / 2.820 / 4.034 / 4.982 / 6.508 |
| hyb-rank-b | 0.649 | 0.031 / 0.032 / 0.033 / 0.033 / 0.033 | 0.030 / 0.032 / 0.033 / 0.033 / 0.033 |

## Stitch / replicate-design cases (rank of first expected skill; miss = not retrieved)

**DEV**

| case | expect | bm25 | emb-a | emb-b | hyb-z-b |
|---|---|---|---|---|---|
| stitch-to-frontend | frontend-design, design-taste, better-design | 1 | 2 | 1 | 1 |
| stitch-generate-onboarding | frontend-design, design-taste, better-design | 3 | 4 | 1 | 3 |

**HOLDOUT**

| case | expect | bm25 | emb-a | emb-b | hyb-z-b |
|---|---|---|---|---|---|
| h-t-stitch-next-screen | better-design, frontend-design | 4 | 10 | 6 | 7 |
| h-t-stitch-to-code | frontend-design, better-design, taste-code-craft | 1 | 1 | 1 | 1 |
| h-t-stitch-design-system | taste-design-system, better-design, taste-color, taste-typography | 1 | 1 | 1 | 1 |

## Query latency

Single `/api/embed` query, warm, median of 20: **13.1 ms** (min 12.0, max 18.5).
