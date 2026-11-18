"""
Ingestão 100% Read-Only e decomposição estratificada de 50 prompts reais para o Prompt Engine V1.

Fontes lidas exclusivamente em modo Read-Only:
  1. D:\\Meus Documentos\\Imagens\\Eagle.cool\\Gemini Kimi + Antigravity.library
  2. D:\\Meus Documentos\\Imagens\\Eagle.cool\\Google Flow + Prompts.library
  3. B:\\AntiGravity\\Projeto Alfa\\data\\prompt_dna.sqlite (?mode=ro)
  4. C:\\Users\\conta\\Documents\\antigravity\\fearless-euclid\\data\\posematch_eagle.sqlite (?mode=ro)

Saídas geradas apenas dentro de b:\\AntiGravity\\Prompt-EngineV1\\data\\:
  - sample_50_prompts.json
  - prompt_engine_v1.sqlite
"""

from __future__ import annotations

import bisect
import json
import math
import os
import re
import sqlite3
import sys
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

PROJECT_ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = PROJECT_ROOT / "data"
OUTPUT_JSON = DATA_DIR / "sample_50_prompts.json"
OUTPUT_DB = DATA_DIR / "prompt_engine_v1.sqlite"

ALFA_ROOT = Path(r"B:\AntiGravity\Projeto Alfa")
ALFA_DB = ALFA_ROOT / "data" / "prompt_dna.sqlite"
POSEMATCH_DB = Path(r"C:\Users\conta\Documents\antigravity\fearless-euclid\data\posematch_eagle.sqlite")

GEMINI_KIMI_LIB = Path(r"D:\Meus Documentos\Imagens\Eagle.cool\Gemini Kimi + Antigravity.library")
GEMINI_KIMI_IMAGES = GEMINI_KIMI_LIB / "images"

GOOGLE_FLOW_LIB = Path(r"D:\Meus Documentos\Imagens\Eagle.cool\Google Flow + Prompts.library")
GOOGLE_FLOW_IMAGES = GOOGLE_FLOW_LIB / "images"

# Reaproveita o parser AST e ontologia bilíngue de B:\AntiGravity\Projeto Alfa em modo leitura
if str(ALFA_ROOT) not in sys.path:
    sys.path.insert(0, str(ALFA_ROOT))

from backend.domain_rules import check_physical_and_empirical_coherence  # type: ignore
from backend.ontology import HEATMAP_AXES, VALID_HEATMAP_PAIRS  # type: ignore
from backend.parser_ast import parse_prompt_to_ast  # type: ignore

THUMB_EXTS = ("_thumbnail.png", "_thumbnail.webp", "_thumbnail.jpg")
IMAGE_EXTS = (".jpg", ".jpeg", ".png", ".webp")

CHAT_NOISE_PATTERNS = (
    "i've generated a single-panel",
    "ficou faltando a segunda entrada",
    "não posso gerar",
    "não consigo processar",
    "intérprete fdr v3 online",
    "não é o prompt em si",
    "copiado no canal do telegram",
    "a insistência em aplicar uma estrutura json",
    "i cannot fulfill",
    "i'm sorry, i can't",
    "extracted from all of your uploaded reference images",
    "extracted from all uploaded reference images",
    "aqui estão os briefs de direção",
)

PREAMBLE_RES = [
    re.compile(
        r"^(?:aqui est[áa]|here is|here are|based on|com base na|entendido|certamente|sure,|claro,)[\s\S]{0,650}?(?:prompt\s*:|formato\s+json\.?\s*\n|📝[^\n]*\n)",
        re.IGNORECASE,
    ),
    re.compile(r"^i am nano banan[a]?\s*g?\d*[^:{[\n]{0,220}?:\s*", re.IGNORECASE),
    re.compile(r"^para gerar uma imagem[^:]{0,200}?:\s*", re.IGNORECASE),
]

SECTION_LINE_RE = re.compile(
    r"(?m)^\s*(?:\d+\.\s+[A-Za-z][^\n]{2,42}|[A-Z][A-Z0-9\s&/()-]{2,40}:|"
    r"Editorial Direction:|Photographic Style:|Visual Aesthetic:|Composition:|Lighting:|Subject:|Camera:|Wardrobe:|Environment:|Art Direction:)"
)


def open_ro(db_path: Path) -> sqlite3.Connection:
    uri = f"{db_path.resolve().as_uri()}?mode=ro"
    conn = sqlite3.connect(uri, uri=True)
    conn.row_factory = sqlite3.Row
    return conn


def resolve_thumbnail(source_lib: str, item_id: str) -> Optional[Path]:
    roots = (
        (GEMINI_KIMI_IMAGES, GOOGLE_FLOW_IMAGES)
        if source_lib == "gemini_kimi"
        else (GOOGLE_FLOW_IMAGES, GEMINI_KIMI_IMAGES)
    )
    for root in roots:
        info_dir = root / f"{item_id}.info"
        if not info_dir.is_dir():
            continue
        fallback: Optional[Path] = None
        try:
            with os.scandir(info_dir) as entries:
                for entry in entries:
                    if not entry.is_file():
                        continue
                    low = entry.name.lower()
                    if low == "metadata.json":
                        continue
                    if low.endswith(THUMB_EXTS):
                        return Path(entry.path)
                    if fallback is None and low.endswith(IMAGE_EXTS):
                        fallback = Path(entry.path)
            if fallback is not None:
                return fallback
        except OSError:
            continue
    return None


def read_eagle_item_meta(source_lib: str, item_id: str) -> Dict[str, Any]:
    root = GEMINI_KIMI_IMAGES if source_lib == "gemini_kimi" else GOOGLE_FLOW_IMAGES
    meta_path = root / f"{item_id}.info" / "metadata.json"
    if not meta_path.exists():
        return {}
    try:
        with open(meta_path, "r", encoding="utf-8", errors="ignore") as f:
            return json.load(f)
    except Exception:
        return {}


