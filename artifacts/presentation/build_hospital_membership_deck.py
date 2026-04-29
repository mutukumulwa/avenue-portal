from __future__ import annotations

import html
import math
import zipfile
from dataclasses import dataclass, field
from pathlib import Path
from typing import Iterable

from PIL import Image, ImageDraw, ImageFont


OUT_DIR = Path(__file__).resolve().parent
PPTX_PATH = OUT_DIR / "Avenue_Hospital_Membership_Program_Strategy.pptx"
PREVIEW_DIR = OUT_DIR / "previews"

SLIDE_W, SLIDE_H = 13.333, 7.5
EMU = 914400

NAVY = "262A5F"
INDIGO = "292A83"
BLUE = "435BA1"
TEAL = "1BA7A6"
GREEN = "28A745"
GOLD = "F5B642"
RED = "DC3545"
INK = "202124"
MUTED = "667085"
LIGHT = "F7F8FB"
LINE = "E6E8EF"
WHITE = "FFFFFF"
PINK = "F5C6B6"


@dataclass
class TextRun:
    text: str
    size: int = 20
    color: str = INK
    bold: bool = False
    italic: bool = False


@dataclass
class Item:
    kind: str
    x: float
    y: float
    w: float
    h: float
    text: str = ""
    runs: list[TextRun] = field(default_factory=list)
    fill: str | None = None
    stroke: str | None = None
    stroke_w: float = 1.0
    radius: float = 0.0
    size: int = 20
    color: str = INK
    bold: bool = False
    align: str = "l"
    valign: str = "top"
    line_spacing: float = 1.15
    opacity: float = 1.0
    shape: str = "rect"


@dataclass
class Slide:
    title: str
    items: list[Item] = field(default_factory=list)
    bg: str = WHITE
    notes: str = ""


def rect(x, y, w, h, fill, stroke=None, radius=0.0, opacity=1.0, stroke_w=1.0):
    return Item("rect", x, y, w, h, fill=fill, stroke=stroke, radius=radius, opacity=opacity, stroke_w=stroke_w)


def text(x, y, w, h, value, size=20, color=INK, bold=False, align="l", valign="top", line_spacing=1.15):
    return Item("text", x, y, w, h, text=value, size=size, color=color, bold=bold, align=align, valign=valign, line_spacing=line_spacing)


def line(x1, y1, x2, y2, color=LINE, stroke_w=1.0):
    return Item("line", x1, y1, x2 - x1, y2 - y1, stroke=color, stroke_w=stroke_w)


def pill(x, y, w, h, value, fill, color=WHITE, size=12):
    return [
        rect(x, y, w, h, fill, radius=0.14),
        text(x, y + 0.03, w, h, value, size=size, color=color, bold=True, align="c", valign="mid"),
    ]


def wrap_lines(draw: ImageDraw.ImageDraw, value: str, font: ImageFont.FreeTypeFont, max_px: int) -> list[str]:
    lines: list[str] = []
    for para in value.split("\n"):
        words = para.split()
        if not words:
            lines.append("")
            continue
        current = words[0]
        for word in words[1:]:
            trial = f"{current} {word}"
            if draw.textbbox((0, 0), trial, font=font)[2] <= max_px:
                current = trial
            else:
                lines.append(current)
                current = word
        lines.append(current)
    return lines


def font(size: int, bold: bool = False):
    candidates = [
        "/System/Library/Fonts/Supplemental/Arial Bold.ttf" if bold else "/System/Library/Fonts/Supplemental/Arial.ttf",
        "/Library/Fonts/Arial Bold.ttf" if bold else "/Library/Fonts/Arial.ttf",
        "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf" if bold else "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
    ]
    for p in candidates:
        if Path(p).exists():
            return ImageFont.truetype(p, size)
    return ImageFont.load_default()


def px(v: float, scale: int) -> int:
    return int(round(v * scale))


