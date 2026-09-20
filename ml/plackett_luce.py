"""Plackett-Luce loss over Claude's top-5 ranking.

WHY THIS LOSS. Claude gave, per song, an ordered top 5 out of 41 categories plus
scores that bunch between 65 and 80. The scores are not probabilities and the
bunching is not meaningful, but the ORDER is, and so is "everything outside the
top 5 ranked lower". Plackett-Luce uses exactly that and nothing else, which is
exactly the censored information available. It is also why we do NOT train 41
independent yes/no heads (that throws the order away and treats an unlisted
category as a confident "no") and why a missing score is never read as a zero.

THE MODEL. Draw categories from a bag one at a time. While category c is still
in the bag its chance of being drawn next is proportional to exp(u_c). Once
drawn it leaves. The probability of Claude's exact top 5 is

    P(c1..c5) = prod over j of  exp(u_cj) / sum over c still in the bag exp(u_c)

and the loss is the negative log of that:

    L = -sum over j of [ u_cj - logsumexp over the remaining bag of u ]

THE GRADIENT, in words: for each category, add up the probability it was given
at each stage while it was still in the bag, then subtract 1 if Claude actually
picked it. Chosen categories get pushed up, unchosen pushed down, and the whole
vector sums to zero. That is the sentence to say at a whiteboard.

The worked example in `self_test` is the 4-category one from the S1 write-up,
computed here by hand and checked against the implementation.
"""

from __future__ import annotations

import torch
import torch.nn.functional as F


def plackett_luce_loss(
    scores: torch.Tensor, ranking: torch.Tensor, mask: torch.Tensor | None = None
) -> torch.Tensor:
    """Mean negative log-likelihood of each row's observed ordering.

    scores : (B, C) utilities, one per category
    ranking: (B, K) category indices in Claude's order, -1 to pad a short list
    mask   : (B, K) optional bool; computed from ranking >= 0 when omitted
    """
    b, c = scores.shape
    k = ranking.shape[1]
    if mask is None:
        mask = ranking >= 0
    safe = ranking.clamp(min=0)

    # available[j] marks the bag BEFORE the j-th draw: everything not yet taken.
    available = scores.new_ones((b, c), dtype=torch.bool)
    total = scores.new_zeros(())
    count = scores.new_zeros(())
    for j in range(k):
        step = mask[:, j]
        if not bool(step.any()):
            break
        # log-denominator over the current bag; -inf removes drawn categories.
        bag = scores.masked_fill(~available, float("-inf"))
        denom = torch.logsumexp(bag, dim=1)
        chosen = scores.gather(1, safe[:, j : j + 1]).squeeze(1)
        total = total + ((denom - chosen) * step).sum()
        count = count + step.sum()
        # remove the drawn category from the bag for the next step
        available = available.scatter(1, safe[:, j : j + 1], False)
    return total / count.clamp(min=1)


def self_test() -> None:
    """The 4-category example from the write-up, by hand and by code.

    Utilities A=2, B=1, C=0, D=0; Claude's order is A then B.
      P(A first)          = e^2 / (e^2 + e + 1 + 1) = 7.389 / 12.107 = 0.6103
      P(B second | A out) = e   / (e + 1 + 1)       = 2.718 /  4.718 = 0.5762
      product = 0.3517  ->  loss = -log(0.3517) = 1.0450
    Gradient on A = 0.6103 - 1 = -0.3897.
    Gradient on B = 0.2247 + 0.5762 - 1 = -0.1991.
    C and D each  = 0.0826 + 0.2119 = +0.2945.  (sums to ~0)
    """
    import math

    scores = torch.tensor([[2.0, 1.0, 0.0, 0.0]], requires_grad=True)
    ranking = torch.tensor([[0, 1]])

    p1 = math.exp(2) / (math.exp(2) + math.exp(1) + 2)
    p2 = math.exp(1) / (math.exp(1) + 2)
    by_hand = -math.log(p1 * p2)

    loss = plackett_luce_loss(scores, ranking)
    # The loss averages over the 2 draws; the hand figure is their sum.
    got = float(loss) * 2
    print(f"  P(A first)           = {p1:.4f}   (write-up: 0.61)")
    print(f"  P(B second, A gone)  = {p2:.4f}   (write-up: 0.58)")
    print(f"  loss by hand         = {by_hand:.4f}   (write-up: 1.05)")
    print(f"  loss from the code   = {got:.4f}")
    assert abs(got - by_hand) < 1e-5, (got, by_hand)

    loss.backward()
    g = (scores.grad * 2)[0]  # undo the averaging to compare with the hand figures
    hand_g = [
        p1 - 1,
        (math.exp(1) / (math.exp(2) + math.exp(1) + 2)) + p2 - 1,
        (1 / (math.exp(2) + math.exp(1) + 2)) + (1 / (math.exp(1) + 2)),
        (1 / (math.exp(2) + math.exp(1) + 2)) + (1 / (math.exp(1) + 2)),
    ]
    print(f"  gradient by hand     = {[f'{v:+.4f}' for v in hand_g]}")
    print(f"  gradient from code   = {[f'{v:+.4f}' for v in g.tolist()]}")
    for a, b in zip(g.tolist(), hand_g):
        assert abs(a - b) < 1e-5, (a, b)
    print(f"  gradient sums to     = {float(g.sum()):+.6f}  (must be ~0)")

    # A ranking that is already in utility order must cost less than a reversed one.
    s = torch.tensor([[3.0, 2.0, 1.0, 0.0]])
    good = float(plackett_luce_loss(s, torch.tensor([[0, 1, 2]])))
    bad = float(plackett_luce_loss(s, torch.tensor([[3, 2, 1]])))
    print(f"\n  loss on the model's own order : {good:.4f}")
    print(f"  loss on the reversed order    : {bad:.4f}")
    assert good < bad

    # Padding must be ignored, not treated as category 0.
    padded = plackett_luce_loss(
        torch.tensor([[1.0, 2.0, 3.0]]), torch.tensor([[2, -1, -1]])
    )
    single = plackett_luce_loss(torch.tensor([[1.0, 2.0, 3.0]]), torch.tensor([[2]]))
    assert abs(float(padded) - float(single)) < 1e-6
    print("  padded ranking == unpadded: yes")
    print("\nALL PLACKETT-LUCE CHECKS PASS")


if __name__ == "__main__":
    self_test()