def strip_conversational_preamble(raw: str) -> str:
    txt = (raw or "").replace("\xa0", " ").strip()
    for pat in PREAMBLE_RES:
        nxt = pat.sub("", txt, count=1).strip()
        if len(nxt) > 60:
            txt = nxt
    return txt


def is_clean_prompt(raw: str) -> bool:
    txt = (raw or "").strip()
    if len(txt) < 120:
        return False
    low = txt.lower()
    if any(noise in low[:460] for noise in CHAT_NOISE_PATTERNS):
        return False
    cleaned = strip_conversational_preamble(txt)
    if len(cleaned) < 110:
        return False
    return True


def detect_macro_and_dialect(raw: str, alfa_dialect: str) -> Tuple[str, str, List[str]]:
    cleaned = strip_conversational_preamble(raw)
    low = cleaned.lower()

    json_obj: Optional[dict] = None
    brace_idx = cleaned.find("{")
    if brace_idx != -1 and brace_idx < 1400 and ('"' in cleaned[brace_idx : brace_idx + 140]):
        sub = cleaned[brace_idx:]
        sub_clean = re.sub(r",\s*([}\]])", r"\1", sub)
        try:
            dec = json.JSONDecoder(strict=False)
            obj, _ = dec.raw_decode(sub_clean)
            if isinstance(obj, dict):
                json_obj = obj
        except Exception:
            pass
    elif re.match(r'^"[a-zA-Z0-9_ -]+"\s*:\s*[\{"\[]', cleaned):
        try:
            obj = json.loads("{\n" + cleaned.rstrip().rstrip(",") + "\n}", strict=False)
            if isinstance(obj, dict):
                json_obj = obj
        except Exception:
            pass

    if json_obj is not None:
        keys = sorted(str(k) for k in json_obj.keys())
        keys_low = {k.lower() for k in keys}
        meta = json_obj.get("metadata") if isinstance(json_obj.get("metadata"), dict) else {}
        fw = str(meta.get("framework") or "").lower()
        if "latente" in fw or "latente_version" in keys_low or ("capture" in keys_low and "color_logic" in keys_low):
            dialect = "latente_v02"
        elif "visual_context" in keys_low or "vocabulary_register" in keys_low or ("subject" in keys_low and "color_grade" in keys_low):
            dialect = "nano_banana_g6"
        else:
            dialect = "fdr_v3"
        return "json", dialect, keys

    if "[shot_type]" in low or "[visual description" in low:
        headers = re.findall(r"\[([A-Z0-9_&\s()]+)\]", cleaned)
        return "sections", "fdr_direct", headers[:8] or ["SHOT_TYPE", "VISUAL DESCRIPTION"]
    if "body mechanics:" in low or "[body mechanics" in low or "studio editorial" in low or re.search(r"\bSTEP\s*[1-4]\b", cleaned, re.I):
        dialect = "studio_editorial_v5" if ("studio editorial" in low or "step 4" in low or "[body mechanics" in low) else "body_mechanics_12block"
        headers = re.findall(
            r"(?im)^\s*(?:\[([^\]]+)\]|(BODY MECHANICS|Wardrobe & materials|Lighting physics|Environment & props|Camera & sensor texture|EDITORIAL CONCEPT|STEP\s*[1-4]))",
            cleaned,
        )
        flat_headers = [next(x for x in tup if x).strip() for tup in headers if any(tup)]
        return "sections", dialect, flat_headers[:8] or ["IDENTITY", "BODY MECHANICS"]

    sec_matches = SECTION_LINE_RE.findall(cleaned)
    if len(sec_matches) >= 2:
        clean_secs = [s.strip().rstrip(":") for s in sec_matches[:8]]
        return "sections", "numbered_sections", clean_secs

    return "single_paragraph", "qwen_natural", ["single_paragraph"]


def compute_tier(percentile: int) -> str:
    if percentile >= 95:
        return "S"
    if percentile >= 80:
        return "A"
    if percentile >= 50:
        return "B"
    if percentile >= 20:
        return "C"
    return "D"


def classify_quadrant(percentile: int, maturity: float) -> str:
    if percentile >= 70 and maturity >= 60.0:
        return "raro_maduro"
    if percentile >= 70:
        return "raro_imaturo"
    if maturity >= 60.0:
        return "comum_maduro"
    return "comum_imaturo"


def clamp(v: float, lo: float, hi: float) -> float:
    return max(lo, min(hi, v))


def derive_project_label(
    source_lib: str,
    folder: str,
    eagle_tags: List[str],
    pm_tags: List[str],
    raw_prompt: str,
) -> str:
    if folder and folder != "Sem Pasta":
        return folder
    all_tags = eagle_tags + pm_tags
    for prefix in ("char:", "app:", "arq:"):
        for t in all_tags:
            if t.startswith(prefix):
                return f"GK · {t}"
    low = raw_prompt.lower()
    if "nano banana" in low or "nano_banana" in low:
        return "Gemini Kimi · Nano Banana"
    if "fdr" in low:
        return "Gemini Kimi · FDR"
    if "cycling" in low or "cyclist" in low:
        return "Gemini Kimi · Cycling Editorial"
    if "editorial" in low:
        return "Gemini Kimi · Editorial"
    return "Gemini Kimi + Antigravity" if source_lib == "gemini_kimi" else "Google Flow + Prompts"