def draw_preview(slide: Slide, idx: int):
    scale = 120
    img = Image.new("RGB", (px(SLIDE_W, scale), px(SLIDE_H, scale)), f"#{slide.bg}")
    d = ImageDraw.Draw(img)
    for it in slide.items:
        x, y, w, h = px(it.x, scale), px(it.y, scale), px(it.w, scale), px(it.h, scale)
        if it.kind == "rect":
            fill = f"#{it.fill}" if it.fill else None
            outline = f"#{it.stroke}" if it.stroke else None
            if it.radius:
                d.rounded_rectangle([x, y, x + w, y + h], radius=px(it.radius, scale), fill=fill, outline=outline, width=max(1, px(it.stroke_w / 72, scale)))
            else:
                d.rectangle([x, y, x + w, y + h], fill=fill, outline=outline, width=max(1, px(it.stroke_w / 72, scale)))
        elif it.kind == "line":
            d.line([x, y, x + w, y + h], fill=f"#{it.stroke}", width=max(1, px(it.stroke_w / 72, scale)))
        elif it.kind == "text":
            fnt = font(int(it.size * 1.6), it.bold)
            lines = wrap_lines(d, it.text, fnt, max(10, w))
            line_h = int(it.size * 1.6 * it.line_spacing)
            total_h = len(lines) * line_h
            yy = y + (h - total_h) // 2 if it.valign == "mid" else y
            for ln in lines:
                bbox = d.textbbox((0, 0), ln, font=fnt)
                tw = bbox[2] - bbox[0]
                xx = x if it.align == "l" else x + (w - tw) // 2 if it.align == "c" else x + w - tw
                d.text((xx, yy), ln, font=fnt, fill=f"#{it.color}")
                yy += line_h
    PREVIEW_DIR.mkdir(parents=True, exist_ok=True)
    img.save(PREVIEW_DIR / f"slide_{idx:02d}.png")


def emu(v: float) -> int:
    return int(round(v * EMU))


def escape(s: str) -> str:
    return html.escape(s, quote=False)


def tx_body(it: Item) -> str:
    anchor = {"top": "t", "mid": "ctr", "bottom": "b"}.get(it.valign, "t")
    algn = {"l": "l", "c": "ctr", "r": "r"}.get(it.align, "l")
    paras = it.text.split("\n")
    p_xml = []
    for para in paras:
        p_xml.append(
            f'<a:p><a:pPr algn="{algn}"/><a:r><a:rPr lang="en-US" sz="{it.size * 100}" b="{1 if it.bold else 0}">'
            f'<a:solidFill><a:srgbClr val="{it.color}"/></a:solidFill></a:rPr><a:t>{escape(para)}</a:t></a:r></a:p>'
        )
    return (
        f'<p:txBody><a:bodyPr wrap="square" anchor="{anchor}" lIns="0" tIns="0" rIns="0" bIns="0"/>'
        f'<a:lstStyle/>{"".join(p_xml)}</p:txBody>'
    )


def shape_xml(it: Item, shape_id: int) -> str:
    name = f"Shape {shape_id}"
    if it.kind == "line":
        return (
            f'<p:cxnSp><p:nvCxnSpPr><p:cNvPr id="{shape_id}" name="{name}"/><p:cNvCxnSpPr/><p:nvPr/></p:nvCxnSpPr>'
            f'<p:spPr><a:xfrm><a:off x="{emu(it.x)}" y="{emu(it.y)}"/><a:ext cx="{emu(it.w)}" cy="{emu(it.h)}"/></a:xfrm>'
            f'<a:prstGeom prst="line"><a:avLst/></a:prstGeom><a:ln w="{int(it.stroke_w * 12700)}">'
            f'<a:solidFill><a:srgbClr val="{it.stroke or LINE}"/></a:solidFill></a:ln></p:spPr></p:cxnSp>'
        )

    prst = "roundRect" if it.radius else "rect"
    fill = '<a:noFill/>' if not it.fill else f'<a:solidFill><a:srgbClr val="{it.fill}"/></a:solidFill>'
    stroke = '<a:ln><a:noFill/></a:ln>' if not it.stroke else f'<a:ln w="{int(it.stroke_w * 12700)}"><a:solidFill><a:srgbClr val="{it.stroke}"/></a:solidFill></a:ln>'
    body = tx_body(it) if it.kind == "text" else ""
    return (
        f'<p:sp><p:nvSpPr><p:cNvPr id="{shape_id}" name="{name}"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr>'
        f'<p:spPr><a:xfrm><a:off x="{emu(it.x)}" y="{emu(it.y)}"/><a:ext cx="{emu(it.w)}" cy="{emu(it.h)}"/></a:xfrm>'
        f'<a:prstGeom prst="{prst}"><a:avLst/></a:prstGeom>{fill}{stroke}</p:spPr>{body}</p:sp>'
    )


def slide_xml(slide: Slide) -> str:
    bg = f'<p:bg><p:bgPr><a:solidFill><a:srgbClr val="{slide.bg}"/></a:solidFill><a:effectLst/></p:bgPr></p:bg>'
    shapes = "".join(shape_xml(it, i + 2) for i, it in enumerate(slide.items))
    return (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" '
        'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" '
        'xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">'
        f'<p:cSld>{bg}<p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>'
        '<p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>'
        f'{shapes}</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sld>'
    )


