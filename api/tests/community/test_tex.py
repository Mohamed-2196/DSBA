# ruff: noqa: RUF001 - formulas read with Greek letters and mathematical signs
"""Formulas as plain text (ST-52): what notifications, emails, excerpts and search snippets show for LaTeX."""

from __future__ import annotations

import pytest

from app.services.forum.tex import tex_to_text
from app.services.forum.text import excerpt, pictures, to_plain_text


@pytest.mark.parametrize(
    ("tex", "text"),
    [
        (r"x^2 - 4 > 0", "x² − 4 > 0"),
        (r"|x| > 2", "|x| > 2"),
        (r"\frac{a+b}{2}", "(a+b)/2"),
        (r"\frac{1}{\sqrt{2\pi\sigma^2}}", "1/√(2πσ²)"),
        (r"e^{-\frac{(x-\mu)^2}{2\sigma^2}}", "e^(−(x−μ)²/(2σ²))"),
        (r"\hat\beta = (X^TX)^{-1}X^Ty", "β̂ = (XᵀX)⁻¹Xᵀy"),
        (r"\sum_{i=1}^{n} x_i", "Σᵢ₌₁ⁿ xᵢ"),
        (r"P(X \le 3) \approx 0.65", "P(X ≤ 3) ≈ 0.65"),
        (r"\bar{x} \pm 1.96\frac{s}{\sqrt n}", "x̄ ± 1.96s/√n"),
        (r"\text{Var}(X) = \sigma^2", "Var(X) = σ²"),
        (r"\ln x", "ln x"),
        (r"\binom{n}{k} p^k", "C(n, k) pᵏ"),
        (r"\lim_{n\to\infty} \left(1+\frac{1}{n}\right)^n", "lim_(n→∞) (1+1/n)ⁿ"),
        (r"M_X(t) = E[e^{tX}]", "M_X(t) = E[e^(tX)]"),
        (r"\unknowncommand{x}", "unknowncommandx"),
        (r"\frac{1}{", "1/"),  # unfinished: no error, whatever was typed
    ],
)
def test_tex_to_text(tex: str, text: str) -> None:
    assert tex_to_text(tex) == text


def test_formulas_in_posts_read_as_text() -> None:
    reply = "ln needs a positive argument … $x^2 - 4 > 0$, so $|x| > 2$"
    assert excerpt(reply) == "ln needs a positive argument … x² − 4 > 0, so |x| > 2"
    assert to_plain_text("It costs $5 or $10.") == "It costs $5 or $10."  # prices aren't formulas
    block = "The density:\n\n$$\n\\frac{1}{\\theta} e^{-x/\\theta}\n$$\n\nfor x > 0."
    assert to_plain_text(block) == "The density: 1/θ e^(−x/θ) for x > 0."
    assert to_plain_text("$$\\int_0^1 x\\,dx$$") == "∫₀¹ x dx"
    assert pictures("$$![x](/api/v1/media/0b5a3f4e-8c1d-4c55-9a51-3d1c1c2b9e10)$$") == []