def build_8_attributes(
    ast: Dict[str, Any],
    raw_prompt: str,
    macro_format: str,
    dialect: str,
    top_keys: List[str],
    project_label: str,
    eagle_tags: List[str],
    pm_tags: List[str],
    pose_meta: Dict[str, Any],
    tag_stats_map: Dict[Tuple[str, str], Tuple[int, float, float]],
) -> Tuple[Dict[str, Any], List[Dict[str, Any]]]:
    blocks = ast["blocks"]
    axis_tags = ast["axis_tags"]
    extras = ast.get("extras") or {}

    def collect_tag_stats(axes_and_tags: List[Tuple[str, List[str]]]) -> List[Dict[str, Any]]:
        out: List[Dict[str, Any]] = []
        seen = set()
        for ax, tlist in axes_and_tags:
            for t in tlist:
                if (ax, t) in seen:
                    continue
                seen.add((ax, t))
                cnt, pct, idf = tag_stats_map.get((ax, t), (1, 0.01, 10.0))
                out.append(
                    {
                        "axis": ax,
                        "tag": t,
                        "corpusCount": cnt,
                        "corpusPct": pct,
                        "idfWeight": idf,
                    }
                )
        return out

    suj_parts = [
        blocks["identity_subject"]["text"].strip(),
        blocks["body_mechanics_pose"]["text"].strip(),
    ]
    if pose_meta.get("pose_type"):
        yaw = pose_meta.get("yaw")
        pitch = pose_meta.get("pitch")
        roll = pose_meta.get("roll")
        suj_parts.append(f"[3D Pose: {pose_meta['pose_type']} yaw={yaw}° pitch={pitch}° roll={roll}°]")
    suj_text = " | ".join(p for p in suj_parts if p)
    suj_tags = list(dict.fromkeys((axis_tags.get("pose") or []) + (blocks["identity_subject"].get("tags") or [])))
    suj_stats = collect_tag_stats([("pose", axis_tags.get("pose") or []), ("identity", blocks["identity_subject"].get("tags") or [])])

    cen_text = blocks["environment_props"]["text"].strip()
    cen_tags = list(axis_tags.get("environment") or [])
    cen_stats = collect_tag_stats([("environment", cen_tags)])

    luz_text = blocks["lighting_physics"]["text"].strip()
    luz_tags = list(axis_tags.get("lighting") or [])
    luz_stats = collect_tag_stats([("lighting", luz_tags)])

    cam_text = blocks["camera_framing_occlusion"]["text"].strip()
    cam_tags = list(axis_tags.get("angle") or [])
    cam_stats = collect_tag_stats([("angle", cam_tags)])

    mat_text = blocks["wardrobe_materials"]["text"].strip()
    mat_tags = list(dict.fromkeys((axis_tags.get("fabric") or []) + (axis_tags.get("wardrobe") or []) + (axis_tags.get("color") or [])))
    mat_stats = collect_tag_stats(
        [
            ("fabric", axis_tags.get("fabric") or []),
            ("wardrobe", axis_tags.get("wardrobe") or []),
            ("color", axis_tags.get("color") or []),
        ]
    )

    est_parts = [blocks["color_sensor_context"]["text"].strip()]
    vc = extras.get("visual_context") or {}
    if isinstance(vc, dict) and vc.get("primary_lineage"):
        est_parts.insert(0, f"Lineage: {vc['primary_lineage']}")
    if extras.get("color_grade"):
        cg = extras["color_grade"]
        if isinstance(cg, dict):
            est_parts.append("; ".join(f"{k}: {v}" for k, v in list(cg.items())[:3]))
        elif isinstance(cg, str):
            est_parts.append(cg)
    est_text = " | ".join(p for p in est_parts if p)
    est_tags = list(dict.fromkeys((blocks["color_sensor_context"].get("tags") or []) + [t for t in eagle_tags if t.startswith("estilo:")]))
    est_stats = collect_tag_stats([("sensor", blocks["color_sensor_context"].get("tags") or [])])

    proj_tags = [t for t in (eagle_tags + pm_tags) if t.startswith(("char:", "app:", "arq:", "mod:", "estilo:"))][:8]
    proj_filled = project_label not in ("Sem Pasta", "Sem Projeto") or bool(proj_tags)

    has_neg = bool(extras.get("has_explicit_negative"))
    neg_flag = "neg1" if has_neg else "neg0"
    norm_keys = "+".join(re.sub(r"[^a-z0-9_]+", "_", k.lower()).strip("_") for k in top_keys[:6]) or "prose"
    skeleton_sig = f"{macro_format}:{dialect}:{norm_keys}:{neg_flag}"

    core_slots = [
        ("sujeito", suj_text, suj_tags),
        ("cenario", cen_text, cen_tags),
        ("luz", luz_text, luz_tags),
        ("camera", cam_text, cam_tags),
        ("textura_material", mat_text, mat_tags),
        ("estilo", est_text, est_tags),
    ]
    filled_count = sum(1 for _, txt, tgs in core_slots if len(txt) >= 6 or len(tgs) > 0) + (1 if proj_filled else 0) + 1
    clean_pos = ast.get("clean_positive_text") or strip_conversational_preamble(raw_prompt)
    token_count = len(clean_pos.split())

    attributes = {
        "sujeito": {
            "text": suj_text,
            "tags": suj_tags,
            "filled": len(suj_text) >= 6 or len(suj_tags) > 0,
            "tagStats": suj_stats,
        },
        "cenario": {
            "text": cen_text,
            "tags": cen_tags,
            "filled": len(cen_text) >= 6 or len(cen_tags) > 0,
            "tagStats": cen_stats,
        },
        "luz": {
            "text": luz_text,
            "tags": luz_tags,
            "filled": len(luz_text) >= 6 or len(luz_tags) > 0,
            "tagStats": luz_stats,
        },
        "camera": {
            "text": cam_text,
            "tags": cam_tags,
            "filled": len(cam_text) >= 6 or len(cam_tags) > 0,
            "tagStats": cam_stats,
        },
        "textura_material": {
            "text": mat_text,
            "tags": mat_tags,
            "filled": len(mat_text) >= 6 or len(mat_tags) > 0,
            "tagStats": mat_stats,
        },
        "estilo": {
            "text": est_text,
            "tags": est_tags,
            "filled": len(est_text) >= 6 or len(est_tags) > 0,
            "tagStats": est_stats,
        },
        "projeto_cliente": {
            "text": project_label,
            "tags": proj_tags,
            "filled": proj_filled,
            "tagStats": [],
        },
        "estrutura": {
            "text": f"{macro_format.upper()} · {dialect} · {', '.join(top_keys[:4])}",
            "tags": [macro_format, dialect],
            "filled": True,
            "tagStats": [],
            "macroFormat": macro_format,
            "kernelDialect": dialect,
            "skeletonSignature": skeleton_sig,
            "filledAttributesCount": filled_count,
            "hasExplicitNegative": has_neg,
            "aspectRatio": ast.get("aspect_ratio") or "3:4",
            "tokenCount": token_count,
            "topKeysOrSections": top_keys,
        },
    }

    all_tag_stats = suj_stats + cen_stats + luz_stats + cam_stats + mat_stats + est_stats
    return attributes, all_tag_stats