def write_pptx(slides: list[Slide]):
    with zipfile.ZipFile(PPTX_PATH, "w", zipfile.ZIP_DEFLATED) as z:
        z.writestr("[Content_Types].xml", content_types(len(slides)))
        z.writestr("_rels/.rels", rels_root())
        z.writestr("docProps/core.xml", core_props())
        z.writestr("docProps/app.xml", app_props(len(slides)))
        z.writestr("ppt/presentation.xml", presentation_xml(len(slides)))
        z.writestr("ppt/_rels/presentation.xml.rels", presentation_rels(len(slides)))
        z.writestr("ppt/theme/theme1.xml", theme_xml())
        z.writestr("ppt/slideMasters/slideMaster1.xml", slide_master_xml())
        z.writestr("ppt/slideMasters/_rels/slideMaster1.xml.rels", slide_master_rels())
        z.writestr("ppt/slideLayouts/slideLayout1.xml", slide_layout_xml())
        z.writestr("ppt/slideLayouts/_rels/slideLayout1.xml.rels", slide_layout_rels())
        for i, s in enumerate(slides, 1):
            z.writestr(f"ppt/slides/slide{i}.xml", slide_xml(s))
            z.writestr(f"ppt/slides/_rels/slide{i}.xml.rels", slide_rels())


def content_types(n: int) -> str:
    slides = "".join(f'<Override PartName="/ppt/slides/slide{i}.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>' for i in range(1, n + 1))
    return (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
        '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
        '<Default Extension="xml" ContentType="application/xml"/>'
        '<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>'
        '<Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>'
        '<Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/>'
        '<Override PartName="/ppt/theme/theme1.xml" ContentType="application/vnd.openxmlformats-officedocument.theme+xml"/>'
        '<Override PartName="/ppt/slideMasters/slideMaster1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideMaster+xml"/>'
        '<Override PartName="/ppt/slideLayouts/slideLayout1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideLayout+xml"/>'
        f'{slides}</Types>'
    )


def rels_root() -> str:
    return (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="ppt/presentation.xml"/>'
        '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>'
        '<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>'
        '</Relationships>'
    )


def core_props() -> str:
    return (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" '
        'xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" '
        'xmlns:dcmitype="http://purl.org/dc/dcmitype/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">'
        '<dc:title>Avenue Hospital Membership Program Strategy</dc:title><dc:creator>Codex</dc:creator>'
        '<cp:lastModifiedBy>Codex</cp:lastModifiedBy><dcterms:created xsi:type="dcterms:W3CDTF">2026-04-29T00:00:00Z</dcterms:created>'
        '<dcterms:modified xsi:type="dcterms:W3CDTF">2026-04-29T00:00:00Z</dcterms:modified></cp:coreProperties>'
    )


def app_props(n: int) -> str:
    return (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" '
        'xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes">'
        f'<Application>Codex OpenXML</Application><PresentationFormat>On-screen Show (16:9)</PresentationFormat><Slides>{n}</Slides>'
        '</Properties>'
    )


def presentation_xml(n: int) -> str:
    ids = "".join(f'<p:sldId id="{255 + i}" r:id="rId{i}"/>' for i in range(1, n + 1))
    return (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<p:presentation xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" '
        'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" '
        'xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">'
        f'<p:sldMasterIdLst><p:sldMasterId id="2147483648" r:id="rId{n + 1}"/></p:sldMasterIdLst><p:sldIdLst>{ids}</p:sldIdLst>'
        f'<p:sldSz cx="{emu(SLIDE_W)}" cy="{emu(SLIDE_H)}" type="wide"/><p:notesSz cx="6858000" cy="9144000"/>'
        '<p:defaultTextStyle><a:defPPr><a:defRPr lang="en-US"/></a:defPPr></p:defaultTextStyle></p:presentation>'
    )


def presentation_rels(n: int) -> str:
    rels = [f'<Relationship Id="rId{i}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide{i}.xml"/>' for i in range(1, n + 1)]
    rels.append(f'<Relationship Id="rId{n + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" Target="slideMasters/slideMaster1.xml"/>')
    rels.append(f'<Relationship Id="rId{n + 2}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme" Target="theme/theme1.xml"/>')
    return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' + "".join(rels) + "</Relationships>"


def slide_rels() -> str:
    return (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/>'
        '</Relationships>'
    )


def slide_master_xml() -> str:
    return (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<p:sldMaster xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">'
        '<p:cSld><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr></p:spTree></p:cSld>'
        '<p:clrMap bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"/>'
        '<p:sldLayoutIdLst><p:sldLayoutId id="2147483649" r:id="rId1"/></p:sldLayoutIdLst><p:txStyles><p:titleStyle/><p:bodyStyle/><p:otherStyle/></p:txStyles></p:sldMaster>'
    )


