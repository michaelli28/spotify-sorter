# SPIKE: deterministic two-drum risograph cover per category, pure SVG, no libraries.
# Reference implementation for brief.md's algorithm; the TS port is line-for-line.
#   seed        = fnv1a32(id + "|" + name)            -> renaming reprints the sleeve
#   temperature = cue words in the name (description only when the name has none)
#   ink A       = the temperature's one ink (dusk violet, charge pink, glow yellow, haze aqua): colour = meaning
#   ink B, motif, geometry = the category's own identity; clashes in catalogue order are bumped
from __future__ import annotations

import re
from collections import Counter, defaultdict
from dataclasses import dataclass

# Riso-ink approximations (OKLCH). Orange is absent: it is the action ink.
INKS: dict[str, str] = {
    "yellow": "oklch(0.915 0.175 103)",
    "pink": "oklch(0.68 0.215 355)",
    "red": "oklch(0.64 0.185 20)",
    "aqua": "oklch(0.78 0.10 222)",
    "teal": "oklch(0.555 0.090 200)",
    "violet": "oklch(0.62 0.13 300)",
    "mblue": "oklch(0.48 0.14 264)",
    "fblue": "oklch(0.44 0.09 264)",
    "burgundy": "oklch(0.48 0.10 345)",
}

# Temperature = the light the category plays in. Order matters only for ties.
TEMPS = ("dusk", "charge", "glow", "haze")
CUES: dict[str, tuple[str, ...]] = {
    "dusk": ("dark", "moody", "brood", "melanchol", "heartbreak", "pain", "turmoil", "witch", "eerie",
             "gothic", "aggressive", "heavy", "metal", "phonk", "drift", "emo", "angst", "shoegaze"),
    "charge": ("edm", "festival", "anthem", "euphoric", "hyperpop", "glitch", "chaotic", "trap", "banger",
               "dubstep", "bass", "trance", "nightcore", "sped", "energy", "techno", "hypnotic", "epic",
               "cinematic", "synthwave", "stutter", "punk"),
    "glow": ("sunset", "tropical", "summer", "groov", "soul", "latin", "afro", "dance", "infectious",
             "slap", "k-pop", "j-pop", "global", "inspirational", "uplifting", "celebrat", "rock"),
    "haze": ("dream", "ethereal", "ambient", "lo-fi", "chill", "relax", "soft", "bedroom", "intimate",
             "acoustic", "folk", "piano", "neoclassical", "slowed", "reverb", "nostalg", "ballad",
             "classical", "gufeng", "introspect", "songwriter", "storytelling", "vaporwave"),
}
# Drum A (light, printed first): one per temperature, so a tab's colour answers "what does yellow mean?".
TEMP_INK: dict[str, str] = {"dusk": "violet", "charge": "pink", "glow": "yellow", "haze": "aqua"}
# Drum B (dark, overprinted with multiply): four per temperature, all darker than that temperature's A.
B_INKS: dict[str, tuple[str, str, str, str]] = {
    "dusk": ("fblue", "burgundy", "mblue", "teal"),
    "charge": ("mblue", "fblue", "violet", "teal"),
    "glow": ("red", "pink", "burgundy", "teal"),
    "haze": ("mblue", "violet", "teal", "pink"),
}
# Shop-native shapes only. None may read as a chart: every bar on these pages is data.
MOTIFS: tuple[str, ...] = ("groove", "split", "sleeves", "waves", "pull", "spines")
MOTIF_CAP = 7  # 6 motifs x 7 = 42 slots; beyond that the cap lifts to the least-used motif

PAPER = "oklch(0.978 0.010 90)"  # a sleeve's own stock: it stays light on the night stock too


def fnv1a32(text: str) -> int:
    h = 0x811C9DC5
    for ch in text:  # UTF-16 code units == ord() for BMP text, matching JS charCodeAt
        h ^= ord(ch) & 0xFFFF
        h = (h * 0x01000193) & 0xFFFFFFFF
    return h