def main() -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    if not ALFA_DB.exists():
        raise FileNotFoundError(f"Banco Alfa não encontrado em: {ALFA_DB}")

    conn_alfa = open_ro(ALFA_DB)
    conn_pm = open_ro(POSEMATCH_DB) if POSEMATCH_DB.exists() else None

    try:
        cur = conn_alfa.cursor()

        total_corpus = cur.execute("SELECT COUNT(*) FROM prompts").fetchone()[0]
        gk_count = cur.execute("SELECT COUNT(*) FROM prompts WHERE source_lib='gemini_kimi'").fetchone()[0]

        tag_stats_map: Dict[Tuple[str, str], Tuple[int, float, float]] = {}
        for row in cur.execute("SELECT category, tag, count, percentage FROM tag_stats").fetchall():
            cnt = int(row["count"] or 0)
            pct = float(row["percentage"] or 0.0)
            idf = round(math.log2((total_corpus + 1.0) / (cnt + 1.0)), 3)
            tag_stats_map[(row["category"], row["tag"])] = (cnt, pct, idf)

        cooc_map: Dict[Tuple[str, str, str, str], int] = {}
        for row in cur.execute("SELECT cat_a, tag_a, cat_b, tag_b, count FROM cooccurrence").fetchall():
            cooc_map[(row["cat_a"], row["tag_a"], row["cat_b"], row["tag_b"])] = int(row["count"])
            cooc_map[(row["cat_b"], row["tag_b"], row["cat_a"], row["tag_a"])] = int(row["count"])

        pm_tags_by_id: Dict[str, List[str]] = {}
        if conn_pm is not None:
            for r in conn_pm.execute("SELECT item_id, tag FROM item_tags").fetchall():
                pm_tags_by_id.setdefault(r["item_id"], []).append(r["tag"])

        # 1. Passagem rápida 100% em RAM sobre os 22.285 prompts
        all_rows = cur.execute(
            """
            SELECT source_lib, item_id, title, folder, dialect, raw_prompt,
                   axis_tags_json, extras_json, pose_type, yaw, pitch, roll, badge,
                   star, eagle_tags_count, face_confidence
            FROM prompts
            """
        ).fetchall()

        skeleton_counts: Counter = Counter()
        corpus_scores: List[float] = []
        pre_candidates: List[Dict[str, Any]] = []

        for r in all_rows:
            raw = r["raw_prompt"] or ""
            ax = json.loads(r["axis_tags_json"] or "{}")
            macro_fmt, detected_dialect, top_keys = detect_macro_and_dialect(raw, r["dialect"])
            extras = json.loads(r["extras_json"] or "{}")
            has_neg = bool(extras.get("has_explicit_negative"))
            norm_keys = "+".join(re.sub(r"[^a-z0-9_]+", "_", k.lower()).strip("_") for k in top_keys[:6]) or "prose"
            skel_sig = f"{macro_fmt}:{detected_dialect}:{norm_keys}:{'neg1' if has_neg else 'neg0'}"
            skeleton_counts[skel_sig] += 1

            idfs: List[float] = []
            for axis_name, tlist in ax.items():
                for t in tlist or []:
                    _, _, idf = tag_stats_map.get((axis_name, t), (1, 0.01, 10.0))
                    idfs.append(idf)
            idfs.sort(reverse=True)
            top_idfs = idfs[:8]
            mean_idf = sum(top_idfs) / len(top_idfs) if top_idfs else 1.5

            pair_idfs: List[float] = []
            for ca, cb in VALID_HEATMAP_PAIRS:
                for ta in (ax.get(ca) or [])[:2]:
                    for tb in (ax.get(cb) or [])[:2]:
                        c_pair = cooc_map.get((ca, ta, cb, tb), 0)
                        pair_idfs.append(math.log2((total_corpus + 1.0) / (c_pair + 1.0)))
            pair_bonus = (sum(sorted(pair_idfs, reverse=True)[:4]) / 4.0) * 0.25 if pair_idfs else 0.0
            raw_rarity = round(mean_idf + pair_bonus, 3)
            corpus_scores.append(raw_rarity)

            if r["source_lib"] in ("gemini_kimi", "google_flow") and is_clean_prompt(raw):
                pre_candidates.append(
                    {
                        "row": r,
                        "raw_rarity": raw_rarity,
                        "pair_bonus": pair_bonus,
                        "macro_fmt": macro_fmt,
                        "detected_dialect": detected_dialect,
                        "top_keys": top_keys,
                        "skel_sig": skel_sig,
                        "has_neg": has_neg,
                        "ax_count": sum(1 for v in ax.values() if v),
                    }
                )

        corpus_scores.sort()

        # 2. Classifica os candidatos em memória por (source_lib, tier, macro_fmt) e
        #    seleciona apenas ~320 candidatos diversos para verificar miniatura em disco + rodar AST completa
        for pc in pre_candidates:
            rank = bisect.bisect_right(corpus_scores, pc["raw_rarity"])
            pct = max(1, min(99, round((rank / len(corpus_scores)) * 100)))
            pc["rank"] = rank
            pc["percentile"] = pct
            pc["tier"] = compute_tier(pct)

        shortlist: List[Dict[str, Any]] = []
        seen_short_dedup = set()

        def add_to_shortlist(pool: List[Dict[str, Any]], cap: int) -> None:
            added = 0
            for pc in pool:
                dedup = strip_conversational_preamble(pc["row"]["raw_prompt"])[:120].lower()
                if dedup in seen_short_dedup:
                    continue
                seen_short_dedup.add(dedup)
                shortlist.append(pc)
                added += 1
                if added >= cap:
                    break

        gk_pre = [pc for pc in pre_candidates if pc["row"]["source_lib"] == "gemini_kimi"]
        gf_pre = [pc for pc in pre_candidates if pc["row"]["source_lib"] == "google_flow"]
        gk_pre.sort(key=lambda pc: (pc["ax_count"], pc["percentile"]), reverse=True)
        gf_pre.sort(key=lambda pc: (pc["row"]["star"] or 0, pc["ax_count"], pc["percentile"]), reverse=True)

        for tier in ("S", "A", "B", "C", "D"):
            for fmt in ("sections", "single_paragraph", "json"):
                add_to_shortlist(
                    [pc for pc in gk_pre if pc["tier"] == tier and pc["macro_fmt"] == fmt],
                    15,
                )
        for proj in ("Iberica character", "Character Infusion", "Lua's Collection", "Eccomerce style", "Imagen 4"):
            for fmt in ("sections", "single_paragraph", "json"):
                add_to_shortlist(
                    [pc for pc in gf_pre if proj.lower() in (pc["row"]["folder"] or "").lower() and pc["macro_fmt"] == fmt],
                    6,
                )

        # 3. Hidrata apenas a shortlist (miniaturas em disco + AST completa + maturidade)
        hydrated: List[Dict[str, Any]] = []
        for pc in shortlist:
            r = pc["row"]
            src = r["source_lib"]
            iid = r["item_id"]
            raw = r["raw_prompt"]

            thumb = resolve_thumbnail(src, iid)
            if thumb is None:
                continue

            eagle_meta = read_eagle_item_meta(src, iid)
            eagle_tags = [str(t) for t in (eagle_meta.get("tags") or [])]
            pm_tags = pm_tags_by_id.get(iid, [])
            btime = int(eagle_meta.get("btime") or eagle_meta.get("mtime") or 0)

            pose_meta = {
                "pose_type": r["pose_type"],
                "yaw": r["yaw"],
                "pitch": r["pitch"],
                "roll": r["roll"],
                "badge": r["badge"],
                "face_confidence": r["face_confidence"],
            }
            ast = parse_prompt_to_ast(strip_conversational_preamble(raw), pose_meta=pose_meta)
            project_label = derive_project_label(src, r["folder"], eagle_tags, pm_tags, raw)

            attributes, all_tag_stats = build_8_attributes(
                ast=ast,
                raw_prompt=raw,
                macro_format=pc["macro_fmt"],
                dialect=pc["detected_dialect"],
                top_keys=pc["top_keys"],
                project_label=project_label,
                eagle_tags=eagle_tags,
                pm_tags=pm_tags,
                pose_meta=pose_meta,
                tag_stats_map=tag_stats_map,
            )

            skel_sig = attributes["estrutura"]["skeletonSignature"]
            skel_reuse = skeleton_counts.get(skel_sig, 1)

            reuse_norm = clamp(math.log10(max(1, skel_reuse) + 1) / math.log10(1200), 0.0, 1.0)
            skeleton_reuse_score = round(reuse_norm * 100.0, 1)

            core_keys = ("sujeito", "cenario", "luz", "camera", "textura_material", "estilo")
            core_filled = sum(1 for k in core_keys if attributes[k]["filled"])
            total_filled = attributes["estrutura"]["filledAttributesCount"]
            completeness_score = round(clamp((core_filled / len(core_keys)) * 0.75 + (total_filled / 8.0) * 0.25, 0.0, 1.0) * 100.0, 1)

            cam_low = attributes["camera"]["text"].lower()
            luz_low = attributes["luz"]["text"].lower()
            suj_low = attributes["sujeito"]["text"].lower()
            tech_signals = 0.0
            if re.search(r"\b(\d{2,3}mm|f/\d|iphone|canon|sony|hasselblad|leica|fujifilm|35mm|85mm)\b", cam_low):
                tech_signals += 1.0
            if re.search(r"\b(kelvin|\d{4}k|flash|softbox|strobe|window|chiaroscuro|backlight|daylight|sunlight|luz)\b", luz_low):
                tech_signals += 1.0
            if re.search(r"\b(facs|pores|poros|weight|pelvis|torso|shoulder|ombro|olhar|gaze|expression|pose)\b", suj_low):
                tech_signals += 1.0
            if attributes["estrutura"]["hasExplicitNegative"]:
                tech_signals += 1.0
            if attributes["estrutura"]["tokenCount"] >= 90:
                tech_signals += 0.5
            technical_precision_score = round(clamp(tech_signals / 4.5, 0.0, 1.0) * 100.0, 1)

            tags_cnt = max(len(eagle_tags), int(r["eagle_tags_count"] or 0), len(pm_tags))
            star_val = int(eagle_meta.get("star") or r["star"] or 0)
            curation_raw = clamp(tags_cnt / 14.0, 0.0, 0.55) + clamp(star_val / 5.0, 0.0, 0.30)
            if r["face_confidence"] is not None and float(r["face_confidence"]) >= 80.0:
                curation_raw += 0.15
            elif attributes["projeto_cliente"]["filled"] and project_label != "Sem Projeto":
                curation_raw += 0.12
            curation_score = round(clamp(curation_raw, 0.0, 1.0) * 100.0, 1)

            maturity_score = round(
                clamp(
                    0.34 * skeleton_reuse_score
                    + 0.36 * completeness_score
                    + 0.18 * technical_precision_score
                    + 0.12 * curation_score,
                    0.0,
                    100.0,
                ),
                1,
            )
            percentile = pc["percentile"]
            tier = pc["tier"]
            quadrant = classify_quadrant(percentile, maturity_score)

            all_tag_stats_sorted = sorted(all_tag_stats, key=lambda x: x["idfWeight"], reverse=True)
            top_idf_vals = [x["idfWeight"] for x in all_tag_stats_sorted[:8]]
            mean_idf = round(sum(top_idf_vals) / len(top_idf_vals), 3) if top_idf_vals else 1.5

            clean_prompt = strip_conversational_preamble(raw)
            excerpt_src = next(
                (
                    attributes[k]["text"]
                    for k in ("sujeito", "cenario", "luz")
                    if len(attributes[k]["text"]) > 12
                ),
                ast.get("clean_positive_text") or clean_prompt,
            )
            excerpt = re.sub(r"\s+", " ", excerpt_src).strip()[:175]

            hydrated.append(
                {
                    "id": iid,
                    "sourceLib": src,
                    "title": str(eagle_meta.get("name") or r["title"] or iid),
                    "project": project_label,
                    "folders": [r["folder"]] if r["folder"] and r["folder"] != "Sem Pasta" else [],
                    "eagleTags": eagle_tags[:16],
                    "star": star_val,
                    "btime": btime,
                    "thumbnailUrl": f"/api/thumbnail/{src}/{iid}",
                    "rawPrompt": raw,
                    "cleanPrompt": clean_prompt,
                    "excerpt": excerpt,
                    "attributes": attributes,
                    "rarity": {
                        "score": pc["raw_rarity"],
                        "percentile": percentile,
                        "label": f"mais raro que {percentile}% da coleção",
                        "tier": tier,
                        "meanIdf": mean_idf,
                        "pairRarityBonus": round(pc["pair_bonus"], 3),
                        "rarestTags": all_tag_stats_sorted[:5],
                        "corpusRank": pc["rank"],
                        "corpusSize": total_corpus,
                    },
                    "maturity": {
                        "score": maturity_score,
                        "skeletonReuseCount": skel_reuse,
                        "skeletonReuseScore": skeleton_reuse_score,
                        "completenessScore": completeness_score,
                        "technicalPrecisionScore": technical_precision_score,
                        "curationScore": curation_score,
                    },
                    "quadrant": quadrant,
                    "poseTelemetry": {
                        "poseType": r["pose_type"] or "",
                        "yaw": r["yaw"],
                        "pitch": r["pitch"],
                        "roll": r["roll"],
                        "badge": r["badge"] or "",
                        "faceConfidence": r["face_confidence"],
                    }
                    if r["pose_type"]
                    else None,
                    "_dedup_key": clean_prompt[:140].lower(),
                }
            )

        # 4. Seleção final balanceada de exatos 50 prompts reais
        #    Garante ~6 S, ~11 A, ~15 B, ~11 C, ~7 D e equilíbrio entre JSON / Seções / Parágrafo Único
        selected: List[Dict[str, Any]] = []
        used_ids = set()
        used_dedup = set()

        def try_pick(pool: List[Dict[str, Any]], max_n: int) -> None:
            for item in pool:
                if len(selected) >= 50 or max_n <= 0:
                    break
                if item["id"] in used_ids or item["_dedup_key"] in used_dedup:
                    continue
                selected.append(item)
                used_ids.add(item["id"])
                used_dedup.add(item["_dedup_key"])
                max_n -= 1

        gk_hyd = [c for c in hydrated if c["sourceLib"] == "gemini_kimi"]
        gf_hyd = [c for c in hydrated if c["sourceLib"] == "google_flow"]

        # Quotas exatas por Tier dentro de Gemini Kimi (total 38) + Google Flow (12)
        tier_targets_gk = [("S", 5), ("A", 9), ("B", 11), ("C", 8), ("D", 5)]
        for tier_name, count_target in tier_targets_gk:
            for fmt in ("json", "single_paragraph", "sections"):
                sub = [
                    c
                    for c in gk_hyd
                    if c["rarity"]["tier"] == tier_name and c["attributes"]["estrutura"]["macroFormat"] == fmt
                ]
                try_pick(sub, max(1, count_target // 3))
            already_tier = sum(1 for s in selected if s["sourceLib"] == "gemini_kimi" and s["rarity"]["tier"] == tier_name)
            if already_tier < count_target:
                try_pick([c for c in gk_hyd if c["rarity"]["tier"] == tier_name], count_target - already_tier)

        for proj in ("Iberica character", "Character Infusion", "Lua's Collection", "Eccomerce style", "Imagen 4"):
            try_pick([c for c in gf_hyd if proj.lower() in c["project"].lower() and c["rarity"]["tier"] != "S"], 2)

        for quad in ("raro_maduro", "raro_imaturo", "comum_maduro", "comum_imaturo"):
            curr_q = sum(1 for s in selected if s["quadrant"] == quad)
            if curr_q < 6:
                try_pick(
                    [c for c in gk_hyd + gf_hyd if c["quadrant"] == quad and c["rarity"]["tier"] != "S"],
                    6 - curr_q,
                )

        # Completa preservando teto de Tier S e equilíbrio entre formatos
        for fmt in ("json", "single_paragraph", "sections"):
            if len(selected) >= 50:
                break
            curr_fmt = sum(1 for s in selected if s["attributes"]["estrutura"]["macroFormat"] == fmt)
            if curr_fmt < 16:
                pool_fmt = [
                    c
                    for c in gk_hyd + gf_hyd
                    if c["attributes"]["estrutura"]["macroFormat"] == fmt and c["rarity"]["tier"] != "S"
                ]
                try_pick(pool_fmt, min(16 - curr_fmt, 50 - len(selected)))

        if len(selected) < 50:
            try_pick([c for c in gk_hyd + gf_hyd if c["rarity"]["tier"] != "S"], 50 - len(selected))
        if len(selected) < 50:
            try_pick(gk_hyd + gf_hyd, 50 - len(selected))

        for s in selected:
            s.pop("_dedup_key", None)
        selected.sort(key=lambda s: (s["rarity"]["percentile"], s["maturity"]["score"]), reverse=True)

        # 5. Prévia real de Gaps (O=0 na matriz de Gemini Kimi + pares válidos de eixos)
        gk_tag_cnt: Counter = Counter()
        gk_cooc: Counter = Counter()
        gk_rows = cur.execute("SELECT axis_tags_json FROM prompts WHERE source_lib='gemini_kimi'").fetchall()
        for gr in gk_rows:
            ax = json.loads(gr["axis_tags_json"] or "{}")
            for cat, tlist in ax.items():
                for t in tlist or []:
                    gk_tag_cnt[(cat, t)] += 1
            for ca, cb in VALID_HEATMAP_PAIRS:
                for ta in ax.get(ca) or []:
                    for tb in ax.get(cb) or []:
                        gk_cooc[(ca, ta, cb, tb)] += 1

        gap_previews: List[Dict[str, Any]] = []
        gk_n = max(1, len(gk_rows))
        for ca, cb in VALID_HEATMAP_PAIRS:
            tags_a = list(HEATMAP_AXES.get(ca, {}).keys())
            tags_b = list(HEATMAP_AXES.get(cb, {}).keys())
            for ta in tags_a:
                cnt_a = gk_tag_cnt.get((ca, ta), 0)
                if cnt_a < 15:
                    continue
                for tb in tags_b:
                    cnt_b = gk_tag_cnt.get((cb, tb), 0)
                    if cnt_b < 15:
                        continue
                    obs = gk_cooc.get((ca, ta, cb, tb), 0)
                    if obs != 0:
                        continue
                    exp = round((cnt_a * cnt_b) / gk_n, 2)
                    if exp < 0.4:
                        continue
                    dummy_blocks = {
                        "environment_props": {"text": ta if ca == "environment" else (tb if cb == "environment" else "")},
                        "lighting_physics": {"text": ta if ca == "lighting" else (tb if cb == "lighting" else "")},
                        "wardrobe_materials": {"text": ta if ca == "wardrobe" else (tb if cb == "wardrobe" else "")},
                        "camera_framing_occlusion": {"text": ta if ca == "angle" else (tb if cb == "angle" else "")},
                        "body_mechanics_pose": {"text": ta if ca == "pose" else (tb if cb == "pose" else "")},
                    }
                    coherent, _ = check_physical_and_empirical_coherence(dummy_blocks, conn=None, axis_tags={ca: [ta], cb: [tb]})
                    if coherent:
                        gap_previews.append(
                            {
                                "axisA": ca,
                                "tagA": ta,
                                "freqA": cnt_a,
                                "axisB": cb,
                                "tagB": tb,
                                "freqB": cnt_b,
                                "observedCount": 0,
                                "expectedCount": exp,
                            }
                        )
        gap_previews.sort(key=lambda g: g["expectedCount"], reverse=True)

        fmt_dist = Counter(s["attributes"]["estrutura"]["macroFormat"] for s in selected)
        tier_dist = Counter(s["rarity"]["tier"] for s in selected)
        quad_dist = Counter(s["quadrant"] for s in selected)

        payload = {
            "stats": {
                "generatedAt": datetime.now(timezone.utc).isoformat(),
                "totalCorpusSize": total_corpus,
                "geminiKimiSize": gk_count,
                "sampleSize": len(selected),
                "sourcesReadOnly": [
                    {
                        "name": "Gemini Kimi + Antigravity.library",
                        "path": str(GEMINI_KIMI_LIB),
                        "count": gk_count,
                        "mode": "READ_ONLY",
                    },
                    {
                        "name": "Projeto Alfa (prompt_dna.sqlite)",
                        "path": str(ALFA_DB),
                        "count": total_corpus,
                        "mode": "READ_ONLY",
                    },
                    {
                        "name": "PoseMatch (posematch_eagle.sqlite)",
                        "path": str(POSEMATCH_DB),
                        "count": 15086 if POSEMATCH_DB.exists() else 0,
                        "mode": "READ_ONLY",
                    },
                ],
                "formatDistribution": {
                    "json": fmt_dist.get("json", 0),
                    "sections": fmt_dist.get("sections", 0),
                    "single_paragraph": fmt_dist.get("single_paragraph", 0),
                },
                "tierDistribution": {
                    "S": tier_dist.get("S", 0),
                    "A": tier_dist.get("A", 0),
                    "B": tier_dist.get("B", 0),
                    "C": tier_dist.get("C", 0),
                    "D": tier_dist.get("D", 0),
                },
                "quadrantDistribution": {
                    "raro_maduro": quad_dist.get("raro_maduro", 0),
                    "raro_imaturo": quad_dist.get("raro_imaturo", 0),
                    "comum_maduro": quad_dist.get("comum_maduro", 0),
                    "comum_imaturo": quad_dist.get("comum_imaturo", 0),
                },
                "sampleGapPreviews": gap_previews[:12],
            },
            "items": selected,
        }

        OUTPUT_JSON.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")

        tmp_db = OUTPUT_DB.with_suffix(".sqlite.tmp")
        if tmp_db.exists():
            tmp_db.unlink()
        out_conn = sqlite3.connect(tmp_db)
        try:
            ocur = out_conn.cursor()
            ocur.executescript(
                """
                PRAGMA journal_mode = WAL;
                CREATE TABLE prompts (
                    id TEXT PRIMARY KEY,
                    source_lib TEXT NOT NULL,
                    title TEXT NOT NULL,
                    raw_prompt TEXT NOT NULL,
                    clean_prompt TEXT NOT NULL,
                    macro_format TEXT NOT NULL,
                    kernel_dialect TEXT NOT NULL,
                    skeleton_signature TEXT NOT NULL,
                    project_name TEXT NOT NULL,
                    thumbnail_url TEXT,
                    btime INTEGER,
                    star INTEGER DEFAULT 0,
                    eagle_tags_json TEXT NOT NULL,
                    rarity_score REAL NOT NULL,
                    rarity_percentile INTEGER NOT NULL,
                    rarity_label TEXT NOT NULL,
                    rarity_tier TEXT NOT NULL,
                    maturity_score REAL NOT NULL,
                    quadrant TEXT NOT NULL,
                    attributes_json TEXT NOT NULL,
                    rarity_breakdown_json TEXT NOT NULL,
                    maturity_breakdown_json TEXT NOT NULL
                );
                CREATE TABLE prompt_attributes (
                    prompt_id TEXT NOT NULL,
                    attribute_key TEXT NOT NULL,
                    extracted_text TEXT NOT NULL,
                    tags_json TEXT NOT NULL,
                    is_filled INTEGER NOT NULL,
                    PRIMARY KEY (prompt_id, attribute_key)
                );
                CREATE TABLE attribute_frequencies (
                    axis TEXT NOT NULL,
                    tag TEXT NOT NULL,
                    corpus_count INTEGER NOT NULL,
                    corpus_pct REAL NOT NULL,
                    idf_weight REAL NOT NULL,
                    PRIMARY KEY (axis, tag)
                );
                CREATE TABLE skeleton_lineages (
                    skeleton_signature TEXT PRIMARY KEY,
                    macro_format TEXT NOT NULL,
                    kernel_dialect TEXT NOT NULL,
                    corpus_usage_count INTEGER NOT NULL,
                    avg_maturity REAL NOT NULL
                );
                """
            )
            for item in selected:
                est = item["attributes"]["estrutura"]
                ocur.execute(
                    "INSERT INTO prompts VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
                    (
                        item["id"],
                        item["sourceLib"],
                        item["title"],
                        item["rawPrompt"],
                        item["cleanPrompt"],
                        est["macroFormat"],
                        est["kernelDialect"],
                        est["skeletonSignature"],
                        item["project"],
                        item["thumbnailUrl"],
                        item["btime"],
                        item["star"],
                        json.dumps(item["eagleTags"], ensure_ascii=False),
                        item["rarity"]["score"],
                        item["rarity"]["percentile"],
                        item["rarity"]["label"],
                        item["rarity"]["tier"],
                        item["maturity"]["score"],
                        item["quadrant"],
                        json.dumps(item["attributes"], ensure_ascii=False),
                        json.dumps(item["rarity"], ensure_ascii=False),
                        json.dumps(item["maturity"], ensure_ascii=False),
                    ),
                )
                for attr_key, slot in item["attributes"].items():
                    ocur.execute(
                        "INSERT INTO prompt_attributes VALUES (?,?,?,?,?)",
                        (
                            item["id"],
                            attr_key,
                            slot["text"],
                            json.dumps(slot.get("tags") or [], ensure_ascii=False),
                            1 if slot.get("filled") else 0,
                        ),
                    )
            for (ax, tg), (cnt, pct, idf) in tag_stats_map.items():
                ocur.execute("INSERT INTO attribute_frequencies VALUES (?,?,?,?,?)", (ax, tg, cnt, pct, idf))

            skel_mat_acc: Dict[str, List[float]] = {}
            skel_meta: Dict[str, Tuple[str, str]] = {}
            for item in selected:
                est = item["attributes"]["estrutura"]
                sig = est["skeletonSignature"]
                skel_mat_acc.setdefault(sig, []).append(item["maturity"]["score"])
                skel_meta[sig] = (est["macroFormat"], est["kernelDialect"])
            for sig, vals in skel_mat_acc.items():
                mf, kd = skel_meta[sig]
                ocur.execute(
                    "INSERT INTO skeleton_lineages VALUES (?,?,?,?,?)",
                    (sig, mf, kd, skeleton_counts.get(sig, 1), round(sum(vals) / len(vals), 2)),
                )
            out_conn.commit()
        finally:
            out_conn.close()

        if OUTPUT_DB.exists():
            OUTPUT_DB.unlink()
        tmp_db.replace(OUTPUT_DB)

        print(f"[Ingest] Corpus total (RO): {total_corpus} | Gemini Kimi: {gk_count}")
        print(f"[Ingest] Shortlist hidratada: {len(hydrated)} -> Amostra final: {len(selected)} prompts")
        print(f"[Ingest] Formatos: {dict(fmt_dist)}")
        print(f"[Ingest] Tiers: {dict(tier_dist)}")
        print(f"[Ingest] Quadrantes: {dict(quad_dist)}")
        print(f"[Ingest] Fontes na amostra: {dict(Counter(s['sourceLib'] for s in selected))}")
        print(f"[Ingest] Top Gaps reais (O=0, E>=5.0): {len(gap_previews)} candidatos")
    finally:
        conn_alfa.close()
        if conn_pm is not None:
            conn_pm.close()


if __name__ == "__main__":
    main()