def slide_master_rels() -> str:
    return (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/>'
        '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme" Target="../theme/theme1.xml"/>'
        '</Relationships>'
    )


def slide_layout_xml() -> str:
    return (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<p:sldLayout xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" type="blank" preserve="1">'
        '<p:cSld name="Blank"><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr></p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sldLayout>'
    )


def slide_layout_rels() -> str:
    return (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" Target="../slideMasters/slideMaster1.xml"/>'
        '</Relationships>'
    )


def theme_xml() -> str:
    return (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<a:theme xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" name="AiCare">'
        '<a:themeElements><a:clrScheme name="AiCare"><a:dk1><a:srgbClr val="202124"/></a:dk1><a:lt1><a:srgbClr val="FFFFFF"/></a:lt1><a:dk2><a:srgbClr val="262A5F"/></a:dk2><a:lt2><a:srgbClr val="F7F8FB"/></a:lt2><a:accent1><a:srgbClr val="292A83"/></a:accent1><a:accent2><a:srgbClr val="1BA7A6"/></a:accent2><a:accent3><a:srgbClr val="28A745"/></a:accent3><a:accent4><a:srgbClr val="F5B642"/></a:accent4><a:accent5><a:srgbClr val="DC3545"/></a:accent5><a:accent6><a:srgbClr val="435BA1"/></a:accent6><a:hlink><a:srgbClr val="292A83"/></a:hlink><a:folHlink><a:srgbClr val="435BA1"/></a:folHlink></a:clrScheme>'
        '<a:fontScheme name="AiCare"><a:majorFont><a:latin typeface="Aptos Display"/></a:majorFont><a:minorFont><a:latin typeface="Aptos"/></a:minorFont></a:fontScheme><a:fmtScheme name="AiCare"><a:fillStyleLst/><a:lnStyleLst/><a:effectStyleLst/><a:bgFillStyleLst/></a:fmtScheme></a:themeElements></a:theme>'
    )


def title(slide: Slide, value: str, sub: str | None = None):
    slide.items.append(text(0.72, 0.5, 9.3, 0.55, value, 22, INDIGO, True))
    if sub:
        slide.items.append(text(0.72, 1.08, 9.2, 0.35, sub, 12, MUTED))
    slide.items.append(line(0.72, 1.52, 12.55, 1.52, LINE, 1))


def add_footer(slide: Slide, num: int):
    slide.items.append(text(11.9, 7.05, 0.65, 0.2, f"{num:02d}", 9, MUTED, True, align="r"))


