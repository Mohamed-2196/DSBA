# ruff: noqa: RUF001, RUF002 - this module is about Greek letters and mathematical signs
"""Formulas as plain text: what a notification, an email, an excerpt or a search snippet shows for the LaTeX a post
holds ($x^2 - 4 > 0$ reads "x² − 4 > 0"). The web app sets formulas with KaTeX; plain text can't, so this writes
them the way a student would type them on a phone: Unicode letters, operators, superscripts and subscripts where
they exist, a/b for a fraction, √ for a root, and the words of \\text{…} and \\ln as they are.

Anything it doesn't know keeps its name without the backslash (\\binom reads "binom"), so nothing reads as code."""

from __future__ import annotations

import re

SYMBOLS: dict[str, str] = {
    # Greek
    "alpha": "α",
    "beta": "β",
    "gamma": "γ",
    "delta": "δ",
    "epsilon": "ε",
    "varepsilon": "ε",
    "zeta": "ζ",
    "eta": "η",
    "theta": "θ",
    "vartheta": "θ",
    "iota": "ι",
    "kappa": "κ",
    "lambda": "λ",
    "mu": "μ",
    "nu": "ν",
    "xi": "ξ",
    "pi": "π",
    "rho": "ρ",
    "sigma": "σ",
    "tau": "τ",
    "upsilon": "υ",
    "phi": "φ",
    "varphi": "φ",
    "chi": "χ",
    "psi": "ψ",
    "omega": "ω",
    "Gamma": "Γ",
    "Delta": "Δ",
    "Theta": "Θ",
    "Lambda": "Λ",
    "Xi": "Ξ",
    "Pi": "Π",
    "Sigma": "Σ",
    "Phi": "Φ",
    "Psi": "Ψ",
    "Omega": "Ω",
    # relations and operators
    "le": "≤",
    "leq": "≤",
    "ge": "≥",
    "geq": "≥",
    "ne": "≠",
    "neq": "≠",
    "approx": "≈",
    "sim": "~",
    "equiv": "≡",
    "propto": "∝",
    "times": "×",
    "cdot": "·",
    "div": "÷",
    "pm": "±",
    "mp": "∓",
    "infty": "∞",
    "sum": "Σ",
    "prod": "∏",
    "int": "∫",
    "partial": "∂",
    "nabla": "∇",
    "to": "→",
    "rightarrow": "→",
    "leftarrow": "←",
    "Rightarrow": "⇒",
    "implies": "⇒",
    "Leftrightarrow": "⇔",
    "iff": "⇔",
    "in": "∈",
    "notin": "∉",
    "subset": "⊂",
    "subseteq": "⊆",
    "cup": "∪",
    "cap": "∩",
    "emptyset": "∅",
    "forall": "∀",
    "exists": "∃",
    "neg": "¬",
    "land": "∧",
    "lor": "∨",
    "ldots": "…",
    "cdots": "⋯",
    "dots": "…",
    "mid": "|",
    "vert": "|",
    "lvert": "|",
    "rvert": "|",
    "Vert": "‖",
    "langle": "⟨",
    "rangle": "⟩",
    "lfloor": "⌊",
    "rfloor": "⌋",
    "lceil": "⌈",
    "rceil": "⌉",
    "prime": "′",
    "circ": "∘",
    "degree": "°",
    "left": "",
    "right": "",
    "big": "",
    "Big": "",
    "bigg": "",
    "Bigg": "",
    "displaystyle": "",
    "limits": "",
    "nolimits": "",
    # spacing
    ",": " ",
    ";": " ",
    ":": " ",
    "!": "",
    " ": " ",
    "quad": " ",
    "qquad": " ",
    # escaped characters
    "{": "{",
    "}": "}",
    "%": "%",
    "$": "$",
    "&": "&",
    "#": "#",
    "_": "_",
    "\\": " ",
}
# Commands whose argument is the text itself: \text{if } x > 0, \mathbf{X}.
TEXT_COMMANDS = {
    "text",
    "textrm",
    "textbf",
    "textit",
    "mathrm",
    "mathbf",
    "mathit",
    "mathsf",
    "mathbb",
    "mathcal",
    "operatorname",
    "boldsymbol",
    "overline",
    "underline",
}
# Accents: a combining mark over a single letter (\hat\beta reads "β̂"), nothing over more.
ACCENTS = {"hat": "\u0302", "widehat": "\u0302", "bar": "\u0304", "tilde": "\u0303", "vec": "\u20d7", "dot": "\u0307"}
_SUP_FROM, _SUB_FROM = "0123456789+−=()nijkTt", "0123456789+−=()aeijknmortx"
SUPERSCRIPTS = str.maketrans(_SUP_FROM, "⁰¹²³⁴⁵⁶⁷⁸⁹⁺⁻⁼⁽⁾ⁿⁱʲᵏᵀᵗ")
SUBSCRIPTS = str.maketrans(_SUB_FROM, "₀₁₂₃₄₅₆₇₈₉₊₋₌₍₎ₐₑᵢⱼₖₙₘₒᵣₜₓ")
_SUP_CHARS, _SUB_CHARS = set(_SUP_FROM), set(_SUB_FROM)
_SCRIPTED = set("⁰¹²³⁴⁵⁶⁷⁸⁹⁺⁻⁼⁽⁾ⁿⁱʲᵏᵀᵗ₀₁₂₃₄₅₆₇₈₉₊₋₌₍₎ₐₑᵢⱼₖₙₘₒᵣₜₓ")
_NUMBER = re.compile(r"[\d.]+")


