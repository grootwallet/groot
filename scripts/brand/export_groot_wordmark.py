#!/usr/bin/env python3
"""Export the approved Groot wordmark as self-contained SVG outlines.

This brand-production utility deliberately converts the
locally reviewed Newsreader Medium font into paths so exported lockups do not
depend on installed fonts or network requests.

Runtime-only dependencies (do not add them to the wallet):
    python -m pip install fonttools uharfbuzz
"""

from __future__ import annotations

import argparse
from dataclasses import dataclass
from pathlib import Path

import uharfbuzz as hb
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.ttLib import TTFont


INK = "#102A4C"
IVORY = "#F7F3E9"
CONTROL_PATH = (
    "M64 21A54 54 0 0 0 10 75V105Q10 107 12 107H48Q50 107 50 105V91"
    "Q50 89 48 89H30Q28 89 28 87V75A36 36 0 0 1 100 75V87Q100 89 98 89"
    "H80Q78 89 78 91V105Q78 107 80 107H116Q118 107 118 105V75A54 54 0 0 0 64 21Z"
)


@dataclass(frozen=True)
class OutlinedWord:
    paths: tuple[tuple[float, str], ...]
    advance: float


def outline_word(font_path: Path, text: str, em_size: float, tracking_em: float) -> OutlinedWord:
    font_bytes = font_path.read_bytes()
    hb_face = hb.Face(font_bytes)
    hb_font = hb.Font(hb_face)
    upem = hb_face.upem
    hb_font.scale = (upem, upem)

    buffer = hb.Buffer()
    buffer.add_str(text)
    buffer.guess_segment_properties()
    hb.shape(hb_font, buffer, {"kern": True, "liga": True})

    tt_font = TTFont(font_path)
    glyph_set = tt_font.getGlyphSet()
    glyph_order = tt_font.getGlyphOrder()
    scale = em_size / upem
    tracking = tracking_em * upem
    cursor = 0.0
    paths: list[tuple[float, str]] = []

    for index, (info, position) in enumerate(zip(buffer.glyph_infos, buffer.glyph_positions, strict=True)):
        glyph_name = glyph_order[info.codepoint]
        pen = SVGPathPen(glyph_set)
        glyph_set[glyph_name].draw(pen)
        command = pen.getCommands()
        paths.append(((cursor + position.x_offset) * scale, command))
        cursor += position.x_advance
        if index < len(buffer.glyph_infos) - 1:
            cursor += tracking

    return OutlinedWord(tuple(paths), cursor * scale)


def word_paths(word: OutlinedWord, x: float, baseline: float, em_size: float, upem: int) -> str:
    scale = em_size / upem
    paths = "".join(
        f'<path transform="translate({offset / scale:.4f} 0)" d="{command}"/>'
        for offset, command in word.paths
    )
    return f'<g transform="translate({x:.4f} {baseline:.4f}) scale({scale:.8f} {-scale:.8f})">{paths}</g>'


def svg_document(*, title: str, color: str, width: float, height: float, body: str) -> str:
    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {width:.4f} {height:.4f}" '
        f'role="img" aria-labelledby="title">\n'
        f'  <title id="title">{title}</title>\n'
        f'  <g fill="{color}">{body}</g>\n'
        '</svg>\n'
    )


def export(font_path: Path, output_dir: Path) -> None:
    output_dir.mkdir(parents=True, exist_ok=True)
    tt_font = TTFont(font_path)
    upem = tt_font["head"].unitsPerEm

    em_size = 82.0
    baseline = 72.0
    tracking_em = -0.052
    word = outline_word(font_path, "Groot", em_size, tracking_em)
    word_x = 0.0
    word_width = word.advance
    word_body = word_paths(word, word_x, baseline, em_size, upem)

    icon_canvas = 70.0
    icon_scale = icon_canvas / 128.0
    icon_y = baseline - icon_canvas + (21.0 / 128.0 * icon_canvas)
    lockup_word_x = icon_canvas + 17.0
    lockup_width = lockup_word_x + word_width
    mark = (
        f'<path transform="translate(0 {icon_y:.4f}) scale({icon_scale:.8f})" '
        f'd="{CONTROL_PATH}"/>'
    )
    lockup_body = mark + word_paths(word, lockup_word_x, baseline, em_size, upem)

    assets = {
        "wordmark-ink.svg": svg_document(
            title="Groot", color=INK, width=word_width, height=88.0, body=word_body
        ),
        "wordmark-reversed.svg": svg_document(
            title="Groot", color=IVORY, width=word_width, height=88.0, body=word_body
        ),
        "lockup-horizontal-ink.svg": svg_document(
            title="Groot", color=INK, width=lockup_width, height=88.0, body=lockup_body
        ),
        "lockup-horizontal-reversed.svg": svg_document(
            title="Groot", color=IVORY, width=lockup_width, height=88.0, body=lockup_body
        ),
    }

    for filename, content in assets.items():
        (output_dir / filename).write_text(content, encoding="utf-8")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--font", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    export(args.font, args.output)


if __name__ == "__main__":
    main()