def build_slides() -> list[Slide]:
    slides: list[Slide] = []

    s = Slide("Cover", bg=NAVY)
    s.items += [
        rect(0, 0, 13.333, 7.5, NAVY),
        rect(8.55, -0.6, 4.2, 8.7, BLUE, opacity=1),
        rect(9.2, 0.0, 3.2, 6.8, PINK),
        text(0.82, 0.62, 3.0, 0.28, "AiCare | Avenue Healthcare", 13, PINK, True),
        text(0.82, 1.62, 7.0, 1.65, "Hospital membership,\nrun like a health plan", 42, WHITE, True, line_spacing=1.02),
        text(0.86, 3.58, 6.0, 0.72, "How Avenue can operate a provider-sponsored membership program with insurance-grade control, member-grade trust, and hospital-grade care flow.", 17, "DDE5FF"),
        text(0.86, 6.55, 4.7, 0.28, "Strategy presentation | under 20 slides", 11, "DDE5FF"),
        text(9.55, 1.1, 2.1, 0.3, "MEMBER", 13, INDIGO, True, align="c"),
        text(9.55, 1.82, 2.1, 0.3, "CARE", 13, INDIGO, True, align="c"),
        text(9.55, 2.54, 2.1, 0.3, "FUND", 13, INDIGO, True, align="c"),
        text(9.55, 3.26, 2.1, 0.3, "AUDIT", 13, INDIGO, True, align="c"),
        line(10.6, 1.42, 10.6, 3.2, INDIGO, 2),
    ]
    slides.append(s)

    s = Slide("Main thesis")
    title(s, "The point is not to imitate an insurer", "It is to manage a hospital-owned membership pool with controls built into care delivery.")
    s.items += [
        text(0.85, 2.0, 5.2, 1.2, "Avenue is both the care provider and the membership pool steward.", 30, NAVY, True),
        text(0.9, 3.43, 4.8, 1.1, "That creates a different operating problem: every visit, contribution, benefit, claim, and override must be visible in one system.", 17, INK),
        rect(6.6, 2.0, 5.75, 0.62, LIGHT, LINE, 0.06),
        text(6.85, 2.17, 5.25, 0.28, "Traditional competitor pattern", 13, MUTED, True),
        text(6.85, 2.82, 5.25, 0.55, "Separate insurer, hospital, broker, TPA, and member tools stitched together after the fact.", 17, INK),
        rect(6.6, 4.18, 5.75, 0.62, INDIGO, None, 0.06),
        text(6.85, 4.35, 5.25, 0.28, "AiCare operating pattern", 13, WHITE, True),
        text(6.85, 5.0, 5.25, 0.72, "One membership platform: enrollment, packages, check-in, pre-auth, claims, finance, fraud, service, and stakeholder portals.", 17, INK),
    ]
    slides.append(s)

    s = Slide("Lifecycle")
    title(s, "One closed loop from sale to care to settlement", "The system manages the membership lifecycle as one auditable flow.")
    steps = [
        ("Quote", "Broker/admin builds contribution offer"),
        ("Enroll", "Groups, individuals, dependents, imports"),
        ("Configure", "Packages, tiers, benefits, co-contribution"),
        ("Verify", "Secure member check-in at facility"),
        ("Authorize", "Pre-auth and clinical review"),
        ("Adjudicate", "Claims, tariffs, exceptions, documents"),
        ("Settle", "Invoices, payments, GL, fund ledger"),
        ("Learn", "Fraud, reports, utilization, renewals"),
    ]
    x0, y0 = 0.65, 2.0
    for i, (a, b) in enumerate(steps):
        x = x0 + (i % 4) * 3.12
        y = y0 + (i // 4) * 2.05
        s.items += [rect(x, y, 2.6, 1.1, WHITE, LINE, 0.08), text(x + 0.18, y + 0.18, 2.1, 0.26, a, 17, INDIGO, True), text(x + 0.18, y + 0.52, 2.16, 0.38, b, 10, MUTED)]
        if i not in (3, 7):
            s.items.append(line(x + 2.6, y + 0.55, x + 3.04, y + 0.55, TEAL, 2))
    slides.append(s)

    s = Slide("Portal ecosystem")
    title(s, "The system gives every actor the correct workbench", "Different users see different operational surfaces, not a single overloaded back office.")
    actors = [
        ("Admin", "Membership, claims, packages, billing, providers, reports, fraud, settings", INDIGO),
        ("HR manager", "Roster, endorsement requests, invoices, utilization, service requests", TEAL),
        ("Member", "Digital card, benefits, dependents, utilization, pre-auth, facilities, security", GREEN),
        ("Broker", "Groups, submissions, quotations, commissions, renewals, support", GOLD),
        ("Fund admin", "Deposits, balances, claim deductions, category holds, statements", RED),
    ]
    for i, (role, desc, color) in enumerate(actors):
        y = 1.85 + i * 0.95
        s.items += [text(0.9, y, 1.35, 0.28, role, 16, color, True), line(2.2, y + 0.16, 2.75, y + 0.16, color, 2), text(3.0, y - 0.02, 8.9, 0.38, desc, 16, INK)]
    slides.append(s)

    s = Slide("Product design")
    title(s, "Membership products are configurable, not hard-coded", "Packages and benefit rules let the hospital shape commercial offers without rewriting operations.")
    s.items += [
        text(0.8, 1.95, 4.6, 0.82, "Configurable building blocks", 28, NAVY, True),
        text(0.85, 3.05, 4.4, 1.0, "Packages, package versions, benefit categories, sub-limits, waiting periods, group benefit tiers, and contribution rates support both corporate and individual programs.", 16, INK),
        rect(6.1, 1.9, 5.85, 3.8, LIGHT, LINE, 0.08),
        *pill(6.45, 2.25, 1.55, 0.38, "OUTPATIENT", INDIGO),
        *pill(8.25, 2.25, 1.55, 0.38, "INPATIENT", TEAL),
        *pill(10.05, 2.25, 1.2, 0.38, "DENTAL", GREEN),
        text(6.45, 3.05, 4.85, 0.32, "Annual sub-limit   Waiting period   Co-contribution", 14, INK, True),
        line(6.45, 3.55, 11.4, 3.55, LINE),
        text(6.45, 3.82, 4.4, 0.32, "KES 250,000       30 days          10%", 16, MUTED),
        line(6.45, 4.35, 11.4, 4.35, LINE),
        text(6.45, 4.62, 4.4, 0.32, "KES 1,000,000     90 days          0%", 16, MUTED),
    ]
    slides.append(s)

    s = Slide("Enrollment")
    title(s, "Enrollment and endorsements become controlled membership changes", "The platform supports group imports, individual onboarding, dependents, mid-term changes, and audit trails.")
    s.items += [
        text(0.85, 2.0, 3.8, 0.42, "What it manages", 21, NAVY, True),
        text(0.95, 2.68, 4.6, 1.7, "Member profiles\nDependents and relationships\nGroup rosters and imports\nEndorsement requests\nStatus changes and renewals", 18, INK),
        rect(6.15, 1.95, 5.75, 3.9, WHITE, LINE, 0.08),
        text(6.45, 2.22, 2.0, 0.28, "HR request", 14, TEAL, True),
        text(6.45, 2.78, 4.8, 0.42, "Add dependent, remove member, transfer group, update profile", 15, INK),
        line(6.45, 3.45, 11.45, 3.45, LINE),
        text(6.45, 3.76, 2.0, 0.28, "Admin review", 14, INDIGO, True),
        text(6.45, 4.32, 4.8, 0.42, "Validate eligibility, effective date, package version, billing impact", 15, INK),
        line(6.45, 4.95, 11.45, 4.95, LINE),
        text(6.45, 5.22, 2.0, 0.28, "Result", 14, GREEN, True),
        text(8.05, 5.22, 3.2, 0.28, "Roster, invoice, and benefit state updated", 14, INK),
    ]
    slides.append(s)

    s = Slide("Secure check-in")
    title(s, "Point-of-care verification is a first-class control", "Secure check-in closes the biggest PSHP gap: non-members consuming benefits with someone else's credentials.")
    s.items += [
        text(0.8, 1.9, 4.7, 0.82, "The check-in is not a plastic card moment. It is an auditable visit opening.", 28, NAVY, True),
        text(0.85, 3.28, 4.65, 1.15, "Primary path uses WebAuthn/passkey-style device verification plus a reception code match. Fallbacks preserve access without hiding risk.", 16, INK),
        rect(6.05, 1.8, 5.8, 4.35, LIGHT, LINE, 0.08),
        text(6.42, 2.16, 4.8, 0.28, "Reception starts secure check-in", 15, INDIGO, True),
        line(6.75, 2.75, 6.75, 5.45, TEAL, 2),
        text(7.08, 2.7, 3.9, 0.32, "1  Device biometric signs challenge", 14, INK),
        text(7.08, 3.45, 3.9, 0.32, "2  Member and reception compare code", 14, INK),
        text(7.08, 4.2, 3.9, 0.32, "3  Visit opens; event enters audit chain", 14, INK),
        text(7.08, 4.95, 3.9, 0.32, "4  Emergency override allowed, then reviewed", 14, INK),
    ]
    slides.append(s)

    s = Slide("Clinical operations")
    title(s, "Pre-auth and claims share the same clinical-financial spine", "The platform can compare requested care, diagnosis, provider tariff, benefit limit, and member contribution at decision time.")
    s.items += [
        rect(0.85, 1.95, 5.45, 3.9, WHITE, LINE, 0.08),
        text(1.15, 2.22, 4.8, 0.35, "Claim adjudication workbench", 18, INDIGO, True),
        text(1.15, 2.88, 4.75, 1.35, "Structured service lines by category\nICD-10 and CPT support\nTariff variance detection\nDocuments and exception workflow\nCo-contribution collection", 17, INK),
        rect(7.05, 1.95, 4.95, 3.9, LIGHT, LINE, 0.08),
        text(7.35, 2.22, 4.2, 0.35, "Why this matters", 18, TEAL, True),
        text(7.35, 2.88, 4.1, 1.55, "A competitor can adjudicate a claim. This system can connect that claim to the member's package, facility check-in, provider contract, HR roster, fund balance, GL posting, and fraud history.", 17, INK),
    ]
    slides.append(s)

    s = Slide("Fraud")
    title(s, "Fraud control is embedded before, during, and after care", "The design reflects the special risk of a provider-sponsored health plan: internal claims need scrutiny too.")
    layers = [
        ("Gate checks", "Identity, enrollment validation, payment verification", TEAL),
        ("Rules engine", "Pre-auth and claim heuristics, tariff and pathway checks", INDIGO),
        ("Anomaly detection", "Provider, member, broker, and check-in pattern review", RED),
        ("Immutable audit", "Overrides, flags, investigations, and outcomes retained", GOLD),
    ]
    for i, (a, b, c) in enumerate(layers):
        y = 1.95 + i * 1.05
        s.items += [rect(0.9, y, 2.2, 0.48, c, None, 0.08), text(1.05, y + 0.11, 1.9, 0.2, a, 12, WHITE, True, align="c"), text(3.42, y + 0.03, 7.75, 0.35, b, 18, INK)]
    s.items += [text(0.9, 6.35, 9.8, 0.35, "Key difference: the system does not assume Avenue facilities are automatically low-risk; it audits the operating model itself.", 15, NAVY, True)]
    slides.append(s)

    s = Slide("Finance")
    title(s, "Finance is connected to the membership event stream", "Contributions, invoices, payments, claim liabilities, GL entries, and statements live with the operational record.")
    s.items += [
        text(0.9, 2.0, 4.45, 0.68, "Insurance-like discipline without insurance-language drift", 27, NAVY, True),
        text(0.95, 3.2, 4.6, 1.2, "The product consistently speaks in membership terms: member, contribution, package, benefit. Under the hood, it still supports billing runs, invoices, payments, ledgers, reports, and accounting controls.", 16, INK),
        rect(6.2, 1.95, 5.7, 3.95, LIGHT, LINE, 0.08),
        text(6.55, 2.25, 2.6, 0.28, "Finance loop", 16, INDIGO, True),
        text(6.55, 3.0, 4.6, 1.6, "Contribution rate → invoice → payment → claim approval → GL posting → report/export", 24, INK, True, line_spacing=1.25),
    ]
    slides.append(s)

    s = Slide("Self-funded")
    title(s, "Self-funded schemes are not spreadsheets bolted on the side", "The fund portal gives employer-funded pools operational controls usually missing from competitor offerings.")
    s.items += [
        rect(0.85, 1.95, 5.45, 3.9, LIGHT, LINE, 0.08),
        text(1.15, 2.25, 4.8, 0.35, "Fund control surface", 18, INDIGO, True),
        text(1.15, 2.95, 4.55, 1.55, "Deposits and top-ups\nMinimum balance alerts\nClaim deductions\nAdmin fee invoicing\nCategory holds\nExportable statements", 18, INK),
        text(7.0, 2.05, 4.8, 0.9, "This makes the hospital a transparent administrator of the client's money, not just a processor of invoices.", 27, NAVY, True),
        text(7.05, 3.65, 4.25, 0.65, "For corporates, this can be the wedge: better visibility than insurance, better care flow than a standalone TPA.", 17, INK),
    ]
    slides.append(s)

    s = Slide("Experience")
    title(s, "The member experience is more than eligibility lookup", "Members can see the program working for them, not just wait for back-office responses.")
    s.items += [
        rect(0.9, 1.85, 3.35, 4.6, NAVY, None, 0.18),
        text(1.22, 2.2, 2.65, 0.25, "Avenue Healthcare", 12, "DDE5FF", True),
        text(1.22, 2.75, 2.65, 0.6, "Digital member card", 25, WHITE, True),
        text(1.22, 3.75, 2.55, 0.75, "Benefits, dependents, utilization, pre-auth, facilities, support, and device security in one portal.", 13, "DDE5FF"),
        rect(5.2, 2.05, 6.45, 3.9, WHITE, LINE, 0.08),
        text(5.55, 2.35, 5.8, 0.42, "Why it changes operations", 22, INDIGO, True),
        text(5.55, 3.1, 5.45, 1.65, "Fewer calls to HR and customer service\nMembers understand remaining benefits\nPre-auth and utilization are visible\nSecurity actions are member-controlled\nSupport has membership context", 18, INK),
    ]
    slides.append(s)

    s = Slide("Architecture")
    title(s, "The platform is built as a tenant-ready operating system", "The implementation is not a one-off portal: it has tenant branding, role controls, APIs, jobs, storage, and audit services.")
    items = [
        ("Multi-tenant SaaS", "Tenant-scoped data and white-label theming"),
        ("Role-based access", "Admin, clinical, finance, HR, broker, member, fund roles"),
        ("API layer", "tRPC and REST-style endpoints for eligibility, claims, benefits, pre-auth"),
        ("Background jobs", "Billing runs, renewals, reports, escalations, balance alerts"),
        ("Document storage", "Claims, contracts, invoices, and correspondence"),
        ("PWA/security", "Member check-in and WebAuthn device registration"),
    ]
    for i, (a, b) in enumerate(items):
        x = 0.85 + (i % 2) * 6.05
        y = 1.85 + (i // 2) * 1.35
        s.items += [text(x, y, 2.8, 0.3, a, 17, INDIGO, True), text(x, y + 0.42, 4.75, 0.35, b, 14, INK), line(x, y + 0.95, x + 4.9, y + 0.95, LINE)]
    slides.append(s)

    s = Slide("Differentiation")
    title(s, "What sets it apart from competitors", "The difference is not one feature. It is how the features reinforce each other.")
    rows = [
        ("Competitor norm", "Separate insurer/TPA/provider tools", "AiCare difference", "One hospital-owned membership operating layer"),
        ("Competitor norm", "Card or OTP eligibility checks", "AiCare difference", "Passkey-style check-in plus fallback audit"),
        ("Competitor norm", "Claims review after service", "AiCare difference", "Checks at enrollment, pre-auth, visit, claim, and payment"),
        ("Competitor norm", "Self-funded via statements", "AiCare difference", "Live fund ledger, holds, low-balance alerts"),
        ("Competitor norm", "Portals as status viewers", "AiCare difference", "Portals that let actors perform their actual work"),
    ]
    y = 1.85
    for left_lab, left, right_lab, right in rows:
        s.items += [
            text(0.85, y, 1.35, 0.22, left_lab, 9, MUTED, True),
            text(0.85, y + 0.32, 4.2, 0.3, left, 15, INK),
            text(6.35, y, 1.35, 0.22, right_lab, 9, INDIGO, True),
            text(6.35, y + 0.32, 4.9, 0.3, right, 15, NAVY, True),
            line(0.85, y + 0.78, 11.95, y + 0.78, LINE),
        ]
        y += 0.95
    slides.append(s)

    s = Slide("Value")
    title(s, "Value for the hospital, employers, members, and brokers", "Avenue can sell a clearer promise to every participant in the program.")
    vals = [
        ("Hospital", "Better loss control, utilization insight, faster settlement, auditable overrides", INDIGO),
        ("Employer", "Roster control, invoice clarity, utilization reporting, self-funded transparency", TEAL),
        ("Member", "Visible benefits, digital card, check-in security, support and facilities access", GREEN),
        ("Broker", "Quotations, submissions, commissions, renewals, group visibility", GOLD),
    ]
    for i, (a, b, c) in enumerate(vals):
        x = 0.85 + (i % 2) * 6.0
        y = 2.0 + (i // 2) * 1.85
        s.items += [rect(x, y, 4.9, 1.25, WHITE, c, 0.08, stroke_w=1.5), text(x + 0.25, y + 0.22, 1.7, 0.28, a, 18, c, True), text(x + 0.25, y + 0.62, 4.2, 0.35, b, 13, INK)]
    slides.append(s)

    s = Slide("Adoption")
    title(s, "A practical adoption path", "The system can be introduced as an operating model, not a big-bang replacement.")
    phases = [
        ("1", "Stabilize core", "Packages, groups, members, billing, claims, reports"),
        ("2", "Activate controls", "Secure check-in, tariff variance, fraud desk, audit review"),
        ("3", "Open portals", "HR, member, broker, and fund self-service workflows"),
        ("4", "Optimize pool", "Utilization, renewals, pricing feedback, service trends"),
    ]
    for i, (n, a, b) in enumerate(phases):
        x = 0.9 + i * 3.05
        s.items += [text(x, 2.05, 0.45, 0.45, n, 23, INDIGO, True, align="c"), line(x + 0.25, 2.62, x + 0.25, 4.6, TEAL, 2), text(x, 4.85, 2.4, 0.3, a, 17, NAVY, True), text(x, 5.32, 2.25, 0.58, b, 13, INK)]
    slides.append(s)

    s = Slide("Close")
    title(s, "The story to take forward", "AiCare turns Avenue's membership program into a disciplined care-finance platform.")
    s.items += [
        text(0.9, 2.05, 7.8, 1.55, "Avenue can offer members a program that feels simple at the front door and behaves rigorously behind the scenes.", 34, NAVY, True, line_spacing=1.05),
        text(0.95, 4.3, 6.0, 0.8, "That is the competitive position: integrated care access, transparent membership finance, and fraud-aware operations in one system.", 18, INK),
        rect(8.7, 2.05, 2.7, 2.7, INDIGO, None, 0.18),
        text(9.05, 2.8, 2.0, 0.7, "Next:\nmanual + screenshots", 22, WHITE, True, align="c", valign="mid"),
    ]
    slides.append(s)

    for i, sl in enumerate(slides, 1):
        add_footer(sl, i)
    return slides


def main():
    slides = build_slides()
    if len(slides) >= 20:
        raise SystemExit(f"Deck has {len(slides)} slides; must be under 20.")
    write_pptx(slides)
    PREVIEW_DIR.mkdir(parents=True, exist_ok=True)
    for old in PREVIEW_DIR.glob("slide_*.png"):
        old.unlink()
    for i, slide in enumerate(slides, 1):
        draw_preview(slide, i)
    print(f"Wrote {PPTX_PATH}")
    print(f"Wrote {len(slides)} previews to {PREVIEW_DIR}")


if __name__ == "__main__":
    main()