class _Reader:
    def __init__(self, src: str) -> None:
        self.src = src
        self.i = 0

    def more(self) -> bool:
        return self.i < len(self.src)

    def peek(self) -> str:
        return self.src[self.i] if self.more() else ""

    def take(self) -> str:
        ch = self.peek()
        self.i += 1
        return ch

    def skip_spaces(self) -> None:
        while self.more() and self.src[self.i].isspace():
            self.i += 1

    def command(self) -> str:
        """After a backslash: a run of letters, or one other character."""
        if not self.more():
            return ""
        if not self.peek().isalpha():
            return self.take()
        start = self.i
        while self.more() and self.src[self.i].isalpha():
            self.i += 1
        return self.src[start : self.i]

    def argument(self) -> str:
        """The next argument as plain text: a {group}, a command, or one character."""
        self.skip_spaces()
        if not self.more():
            return ""
        if self.peek() == "{":
            self.take()
            return self.until_close()
        if self.peek() == "\\":
            self.take()
            return self.one_command(self.command())
        return self.take()

    def until_close(self) -> str:
        """Plain text up to the matching } (or the end)."""
        out: list[str] = []
        while self.more():
            if self.peek() == "}":
                self.take()
                break
            out.append(self.token())
        return "".join(out)

    def one_command(self, name: str) -> str:
        if name in ("frac", "dfrac", "tfrac"):
            top, bottom = self.argument(), self.argument()
            return f"{_grouped(top)}/{_grouped(bottom)}"
        if name in ("binom", "dbinom", "tbinom"):
            n, k = self.argument(), self.argument()
            return f"C({n.strip()}, {k.strip()})"
        if name == "sqrt":
            self.skip_spaces()
            degree = ""
            if self.peek() == "[":
                self.take()
                start = self.i
                while self.more() and self.peek() != "]":
                    self.i += 1
                degree = self.src[start : self.i]
                self.take()
            inside = self.argument()
            root = "√" if not degree else ("∛" if degree == "3" else f"{degree}√")
            return root + _grouped(inside)
        if name in TEXT_COMMANDS:
            return self.argument()
        if name in ACCENTS:
            inside = self.argument()
            return inside + ACCENTS[name] if len(inside) == 1 else inside
        if name in SYMBOLS:
            return SYMBOLS[name]
        return name  # \ln, \log, \exp, \sin, \max, \lim, \Pr, and anything unknown: its name

    def script(self, sup: bool) -> str:
        body = self.argument()
        chars, table, mark = (_SUP_CHARS, SUPERSCRIPTS, "^") if sup else (_SUB_CHARS, SUBSCRIPTS, "_")
        if body and all(c in chars for c in body):
            return body.translate(table)
        return f"{mark}{_grouped(body)}" if body else ""

    def token(self) -> str:
        ch = self.take()
        if ch == "\\":
            return self.one_command(self.command())
        if ch == "{":
            return self.until_close()
        if ch == "}":
            return ""
        if ch == "^":
            return self.script(sup=True)
        if ch == "_":
            return self.script(sup=False)
        if ch == "-":
            return "−"
        if ch == "&":
            return " "
        if ch == "~":
            return " "
        return ch


def _wrapped(t: str) -> bool:
    """`t` is one bracketed group: (…) with its brackets matching each other."""
    if not (t.startswith("(") and t.endswith(")")):
        return False
    depth = 0
    for n, ch in enumerate(t):
        depth += {"(": 1, ")": -1}.get(ch, 0)
        if depth == 0 and n < len(t) - 1:
            return False
    return True


def _grouped(text: str) -> str:
    """`text` as one term: in brackets unless it is a number, one symbol (with its scripts: x², σᵢ) or bracketed
    already."""
    t = text.strip()
    core = "".join(c for c in t if c not in _SCRIPTED).lstrip("√∛")  # a root is one term
    simple = bool(_NUMBER.fullmatch(t)) or len(core) <= 1 or _wrapped(core)
    return t if simple else f"({t})"


def tex_to_text(tex: str) -> str:
    """A LaTeX formula (without its $ signs) as readable plain text on one line."""
    r = _Reader(tex)
    out: list[str] = []
    while r.more():
        out.append(r.token())
    return " ".join("".join(out).split())
