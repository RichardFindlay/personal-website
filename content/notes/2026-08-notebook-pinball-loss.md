---
title: Notebook: the pinball loss in a dozen lines
summary: The loss behind every quantile forecast, written out, with the one property that makes it work and the mistake people make when they average it.
date: 2026-08-14
tags: forecasting, ai
kind: essay
sample: true
---

A probabilistic forecast is only as honest as the loss it was trained on. For quantiles, that loss is the pinball (or quantile) loss. For a target $y$, a prediction $\hat{y}$ and a quantile level $\tau \in (0, 1)$:

$$
L_\tau(y, \hat{y}) = \begin{cases} \tau\,(y - \hat{y}) & y \ge \hat{y} \\ (1 - \tau)\,(\hat{y} - y) & y < \hat{y} \end{cases}
$$

Under-predicting is penalised in proportion to $\tau$, over-predicting in proportion to $1 - \tau$. Minimising the expectation of that asymmetric penalty gives the $\tau$-quantile of the conditional distribution, which is the whole trick.

```python
import torch

def pinball(y, y_hat, taus):
    """y: (n,), y_hat: (n, k), taus: (k,) quantile levels in (0, 1)."""
    err = y[:, None] - y_hat
    return torch.maximum(taus * err, (taus - 1) * err).mean()
```

Two things worth knowing before you ship one:

1. **Quantiles cross.** Nothing in the loss stops the 0.4 quantile landing above the 0.6 one. Sort the outputs at inference, or parameterise the gaps between quantiles as non-negative.
2. **Averaging across levels hides tail errors.** A model can score well on the mean pinball loss by nailing the median and shrugging at the 0.05 and 0.95 levels, which are the ones a trader sizes against. Report the loss per level.

> Sample post, included so the mock-up shows code and maths in the writing section.