def mulberry32(seed: int):
    state = seed & 0xFFFFFFFF

    def rand() -> float:
        nonlocal state
        state = (state + 0x6D2B79F5) & 0xFFFFFFFF
        t = ((state ^ (state >> 15)) * (1 | state)) & 0xFFFFFFFF
        t = ((t + (((t ^ (t >> 7)) * (61 | t)) & 0xFFFFFFFF)) & 0xFFFFFFFF) ^ t
        return ((t ^ (t >> 14)) & 0xFFFFFFFF) / 4294967296

    return rand


def _score(text: str) -> dict[str, int]:
    low = text.lower()
    return {t: sum(1 for cue in CUES[t] if re.search(r"(?<![a-z])" + re.escape(cue), low)) for t in TEMPS}


def temperature(name: str, description: str, seed: int) -> str:
    s = _score(name)
    if max(s.values()) == 0:
        s = _score(description)
    best = max(s.values())
    if best == 0:
        return TEMPS[seed % 4]
    return next(t for t in TEMPS if s[t] == best)


@dataclass(frozen=True)
class CoverSpec:
    seed: int
    temp: str
    ink_a: str
    ink_b: str
    motif: str
    turn: int
    dx: float
    dy: float


def _candidate(seed: int, temp: str, bump: int) -> tuple[str, str]:
    """A bump walks the motif first, then ink B, so a clash never changes the temperature's ink A."""
    motif = MOTIFS[((seed >> 16) % len(MOTIFS) + bump) % len(MOTIFS)]
    ink_b = B_INKS[temp][(((seed >> 6) & 3) + bump // len(MOTIFS)) & 3]
    return motif, ink_b


def _spec(seed: int, temp: str, motif: str, ink_b: str) -> CoverSpec:
    rand = mulberry32(seed)
    offsets = (-2.4, -1.6, 1.6, 2.4)
    dx = offsets[int(rand() * 4)]
    dy = offsets[int(rand() * 4)]
    turn = (seed >> 26) % 4
    if motif == "spines":
        turn &= 2  # records stand up: lying on their side, spines read as a striped list
    return CoverSpec(seed, temp, TEMP_INK[temp], ink_b, motif, turn, dx, dy)


def spec_for(cat_id: str, name: str, description: str = "", bump: int = 0) -> CoverSpec:
    seed = fnv1a32(f"{cat_id}|{name}")
    temp = temperature(name, description, seed)
    motif, ink_b = _candidate(seed, temp, bump)
    return _spec(seed, temp, motif, ink_b)


_SPECS: dict[str, CoverSpec] = {}


def catalogue_specs(cats: list[dict]) -> dict[str, CoverSpec]:
    """Walk the catalogue in index order. Each category takes, of its 24 (motif, ink B) candidates:
    - never a (temperature, motif, ink B) an earlier category holds, and never a motif already used 7 times;
    - among the rest, the motif its temperature has used least so far (so same-coloured sleeves differ in shape),
      then the smallest bump.
    Adding a category never reprints an existing one: it only reads what came before it."""
    held: set[tuple[str, str, str]] = set()
    per_motif: Counter[str] = Counter()
    per_temp: defaultdict[str, Counter[str]] = defaultdict(Counter)
    out: dict[str, CoverSpec] = {}
    for c in cats:
        seed = fnv1a32(f"{c['id']}|{c['name']}")
        temp = temperature(c["name"], c.get("description", ""), seed)
        cap = MOTIF_CAP if min(per_motif[m] for m in MOTIFS) < MOTIF_CAP else min(per_motif.values()) + 1
        best: tuple[tuple[int, int], str, str] | None = None
        for bump in range(len(MOTIFS) * 4):
            motif, ink_b = _candidate(seed, temp, bump)
            if (temp, motif, ink_b) in held or per_motif[motif] >= cap:
                continue
            key = (per_temp[temp][motif], bump)
            if best is None or key < best[0]:
                best = (key, motif, ink_b)
        assert best is not None, "24 candidates always leave one free below 97 categories"
        _, motif, ink_b = best
        held.add((temp, motif, ink_b))
        per_motif[motif] += 1
        per_temp[temp][motif] += 1
        out[c["id"]] = _spec(seed, temp, motif, ink_b)
    _SPECS.clear()
    _SPECS.update(out)
    return out


def _lookup(cat: dict) -> CoverSpec:
    return _SPECS.get(cat["id"]) or spec_for(cat["id"], cat["name"], cat.get("description", ""))


def _f(v: float) -> str:
    return f"{v:.1f}".rstrip("0").rstrip(".")


def _art(spec: CoverSpec, rand, screen: str) -> tuple[str, str]:
    """Drum A and drum B markup in a 100x100 box. Every motif lays solid B over solid A somewhere,
    so the third (overprint) colour always prints, not only where B crosses the dot screen."""
    A, B = INKS[spec.ink_a], INKS[spec.ink_b]
    m = spec.motif
    a: list[str] = []
    b: list[str] = []
    if m == "groove":
        # A record from above: disc in A, grooves and centre label in B.
        cx, cy = 40 + rand() * 20, 40 + rand() * 20
        a.append(f'<circle cx="{_f(cx)}" cy="{_f(cy)}" r="44" fill="{A}"/>')
        a.append(f'<rect x="0" y="0" width="100" height="100" fill="{A}" {screen}/>')
        for rr in range(16, 44, 7):
            b.append(f'<circle cx="{_f(cx)}" cy="{_f(cy)}" r="{rr}" fill="none" stroke="{B}" stroke-width="1.6"/>')
        b.append(f'<circle cx="{_f(cx)}" cy="{_f(cy)}" r="{_f(8 + rand() * 3)}" fill="{B}"/>')
    elif m == "split":
        # Solid A triangle; the B quarter-disc's radius always passes the diagonal (70.7), so they overlap.
        a.append('<polygon points="0,0 100,0 0,100" fill="' + A + '"/>')
        a.append(f'<polygon points="100,0 100,100 0,100" fill="{A}" {screen}/>')
        r = 78 + rand() * 12
        b.append(f'<path d="M100 100 L{_f(100 - r)} 100 A{_f(r)} {_f(r)} 0 0 1 100 {_f(100 - r)} Z" fill="{B}"/>')
        b.append(f'<circle cx="{_f(22 + rand() * 12)}" cy="{_f(22 + rand() * 12)}" r="{_f(6 + rand() * 4)}" fill="{B}"/>')
    elif m == "sleeves":
        # Three sleeves dropped on a counter: A, B, A-screened, each overlapping the next.
        for i in range(3):
            w = 46 + rand() * 12
            x = 8 + i * 16 + rand() * 5
            y = 10 + i * 14 + rand() * 5
            rot = (rand() - 0.5) * 16
            fill = A if i != 1 else B
            extra = screen if i == 2 else ""
            part = (
                f'<rect x="{_f(x)}" y="{_f(y)}" width="{_f(w)}" height="{_f(w)}" fill="{fill}" {extra}'
                f' transform="rotate({_f(rot)} {_f(x + w / 2)} {_f(y + w / 2)})"/>'
            )
            (b if i == 1 else a).append(part)
    elif m == "waves":
        # A sound, not a measurement: three B strokes, the middle one always crossing a solid A disc.
        a.append(f'<rect x="0" y="0" width="100" height="100" fill="{A}" {screen}/>')
        amp = 5 + rand() * 4
        wl = 30 + rand() * 12
        sw = 5 + rand() * 2.5
        y0 = 44 + rand() * 8
        r = 16 + rand() * 7
        a.append(f'<circle cx="{_f(24 + rand() * 52)}" cy="{_f(y0 + sw + 8 - r * 0.25)}" r="{_f(r)}" fill="{A}"/>')
        for k in range(3):
            y = y0 + k * (sw + 8)
            d = f"M-10 {_f(y)}"
            x = -10.0
            up = True
            while x < 110:
                cy = y - amp if up else y + amp
                d += f" Q{_f(x + wl / 4)} {_f(cy)} {_f(x + wl / 2)} {_f(y)}"
                x += wl / 2
                up = not up
            b.append(f'<path d="{d}" fill="none" stroke="{B}" stroke-width="{_f(sw)}" stroke-linecap="round"/>')
    elif m == "pull":
        # A record half out of its sleeve: sleeve in A, the disc (with its label hole) in B, overlapping it.
        s = 56 + rand() * 8
        x0, y0 = 8 + rand() * 6, 100 - s - 8 - rand() * 10
        a.append(f'<rect x="{_f(x0)}" y="{_f(y0)}" width="{_f(s)}" height="{_f(s)}" fill="{A}"/>')
        a.append(f'<rect x="0" y="0" width="100" height="{_f(y0 - 6)}" fill="{A}" {screen}/>')
        R = s * 0.46
        cx = x0 + s * (0.78 + rand() * 0.14)
        cy = y0 + s / 2
        hole = R * 0.3
        b.append(
            f'<path fill-rule="evenodd" fill="{B}" d="M{_f(cx - R)} {_f(cy)} a{_f(R)} {_f(R)} 0 1 0 {_f(2 * R)} 0 '
            f'a{_f(R)} {_f(R)} 0 1 0 {_f(-2 * R)} 0 Z M{_f(cx - hole)} {_f(cy)} a{_f(hole)} {_f(hole)} 0 1 0 {_f(2 * hole)} 0 '
            f'a{_f(hole)} {_f(hole)} 0 1 0 {_f(-2 * hole)} 0 Z"/>'
        )
    else:  # spines
        # Records leaning in a crate, seen edge-on: equal heights (never a bar chart), alternating drums, touching.
        n = 6
        lean = 8 + rand() * 7
        top, h = 14 + rand() * 6, 70
        x = 6 + rand() * 4
        for i in range(n):
            w = 8 + rand() * 5
            skew = h * (lean / 60)
            pts = f"{_f(x)},{_f(top + h)} {_f(x + w)},{_f(top + h)} {_f(x + w + skew)},{_f(top)} {_f(x + skew)},{_f(top)}"
            if i % 2 == 0:
                a.append(f'<polygon points="{pts}" fill="{A}"{" " + screen if i == 4 else ""}/>')
            else:
                b.append(f'<polygon points="{pts}" fill="{B}"/>')
            x += w - 2.2  # neighbours overlap by 2.2u, so every A/B seam prints the third colour
    return "".join(a), "".join(b)


def cover_svg(
    cat: dict,
    *,
    size: int,
    title: str | None = None,
    cls: str = "cover",
) -> str:
    spec = _lookup(cat)
    rand = mulberry32(spec.seed ^ 0x9E3779B9)
    # Dot screen at 80px and up; a flat 42% tint below, where 1px dots would moire.
    screen = 'mask="url(#rs-screen)"' if size >= 80 else 'fill-opacity="0.42"'
    # Ink speckle (paper showing through a starved drum) at 120px and up: one shared pattern, no filters.
    grain = ' mask="url(#rs-grain)"' if size >= 120 else ""
    a, b = _art(spec, rand, screen)
    turn = spec.turn * 90
    label = f'role="img" aria-label="{title}"' if title else 'aria-hidden="true"'
    return (
        f'<svg class="{cls}" viewBox="0 0 100 100" width="{size}" height="{size}" {label} '
        f'data-temp="{spec.temp}" data-motif="{spec.motif}" data-inks="{spec.ink_a}+{spec.ink_b}">'
        f'<rect x="-10" y="-10" width="120" height="120" fill="{PAPER}"/>'
        f'<g transform="rotate({turn} 50 50)">'
        f"<g{grain}>{a}</g>"
        f'<g style="mix-blend-mode:multiply" transform="translate({_f(spec.dx)} {_f(spec.dy)})"><g{grain}>{b}</g></g>'
        f"</g></svg>"
    )


def _speckle() -> str:
    """A 23u tile of paper-coloured voids, pre-rendered once (deterministic)."""
    rand = mulberry32(0x5EED)
    dots = []
    for _ in range(46):
        r = 0.18 + rand() ** 2 * 0.62
        dots.append(f'<circle cx="{_f(rand() * 23)}" cy="{_f(rand() * 23)}" r="{r:.2f}" fill="black"/>')
    return "".join(dots)


# One copy per document: the dot screen (tints) and the ink speckle (large sleeves).
SCREEN_DEFS = (
    '<svg width="0" height="0" style="position:absolute" aria-hidden="true" focusable="false"><defs>'
    '<pattern id="rs-dots" width="3" height="3" patternUnits="userSpaceOnUse" patternTransform="rotate(15)">'
    '<circle cx="1.5" cy="1.5" r="0.95" fill="white"/></pattern>'
    '<mask id="rs-screen" maskUnits="userSpaceOnUse" x="-50" y="-50" width="200" height="200">'
    '<rect x="-50" y="-50" width="200" height="200" fill="url(#rs-dots)"/></mask>'
    '<pattern id="rs-voids" width="23" height="23" patternUnits="userSpaceOnUse" patternTransform="rotate(7)">'
    '<rect width="23" height="23" fill="white"/>' + _speckle() + "</pattern>"
    '<mask id="rs-grain" maskUnits="userSpaceOnUse" x="-50" y="-50" width="200" height="200">'
    '<rect x="-50" y="-50" width="200" height="200" fill="url(#rs-voids)"/></mask>'
    "</defs></svg>"
)


def inks_of(cat: dict) -> tuple[str, str]:
    s = _lookup(cat)
    return INKS[s.ink_a], INKS[s.ink_b]


def temp_of(cat: dict) -> str:
    return _lookup(cat).temp


if __name__ == "__main__":
    import sys

    from build import CATS

    specs_by_id = catalogue_specs(CATS)
    cells = []
    for c in CATS:
        s = specs_by_id[c["id"]]
        cells.append(
            f'<figure>{cover_svg(c, size=160)}{cover_svg(c, size=40)}'
            f'<figcaption>{c["name"]}<br><small>{s.temp} · {s.motif} · {s.ink_a}+{s.ink_b}</small></figcaption></figure>'
        )
    page = (
        "<!doctype html><meta charset=utf-8><style>body{background:oklch(0.958 0.017 88);margin:24px;"
        "display:grid;grid-template-columns:repeat(7,1fr);gap:16px;font:12px sans-serif}"
        "figure{margin:0}figcaption{margin-top:4px}svg{display:block}</style>"
        + SCREEN_DEFS
        + "".join(cells)
    )
    open(sys.argv[1], "w").write(page)
    specs = [specs_by_id[c["id"]] for c in CATS]
    print("unique (inkA, inkB, motif):", len({(x.ink_a, x.ink_b, x.motif) for x in specs}), "of", len(specs))
    print("temps ", Counter(s.temp for s in specs))
    print("motifs", Counter(s.motif for s in specs))
    print("max (motif, inkA) share:", max(Counter((s.motif, s.ink_a) for s in specs).values()))
    for t in TEMPS:
        print(f"  {t:6s}", dict(Counter(s.motif for s in specs if s.temp == t)))
    for c, s in zip(CATS, specs):
        print(f"  {s.temp:6s} {s.motif:7s} {s.ink_a:>6s}+{s.ink_b:<8s} {c['name']}")
