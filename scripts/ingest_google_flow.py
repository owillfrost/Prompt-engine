"""
Ingestão Completa 100% Read-Only (Sync Direto Eagle + Cache AST Incremental) -> SQLite FTS5 + Mapa + Suíte JSON.

Fontes lidas exclusivamente em modo Read-Only:
  1. D:\\Meus Documentos\\Imagens\\Eagle.cool\\Google Flow + Prompts.library
  2. D:\\Meus Documentos\\Imagens\\Eagle.cool\\Gemini Kimi + Antigravity.library
  3. B:\\AntiGravity\\Projeto Alfa\\data\\prompt_dna.sqlite (?mode=ro, seed inicial opcional)
  4. C:\\Users\\conta\\Documents\\antigravity\\fearless-euclid\\data\\posematch_eagle.sqlite (?mode=ro)
  5. C:\\Users\\conta\\Documents\\antigravity\\calm-brahmagupta\\.omnimage\\embeddings\\*.bin

Saídas gravadas apenas em b:\\AntiGravity\\Prompt-EngineV1\\data\\:
  - ast_cache.sqlite (cache incremental local da AST de 8 blocos por item_id + mtime_ms)
  - prompt_engine_v1.sqlite (todos os prompts ativos + tabela virtual prompts_fts FTS5 + vetores semânticos 24d + sync_meta)
  - suite_google_flow.json (metadados globais, clusters, manchas vazias, pares, matrizes 2D, gaps, projetos)
"""

from __future__ import annotations

import argparse
import bisect
import json
import math
import os
import re
import sqlite3
import struct
import sys
import time
from collections import Counter
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

import numpy as np

PROJECT_ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = PROJECT_ROOT / "data"
OUTPUT_SUITE_JSON = DATA_DIR / "suite_google_flow.json"
OUTPUT_DB = DATA_DIR / "prompt_engine_v1.sqlite"
AST_CACHE_DB = DATA_DIR / "ast_cache.sqlite"

ALFA_ROOT = Path(r"B:\AntiGravity\Projeto Alfa")
ALFA_DB = ALFA_ROOT / "data" / "prompt_dna.sqlite"
POSEMATCH_DB = Path(r"C:\Users\conta\Documents\antigravity\fearless-euclid\data\posematch_eagle.sqlite")
GEMMA2_BIN = Path(
    r"C:\Users\conta\Documents\antigravity\calm-brahmagupta\.omnimage\embeddings\embeddings-google-flow.gemma2.bin"
)
CLIP_BIN = Path(
    r"C:\Users\conta\Documents\antigravity\calm-brahmagupta\.omnimage\embeddings\embeddings-google-flow.bin"
)

GOOGLE_FLOW_LIB = Path(r"D:\Meus Documentos\Imagens\Eagle.cool\Google Flow + Prompts.library")
GOOGLE_FLOW_IMAGES = GOOGLE_FLOW_LIB / "images"
GEMINI_KIMI_LIB = Path(r"D:\Meus Documentos\Imagens\Eagle.cool\Gemini Kimi + Antigravity.library")
GEMINI_KIMI_IMAGES = GEMINI_KIMI_LIB / "images"

if str(ALFA_ROOT) not in sys.path:
    sys.path.insert(0, str(ALFA_ROOT))

from backend.corpus_store import load_posematch_telemetry, read_eagle_folder_map  # type: ignore
from backend.domain_rules import check_physical_and_empirical_coherence  # type: ignore
from backend.ontology import AXIS_RARITY_PRIORITY  # type: ignore
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
    "i cannot fulfill",
    "i'm sorry, i can't",
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

AXIS_LABELS_PT = {
    "environment": "Cenário",
    "lighting": "Luz",
    "pose": "Sujeito / Pose",
    "angle": "Câmera / Ângulo",
    "fabric": "Textura / Tecido",
    "wardrobe": "Figurino",
    "color": "Cor",
    "motif": "Fronteira Criativa",
}

MATRIX_AXIS_PAIRS = [
    ("environment", "lighting"),
    ("pose", "angle"),
    ("pose", "environment"),
    ("fabric", "lighting"),
    ("wardrobe", "lighting"),
    ("angle", "environment"),
]

TAG_PT_NAMES = {
    "standing_static": "Em pé estático",
    "mirror_selfie_pose": "Selfie no espelho",
    "seated_relaxed": "Sentada relaxada",
    "reclining_lying": "Deitada / recostada",
    "crouching_squat": "Agachada",
    "walking_stride": "Caminhando",
    "leaning_architectural": "Apoiada / inclinada",
    "counter_rotation_twist": "Contra-rotação",
    "action_airborne_dynamic": "Ação dinâmica",
    "hands_tactile_framing": "Mãos táteis / rosto",
    "frontal_eye_level": "Frontal eye-level",
    "arm_length_pov": "POV braço estendido",
    "high_angle_plongee": "Plongée (de cima)",
    "low_angle_contra_plongee": "Contra-plongée",
    "three_quarter_profile": "Perfil 3/4",
    "dorsal_over_shoulder": "Dorsal / ombro",
    "dutch_tilt_roll": "Dutch roll",
    "close_up_macro": "Close-up / macro",
    "three_plane_occlusion": "Oclusão 3 planos",
    "wide_angle_smartphone_optics": "Grande-angular / celular",
    "telephoto_prime_optics": "Teleobjetiva / prime",
    "indoor_ambient_mixed": "Ambiente interna mista",
    "window_daylight_soft": "Luz de janela suave",
    "harsh_midday_sun": "Sol direto meio-dia",
    "studio_softbox_strobe": "Estúdio / softbox",
    "golden_hour_rim": "Golden hour / contra-luz",
    "direct_flash_on_axis": "Flash direto",
    "night_neon_sodium": "Noite / neon / sódio",
    "chiaroscuro_gobo_caustics": "Chiaroscuro / gobo",
    "bedroom_bed": "Quarto / cama",
    "bathroom_mirror": "Banheiro / espelho",
    "living_room_office": "Sala / escritório",
    "studio_seamless_backdrop": "Estúdio / fundo infinito",
    "beach_pool_water": "Praia / piscina / água",
    "urban_street_rooftop": "Rua / terraço urbano",
    "cafe_bar_restaurant": "Café / bar",
    "car_train_transit": "Carro / trânsito",
    "brutalist_museum_interior": "Concreto / museu",
    "botanical_greenhouse_nature": "Botânico / natureza",
    "cotton_jersey": "Algodão / malha",
    "denim_canvas": "Denim / sarja",
    "silk_satin_organza": "Seda / cetim",
    "wool_tweed_merino": "Lã / merino",
    "linen_raw": "Linho cru",
    "leather_suede": "Couro / camurça",
    "velvet_corduroy": "Veludo / cotelê",
    "lace_sheer_mesh": "Renda / tule",
    "technical_metallic_nylon": "Nylon técnico / metal",
    "tank_top_camisole": "Regata / camisole",
    "t_shirt_oversized": "Camiseta / camisa",
    "hoodie_sweatshirt": "Moletom / hoodie",
    "blazer_coat_jacket": "Blazer / casaco",
    "dress_slip": "Vestido / slip",
    "bikini_swimwear": "Biquíni / beachwear",
    "knitwear_turtleneck": "Tricô / gola alta",
    "tailored_trousers_skirt": "Alfaiataria / saia",
    "denim_jeans": "Jeans",
    "utilitarian_sport_nylon": "Utilitário / sport",
    "accessories_jewelry_shoes": "Acessórios / joias",
    "reference_identity_lock": "Identidade preservada",
    "natural_pores_unretouched": "Pele natural / poros",
    "facs_microexpression_gaze": "FACS / olhar",
    "brunette_dark_hair": "Cabelo escuro",
    "blonde_red_colored_hair": "Cabelo loiro / ruivo",
    "hair_styling_updo_bangs": "Coque / franja",
    "editorial_glam_makeup": "Make editorial",
    # Fronteiras Criativas
    "prism_refraction": "Prisma / refração espectral",
    "double_exposure": "Dupla exposição",
    "long_exposure": "Exposição longa / rastros",
    "projector_light": "Projeção / light mapping",
    "stained_glass": "Vitral / luz colorida",
    "candlelight_amber": "Luz de velas",
    "fisheye_optics": "Lente olho-de-peixe (fisheye)",
    "monochrome_noir": "Monocromático P&B / prata",
    "polaroid_patina": "Polaroid / pátina instantânea",
    "rain_wet_glass": "Chuva / vidro molhado",
    "fog_mist_veil": "Neblina / bruma atmosférica",
    "smoke_haze": "Fumaça / névoa densa",
    "snow_frost": "Neve / geada",
    "underwater_weightless": "Submerso / gravidade zero",
    "library_stacks": "Biblioteca / estantes altas",
    "subway_transit": "Metrô / plataforma",
    "elevator_box": "Elevador metálico",
    "supermarket_aisle": "Corredor de supermercado",
    "theater_stage": "Palco / teatro de veludo",
    "arcade_neon": "Arcade / fliperama neon",
    "greenhouse_glass": "Estufa de vidro / condensação",
    "stairwell_echo": "Escadaria arquitetônica",
    "feathers_plume": "Plumas / textura aérea",
    "sequins_sparkle": "Paetês / reflexos especulares",
    "surreal_dream": "Surrealismo onírico",
    "shadow_play_gobo": "Jogo de sombras / persiana",
    "laundromat_glow": "Lavanderia noturna",
}

MOTIF_KEYWORDS: Dict[str, Tuple[str, ...]] = {
    "prism_refraction": ("prism", "prismatic"),
    "double_exposure": ("double exposure", "double-exposure"),
    "long_exposure": ("long exposure", "long-exposure"),
    "projector_light": ("projector", "projection mapping"),
    "stained_glass": ("stained glass", "stained-glass"),
    "candlelight_amber": ("candlelight", "candles", "candle"),
    "fisheye_optics": ("fisheye",),
    "monochrome_noir": ("monochrome", "black and white", "black-and-white"),
    "polaroid_patina": ("polaroid",),
    "rain_wet_glass": ("rain", "raindrops", "raining"),
    "fog_mist_veil": ("fog", "foggy", "mist", "misty"),
    "smoke_haze": ("smoke", "atmospheric haze", "incense smoke"),
    "snow_frost": ("snow", "snowing", "frost"),
    "underwater_weightless": ("underwater", "submerged"),
    "library_stacks": ("library",),
    "subway_transit": ("subway", "metro platform"),
    "elevator_box": ("elevator",),
    "supermarket_aisle": ("supermarket", "grocery aisle"),
    "theater_stage": ("theater", "theatre"),
    "arcade_neon": ("arcade",),
    "greenhouse_glass": ("greenhouse", "estufa"),
    "stairwell_echo": ("stairwell",),
    "feathers_plume": ("feathers", "feather"),
    "sequins_sparkle": ("sequins", "sequin", "sequined"),
    "surreal_dream": ("surreal", "surrealism"),
    "shadow_play_gobo": ("shadow play", "venetian blind"),
    "laundromat_glow": ("laundromat",),
}
MOTIF_RES: Dict[str, re.Pattern[str]] = {
    k: re.compile(r"\b(?:" + "|".join(re.escape(w) for w in ws) + r")\b")
    for k, ws in MOTIF_KEYWORDS.items()
}
MOTIF_MICRO_LOCATIONS = {
    "library_stacks",
    "subway_transit",
    "elevator_box",
    "supermarket_aisle",
    "theater_stage",
    "arcade_neon",
    "greenhouse_glass",
    "stairwell_echo",
    "laundromat_glow",
}
GAP_BRIDGE_RE = re.compile(r'"gap_bridge"\s*:\s*"([^"]+)"', re.I)
FORBIDDEN_STRIP_RE = re.compile(
    r"(?:forbidden_terms|negative_prompt|\[NEGATIVE PROMPT[^\]]*\]|\bAvoid)\s*:?[^\n\]]*",
    re.I,
)


def extract_clean_motifs(text: str) -> List[str]:
    if not text:
        return []
    low = FORBIDDEN_STRIP_RE.sub("", text).lower()
    out: List[str] = []
    for mk, words in MOTIF_KEYWORDS.items():
        if any(w in low for w in words):
            if MOTIF_RES[mk].search(low):
                out.append(mk)
    return out


def is_frontier_pair_coherent(motif: str, ax2: str, t2: str, ax3: str, t3: str) -> bool:
    if motif in MOTIF_MICRO_LOCATIONS and ax2 == "environment":
        return False
    if motif == "underwater_weightless":
        if t2 in (
            "bedroom_bed",
            "bathroom_mirror",
            "living_room_office",
            "cafe_bar_restaurant",
            "car_train_transit",
            "studio_seamless_backdrop",
            "leather_suede",
            "wool_tweed_merino",
            "velvet_corduroy",
            "hoodie_sweatshirt",
            "blazer_coat_jacket",
            "knitwear_turtleneck",
        ):
            return False
        if t3 in ("direct_flash_on_axis", "indoor_ambient_mixed"):
            return False
    if motif == "snow_frost" and t2 in ("bikini_swimwear", "beach_pool_water", "bathroom_mirror", "bedroom_bed"):
        return False
    if motif == "candlelight_amber" and t3 in ("harsh_midday_sun", "window_daylight_soft", "studio_softbox_strobe"):
        return False
    if motif == "rain_wet_glass" and t2 == "studio_seamless_backdrop":
        return False
    if motif == "monochrome_noir" and t3 in ("night_neon_sodium",):
        return False
    if motif == "arcade_neon" and t3 in ("harsh_midday_sun", "window_daylight_soft"):
        return False
    if motif == "theater_stage" and t3 == "harsh_midday_sun":
        return False
    return True


CAM_TECH_RE = re.compile(r"\b(\d{2,3}mm|f/\d|iphone|canon|sony|hasselblad|leica|fujifilm|35mm|85mm)\b", re.I)
LUZ_TECH_RE = re.compile(r"\b(kelvin|\d{4}k|flash|softbox|strobe|window|chiaroscuro|backlight|daylight|sunlight|luz)\b", re.I)
SUJ_TECH_RE = re.compile(r"\b(facs|pores|poros|weight|pelvis|torso|shoulder|ombro|olhar|gaze|expression|pose)\b", re.I)
WORD_RE = re.compile(r"[a-z0-9à-ú_-]{3,}")


def human_tag(tag: str) -> str:
    return TAG_PT_NAMES.get(tag, tag.replace("_", " "))


def open_ro(db_path: Path) -> sqlite3.Connection:
    uri = f"{db_path.resolve().as_uri()}?mode=ro"
    conn = sqlite3.connect(uri, uri=True)
    conn.row_factory = sqlite3.Row
    return conn


def load_nonzero_embeddings(bin_path: Path) -> Tuple[Dict[str, int], np.ndarray]:
    if not bin_path.exists():
        return {}, np.zeros((0, 512), dtype=np.float32)
    buf = bin_path.read_bytes()
    hlen = struct.unpack("<I", buf[:4])[0]
    ids: List[str] = json.loads(buf[4 : 4 + hlen].decode("utf-8"))
    raw = np.frombuffer(buf, dtype=np.int8, offset=4 + hlen)
    dim = len(raw) // len(ids)
    mat = raw.reshape((len(ids), dim)).astype(np.float32)
    norms = np.linalg.norm(mat, axis=1)
    valid_mask = norms > 0
    mat[valid_mask] /= norms[valid_mask, None]
    if np.any(valid_mask):
        mean_v = mat[valid_mask].mean(axis=0, keepdims=True)
        mat[valid_mask] -= mean_v
        norms2 = np.linalg.norm(mat[valid_mask], axis=1, keepdims=True)
        norms2[norms2 == 0] = 1.0
        mat[valid_mask] /= norms2
    id_to_idx = {ids[i]: i for i in range(len(ids)) if valid_mask[i]}
    return id_to_idx, mat


def resolve_thumbnail(source_lib: str, item_id: str) -> Optional[Path]:
    root = GEMINI_KIMI_IMAGES if source_lib == "gemini_kimi" else GOOGLE_FLOW_IMAGES
    info_dir = root / f"{item_id}.info"
    if not info_dir.is_dir():
        return None
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
        return fallback
    except OSError:
        return None


def strip_conversational_preamble(raw: str) -> str:
    txt = (raw or "").replace("\xa0", " ").strip()
    for pat in PREAMBLE_RES:
        nxt = pat.sub("", txt, count=1).strip()
        if len(nxt) > 60:
            txt = nxt
    return txt


def is_clean_prompt(raw: str) -> bool:
    txt = (raw or "").strip()
    if len(txt) < 110:
        return False
    low = txt.lower()
    if any(noise in low[:420] for noise in CHAT_NOISE_PATTERNS):
        return False
    return len(strip_conversational_preamble(txt)) >= 90


def detect_macro_and_dialect(raw: str, alfa_dialect: str) -> Tuple[str, str, List[str]]:
    if alfa_dialect in ("fdr_v3", "nano_banana_g6", "latente_v02"):
        cleaned = strip_conversational_preamble(raw)
        b_idx = cleaned.find("{")
        if b_idx != -1 and b_idx < 1400:
            # Extrai chaves top-level rapidamente por regex se JSON for muito grande
            keys = re.findall(r'(?m)^\s*"([a-zA-Z0-9_ -]{2,36})"\s*:', cleaned[b_idx : b_idx + 2500])
            if keys:
                return "json", alfa_dialect, sorted(dict.fromkeys(keys))[:8]
            return "json", alfa_dialect, [alfa_dialect]

    if alfa_dialect in ("fdr_direct", "body_mechanics_12block", "studio_editorial_v5"):
        return "sections", alfa_dialect, [alfa_dialect]

    cleaned = strip_conversational_preamble(raw)
    low = cleaned.lower()
    if re.search(r"^\s*\{", cleaned) or ('"' in cleaned[:260] and "{" in cleaned[:360]):
        keys = re.findall(r'"([a-zA-Z0-9_ -]{2,32})"\s*:', cleaned[:2000])
        if len(keys) >= 2:
            return "json", alfa_dialect if alfa_dialect != "qwen_natural" else "fdr_v3", sorted(dict.fromkeys(keys))[:8]

    if "[shot_type]" in low or "[visual description" in low:
        return "sections", "fdr_direct", ["SHOT_TYPE", "VISUAL DESCRIPTION"]
    if "body mechanics:" in low or "[body mechanics" in low:
        return "sections", "body_mechanics_12block", ["IDENTITY", "BODY MECHANICS"]
    if len(SECTION_LINE_RE.findall(cleaned)) >= 2:
        return "sections", "numbered_sections", ["sections"]

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


def top_project_name(source_lib: str, folder: str) -> str:
    if source_lib == "gemini_kimi":
        return "Gemini Kimi + Antigravity"
    clean = (folder or "").strip()
    if not clean or clean == "Sem Pasta":
        return "Sem Projeto"
    return clean.split("/")[0].strip()


def build_attributes_from_ast(
    *,
    raw_prompt: str,
    clean_positive: str,
    ast: Dict[str, Any],
    ax_tags: Dict[str, List[str]],
    extras: Dict[str, Any],
    macro_fmt: str,
    dialect: str,
    skel_sig: str,
    top_keys: List[str],
    project_label: str,
    pm_tags: List[str],
    pose_meta: Dict[str, Any],
    tag_stats_map: Dict[Tuple[str, str], Tuple[int, float, float]],
) -> Tuple[Dict[str, Any], List[Dict[str, Any]]]:
    def get_block_txt(bname: str) -> str:
        blk = ast.get(bname)
        return (blk.get("text") or "").strip() if isinstance(blk, dict) else ""

    def get_block_tags(bname: str) -> List[str]:
        blk = ast.get(bname)
        return list(blk.get("tags") or []) if isinstance(blk, dict) else []

    def collect_stats(pairs: List[Tuple[str, List[str]]]) -> List[Dict[str, Any]]:
        out: List[Dict[str, Any]] = []
        seen = set()
        for ax, tlist in pairs:
            for t in tlist:
                if (ax, t) in seen:
                    continue
                seen.add((ax, t))
                cnt, pct, idf = tag_stats_map.get((ax, t), (1, 0.01, 10.0))
                out.append(
                    {"axis": ax, "tag": t, "corpusCount": cnt, "corpusPct": pct, "idfWeight": idf}
                )
        return out

    suj_parts = [get_block_txt("identity_subject"), get_block_txt("body_mechanics_pose")]
    if pose_meta.get("pose_type"):
        suj_parts.append(
            f"[3D Pose: {pose_meta['pose_type']} yaw={pose_meta.get('yaw')}° pitch={pose_meta.get('pitch')}° roll={pose_meta.get('roll')}°]"
        )
    suj_text = " | ".join(p for p in suj_parts if p)
    suj_tags = list(dict.fromkeys((ax_tags.get("pose") or []) + get_block_tags("identity_subject")))
    suj_stats = collect_stats([("pose", ax_tags.get("pose") or []), ("identity", get_block_tags("identity_subject"))])

    cen_text = get_block_txt("environment_props")
    cen_tags = list(ax_tags.get("environment") or [])
    cen_stats = collect_stats([("environment", cen_tags)])

    luz_text = get_block_txt("lighting_physics")
    luz_tags = list(ax_tags.get("lighting") or [])
    luz_stats = collect_stats([("lighting", luz_tags)])

    cam_text = get_block_txt("camera_framing_occlusion")
    cam_tags = list(ax_tags.get("angle") or [])
    cam_stats = collect_stats([("angle", cam_tags)])

    mat_text = get_block_txt("wardrobe_materials")
    mat_tags = list(
        dict.fromkeys(
            (ax_tags.get("fabric") or []) + (ax_tags.get("wardrobe") or []) + (ax_tags.get("color") or [])
        )
    )
    mat_stats = collect_stats(
        [
            ("fabric", ax_tags.get("fabric") or []),
            ("wardrobe", ax_tags.get("wardrobe") or []),
            ("color", ax_tags.get("color") or []),
        ]
    )

    est_parts = [get_block_txt("color_sensor_context")]
    vc = extras.get("visual_context")
    if isinstance(vc, dict) and vc.get("primary_lineage"):
        est_parts.insert(0, f"Lineage: {vc['primary_lineage']}")
    est_text = " | ".join(p for p in est_parts if p)
    est_tags = list(
        dict.fromkeys(get_block_tags("color_sensor_context") + [t for t in pm_tags if t.startswith(("arq:", "app:", "mod:"))])
    )
    est_stats = collect_stats([("sensor", get_block_tags("color_sensor_context"))])

    proj_tags = [t for t in pm_tags if t.startswith(("char:", "app:", "arq:", "mod:"))][:8]
    proj_filled = project_label not in ("Sem Pasta", "Sem Projeto") or bool(proj_tags)
    has_neg = bool(extras.get("has_explicit_negative"))

    core_slots = [
        (suj_text, suj_tags),
        (cen_text, cen_tags),
        (luz_text, luz_tags),
        (cam_text, cam_tags),
        (mat_text, mat_tags),
        (est_text, est_tags),
    ]
    filled_count = sum(1 for txt, tgs in core_slots if len(txt) >= 6 or len(tgs) > 0) + (1 if proj_filled else 0) + 1
    clean_pos = clean_positive or strip_conversational_preamble(raw_prompt)
    token_count = len(clean_pos.split())

    attributes = {
        "sujeito": {"text": suj_text, "tags": suj_tags, "filled": len(suj_text) >= 6 or len(suj_tags) > 0, "tagStats": suj_stats},
        "cenario": {"text": cen_text, "tags": cen_tags, "filled": len(cen_text) >= 6 or len(cen_tags) > 0, "tagStats": cen_stats},
        "luz": {"text": luz_text, "tags": luz_tags, "filled": len(luz_text) >= 6 or len(luz_tags) > 0, "tagStats": luz_stats},
        "camera": {"text": cam_text, "tags": cam_tags, "filled": len(cam_text) >= 6 or len(cam_tags) > 0, "tagStats": cam_stats},
        "textura_material": {"text": mat_text, "tags": mat_tags, "filled": len(mat_text) >= 6 or len(mat_tags) > 0, "tagStats": mat_stats},
        "estilo": {"text": est_text, "tags": est_tags, "filled": len(est_text) >= 6 or len(est_tags) > 0, "tagStats": est_stats},
        "projeto_cliente": {"text": project_label, "tags": proj_tags, "filled": proj_filled, "tagStats": []},
        "estrutura": {
            "text": f"{macro_fmt.upper()} · {dialect} · {', '.join(top_keys[:4])}",
            "tags": [macro_fmt, dialect],
            "filled": True,
            "tagStats": [],
            "macroFormat": macro_fmt,
            "kernelDialect": dialect,
            "skeletonSignature": skel_sig,
            "filledAttributesCount": filled_count,
            "hasExplicitNegative": has_neg,
            "aspectRatio": "3:4",
            "tokenCount": token_count,
            "topKeysOrSections": top_keys,
        },
    }
    return attributes, (suj_stats + cen_stats + luz_stats + cam_stats + mat_stats + est_stats)


def spherical_kmeans_22k(
    vecs: np.ndarray,
    k: int,
    meta_records: List[Dict[str, Any]],
    label_prefix: str,
    slot_step: float = 12.0,
) -> Tuple[np.ndarray, np.ndarray, np.ndarray, List[Dict[str, Any]]]:
    """Spherical K-Means + MDS Clássico 2D + espiral filotática para 22.282 pontos."""
    n, dim = vecs.shape
    k = max(1, min(n, k))

    # Seeding determinístico por maior distância (amostra de até 2500 pontos para velocidade)
    rng_idx = np.linspace(0, n - 1, min(n, 2500), dtype=np.int32)
    sample_v = vecs[rng_idx]
    centroids = np.zeros((k, dim), dtype=np.float32)
    centroids[0] = sample_v[0]
    min_max_sim = np.full(len(sample_v), -np.inf, dtype=np.float32)
    for c in range(1, k):
        sims = sample_v @ centroids[c - 1]
        min_max_sim = np.maximum(min_max_sim, sims)
        centroids[c] = sample_v[int(np.argmin(min_max_sim))]

    assignments = np.zeros(n, dtype=np.int32)
    centroid_sims = np.zeros(n, dtype=np.float32)

    for it in range(15):
        sim_mat = vecs @ centroids.T
        new_assign = np.argmax(sim_mat, axis=1)
        centroid_sims = sim_mat[np.arange(n), new_assign]
        changed = int(np.sum(new_assign != assignments))
        assignments = new_assign
        for c in range(k):
            mask = assignments == c
            if np.any(mask):
                mean_vec = vecs[mask].mean(axis=0)
                norm = float(np.linalg.norm(mean_vec)) or 1.0
                centroids[c] = mean_vec / norm
        if it > 3 and changed < max(5, int(n * 0.0005)):
            break

    buckets: Dict[int, List[int]] = {}
    for i in range(n):
        buckets.setdefault(int(assignments[i]), []).append(i)
    ordered = sorted(buckets.items(), key=lambda kv: len(kv[1]), reverse=True)
    active_k = len(ordered)

    remap = {raw_c: idx + 1 for idx, (raw_c, _) in enumerate(ordered)}
    remapped_assign = np.array([remap[int(c)] for c in assignments], dtype=np.int32)

    # MDS Clássico 2D nos centróides ativos
    c_vecs = np.stack([centroids[raw_c] for raw_c, _ in ordered], axis=0)
    c_sim = np.clip(c_vecs @ c_vecs.T, -1.0, 1.0)
    d2 = np.maximum(0.0, 2.0 * (1.0 - c_sim))
    B = -0.5 * (d2 - d2.mean(axis=1, keepdims=True) - d2.mean(axis=0, keepdims=True) + d2.mean())
    eigvals, eigvecs = np.linalg.eigh(B)
    idx_desc = np.argsort(eigvals)[::-1]
    e1_val = max(0.0, float(eigvals[idx_desc[0]]))
    e2_val = max(0.0, float(eigvals[idx_desc[1]])) if active_k > 1 else 0.0
    coords_c = np.zeros((active_k, 2), dtype=np.float64)
    coords_c[:, 0] = eigvecs[:, idx_desc[0]] * math.sqrt(e1_val)
    if active_k > 1:
        coords_c[:, 1] = eigvecs[:, idx_desc[1]] * math.sqrt(e2_val)
    max_abs = max(1e-6, float(np.max(np.abs(coords_c))))
    coords_c = (coords_c / max_abs) * 1450.0

    centers = []
    for idx, (raw_c, members) in enumerate(ordered):
        rad = max(170.0, math.sqrt(len(members)) * slot_step * 0.68 + 46.0)
        centers.append(
            {
                "raw_c": raw_c,
                "clusterId": idx + 1,
                "members": members,
                "cx": float(coords_c[idx, 0]),
                "cy": float(coords_c[idx, 1] * 0.84),
                "radius": rad,
            }
        )

    pad = 155.0
    for _ in range(60):
        moved = False
        for a in range(active_k):
            for b in range(a + 1, active_k):
                dx = centers[b]["cx"] - centers[a]["cx"]
                dy = centers[b]["cy"] - centers[a]["cy"]
                dist = math.hypot(dx, dy)
                min_d = centers[a]["radius"] + centers[b]["radius"] + pad
                if dist < min_d:
                    ang = math.atan2(dy, dx) if dist > 1e-4 else ((a * 137.5 + b) % 360) * math.pi / 180.0
                    push = (min_d - dist) * 0.52
                    px, py = math.cos(ang) * push, math.sin(ang) * push
                    centers[a]["cx"] -= px
                    centers[a]["cy"] -= py
                    centers[b]["cx"] += px
                    centers[b]["cy"] += py
                    moved = True
        if not moved:
            break

    mean_cx = sum(c["cx"] for c in centers) / active_k
    mean_cy = sum(c["cy"] for c in centers) / active_k
    for c in centers:
        c["cx"] -= mean_cx
        c["cy"] -= mean_cy

    node_x = np.zeros(n, dtype=np.float32)
    node_y = np.zeros(n, dtype=np.float32)
    clusters_meta: List[Dict[str, Any]] = []
    golden_angle = math.pi * (3.0 - math.sqrt(5.0))

    for c in centers:
        members = c["members"]
        m_arr = np.array(members, dtype=np.int32)
        sims = centroid_sims[m_arr]
        order_idx = np.argsort(-sims)
        sorted_m = m_arr[order_idx]

        # Espiral filotática suave dentro do raio da ilha (sem colisões mesmo com 3.500 pts!)
        max_r = max(40.0, c["radius"] - 24.0)
        count_m = len(sorted_m)
        ranks = np.arange(count_m, dtype=np.float32)
        radii = max_r * np.sqrt((ranks + 0.5) / max(1.0, float(count_m)))
        thetas = ranks * golden_angle
        node_x[sorted_m] = np.round(c["cx"] + radii * np.cos(thetas), 1)
        node_y[sorted_m] = np.round(c["cy"] + radii * np.sin(thetas), 1)

        tag_counts: Counter = Counter()
        proj_counts: Counter = Counter()
        fmt_counts: Counter = Counter()
        tier_s_cnt = 0
        pct_sum = 0.0
        mat_sum = 0.0
        exemplars: List[str] = []

        for pos_i, m_idx in enumerate(sorted_m):
            rec = meta_records[int(m_idx)]
            proj_counts[rec["project"]] += 1
            fmt_counts[rec["format"]] += 1
            if rec["tier"] == "S":
                tier_s_cnt += 1
            pct_sum += rec["percentile"]
            mat_sum += rec["maturity"]
            if pos_i < 6:
                exemplars.append(rec["id"])
            for tg in rec["label_tags"]:
                if tg not in ("reference_identity_lock", "telephoto_prime_optics"):
                    tag_counts[tg] += 1

        dom_tags = [t for t, _ in tag_counts.most_common(4)]
        dom_proj = proj_counts.most_common(1)[0][0] if proj_counts else "Geral"
        dom_fmt = fmt_counts.most_common(1)[0][0] if fmt_counts else "json"
        cohesion = round(float(np.mean(sims)), 3)
        lbl_parts = [human_tag(t) for t in dom_tags[:2]]
        label = f"{label_prefix} {c['clusterId']:02d} · {' / '.join(lbl_parts) or dom_proj}"

        clusters_meta.append(
            {
                "clusterId": c["clusterId"],
                "label": label,
                "dominantTags": dom_tags,
                "dominantProject": dom_proj,
                "dominantFormat": dom_fmt,
                "count": count_m,
                "cohesion": cohesion,
                "tierSCount": tier_s_cnt,
                "avgPercentile": round(pct_sum / count_m, 1),
                "avgMaturity": round(mat_sum / count_m, 1),
                "cx": round(c["cx"], 1),
                "cy": round(c["cy"], 1),
                "radius": round(c["radius"], 1),
                "exemplarIds": exemplars,
            }
        )

    return remapped_assign, node_x, node_y, clusters_meta


def fmt_pt(n: int) -> str:
    return f"{n:,}".replace(",", ".")


def read_eagle_mtimes(lib_root: Path, images_dir: Path) -> Tuple[Dict[str, int], int]:
    """Lê `mtime.json` e `.info` do Eagle em modo Read-Only, retornando (id -> mtime_ms, lib_mtime_ts)."""
    eagle_mtimes: Dict[str, int] = {}
    mtime_file = lib_root / "mtime.json"
    lib_mtime_ts = 0
    if mtime_file.exists():
        try:
            lib_mtime_ts = int(mtime_file.stat().st_mtime * 1000)
            parsed = json.loads(mtime_file.read_text(encoding="utf-8", errors="ignore"))
            if isinstance(parsed, dict):
                for k, v in parsed.items():
                    if k == "all":
                        continue
                    try:
                        eagle_mtimes[str(k)] = int(v)
                    except (TypeError, ValueError):
                        continue
        except Exception:
            pass

    if images_dir.is_dir():
        try:
            with os.scandir(images_dir) as entries:
                for entry in entries:
                    if not entry.is_dir() or not entry.name.endswith(".info"):
                        continue
                    iid = entry.name[:-5]
                    if iid not in eagle_mtimes:
                        mp = Path(entry.path) / "metadata.json"
                        try:
                            eagle_mtimes[iid] = int(mp.stat().st_mtime * 1000) if mp.exists() else 0
                        except OSError:
                            eagle_mtimes[iid] = 0
        except OSError:
            pass

    return eagle_mtimes, lib_mtime_ts


def sync_eagle_ast_cache(
    telemetry_map: Dict[str, dict],
) -> Tuple[List[Dict[str, Any]], Dict[str, Dict[str, Any]]]:
    """
    Sincroniza diretamente as bibliotecas Eagle em modo 100% Read-Only usando cache incremental local
    (`data/ast_cache.sqlite`), parseando apenas itens novos ou modificados.
    """
    libraries = [
        ("google_flow", GOOGLE_FLOW_LIB, GOOGLE_FLOW_IMAGES),
    ]

    cache_conn = sqlite3.connect(AST_CACHE_DB)
    cache_conn.row_factory = sqlite3.Row
    sync_stats: Dict[str, Dict[str, Any]] = {}
    active_rows: List[Dict[str, Any]] = []

    try:
        cache_conn.executescript(
            """
            PRAGMA journal_mode = WAL;
            PRAGMA synchronous = NORMAL;
            CREATE TABLE IF NOT EXISTS ast_cache (
                source_lib TEXT NOT NULL,
                item_id TEXT NOT NULL,
                mtime_ms INTEGER NOT NULL,
                status TEXT NOT NULL,
                title TEXT NOT NULL DEFAULT '',
                folder_ids_json TEXT NOT NULL DEFAULT '[]',
                folder_fallback TEXT NOT NULL DEFAULT '',
                raw_prompt TEXT NOT NULL DEFAULT '',
                clean_positive TEXT NOT NULL DEFAULT '',
                dialect TEXT NOT NULL DEFAULT 'qwen_natural',
                ast_json TEXT NOT NULL DEFAULT '{}',
                axis_tags_json TEXT NOT NULL DEFAULT '{}',
                extras_json TEXT NOT NULL DEFAULT '{}',
                star INTEGER NOT NULL DEFAULT 0,
                btime INTEGER NOT NULL DEFAULT 0,
                eagle_tags_json TEXT NOT NULL DEFAULT '[]',
                eagle_tags_count INTEGER NOT NULL DEFAULT 0,
                PRIMARY KEY (source_lib, item_id)
            );
            """
        )

        conn_alfa_ro = open_ro(ALFA_DB) if ALFA_DB.exists() else None
        alfa_mtime_ms = int(ALFA_DB.stat().st_mtime * 1000) if ALFA_DB.exists() else 0

        try:
            for source_lib, lib_root, images_dir in libraries:
                eagle_mtimes, lib_mtime_ts = read_eagle_mtimes(lib_root, images_dir)
                current_ids = set(eagle_mtimes.keys())
                folder_map = read_eagle_folder_map(lib_root)

                existing_rows = cache_conn.execute(
                    "SELECT item_id, mtime_ms, status FROM ast_cache WHERE source_lib = ?",
                    (source_lib,),
                ).fetchall()
                cache_meta: Dict[str, Tuple[int, str]] = {
                    str(r["item_id"]): (int(r["mtime_ms"]), str(r["status"])) for r in existing_rows
                }

                # Seed inicial opcional (100% RO) a partir do Projeto Alfa para evitar reparse dos primeiros 22k
                if len(cache_meta) == 0 and conn_alfa_ro is not None and len(current_ids) > 0:
                    alfa_rows = conn_alfa_ro.execute(
                        """
                        SELECT item_id, title, folder, dialect, raw_prompt, clean_positive,
                               ast_json, axis_tags_json, extras_json, star, eagle_tags_count
                        FROM prompts
                        WHERE source_lib = ?
                        """,
                        (source_lib,),
                    ).fetchall()
                    seed_batch = []
                    for ar in alfa_rows:
                        iid = str(ar["item_id"])
                        if iid not in current_ids:
                            continue
                        em_ts = eagle_mtimes.get(iid, 0)
                        if alfa_mtime_ms > 0 and em_ts > alfa_mtime_ms:
                            continue
                        seed_batch.append(
                            (
                                source_lib,
                                iid,
                                em_ts,
                                "active",
                                str(ar["title"] or iid),
                                "[]",
                                str(ar["folder"] or ""),
                                str(ar["raw_prompt"] or ""),
                                str(ar["clean_positive"] or ""),
                                str(ar["dialect"] or "qwen_natural"),
                                str(ar["ast_json"] or "{}"),
                                str(ar["axis_tags_json"] or "{}"),
                                str(ar["extras_json"] or "{}"),
                                int(ar["star"] or 0),
                                0,
                                "[]",
                                int(ar["eagle_tags_count"] or 0),
                            )
                        )
                        cache_meta[iid] = (em_ts, "active")

                    if seed_batch:
                        cache_conn.executemany(
                            """
                            INSERT OR REPLACE INTO ast_cache (
                                source_lib, item_id, mtime_ms, status, title, folder_ids_json,
                                folder_fallback, raw_prompt, clean_positive, dialect, ast_json,
                                axis_tags_json, extras_json, star, btime, eagle_tags_json, eagle_tags_count
                            ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
                            """,
                            seed_batch,
                        )
                        cache_conn.commit()
                        print(f"[Ingest] {source_lib}: seed RO inicial de {len(seed_batch)} ASTs via Projeto Alfa")

                removed_ids = [iid for iid in cache_meta.keys() if iid not in current_ids]
                if removed_ids:
                    for i in range(0, len(removed_ids), 500):
                        chunk = removed_ids[i : i + 500]
                        placeholders = ",".join("?" for _ in chunk)
                        cache_conn.execute(
                            f"DELETE FROM ast_cache WHERE source_lib = ? AND item_id IN ({placeholders})",
                            [source_lib, *chunk],
                        )
                    cache_conn.commit()

                to_parse_ids = [
                    iid
                    for iid, em_ts in eagle_mtimes.items()
                    if iid not in cache_meta or cache_meta[iid][0] != em_ts
                ]

                def _parse_item(iid: str) -> Tuple[Any, ...]:
                    em_ts = eagle_mtimes.get(iid, 0)
                    meta_path = images_dir / f"{iid}.info" / "metadata.json"
                    if not meta_path.exists():
                        return (
                            source_lib, iid, em_ts, "error", "", "[]", "", "", "", "qwen_natural",
                            "{}", "{}", "{}", 0, 0, "[]", 0,
                        )
                    try:
                        data = json.loads(meta_path.read_text(encoding="utf-8", errors="ignore"))
                    except Exception:
                        return (
                            source_lib, iid, em_ts, "error", "", "[]", "", "", "", "qwen_natural",
                            "{}", "{}", "{}", 0, 0, "[]", 0,
                        )
                    if data.get("isDeleted"):
                        return (
                            source_lib, iid, em_ts, "deleted", "", "[]", "", "", "", "qwen_natural",
                            "{}", "{}", "{}", 0, 0, "[]", 0,
                        )
                    ann = (data.get("annotation") or "").strip()
                    if not ann:
                        return (
                            source_lib, iid, em_ts, "empty", "", "[]", "", "", "", "qwen_natural",
                            "{}", "{}", "{}", 0, 0, "[]", 0,
                        )

                    pose_meta = telemetry_map.get(iid) or {}
                    ast = parse_prompt_to_ast(ann, pose_meta=pose_meta)
                    fids = [str(f) for f in (data.get("folders") or []) if f]
                    raw_tags = data.get("tags")
                    tags_list = [str(t) for t in raw_tags if t] if isinstance(raw_tags, list) else []
                    return (
                        source_lib,
                        iid,
                        em_ts,
                        "active",
                        str(data.get("name") or iid),
                        json.dumps(fids, ensure_ascii=False),
                        "",
                        ann,
                        str(ast.get("clean_positive_text") or ""),
                        str(ast.get("dialect") or "qwen_natural"),
                        json.dumps(ast.get("blocks") or {}, ensure_ascii=False),
                        json.dumps(ast.get("axis_tags") or {}, ensure_ascii=False),
                        json.dumps(ast.get("extras") or {}, ensure_ascii=False),
                        int(data.get("star") or 0),
                        int(data.get("btime") or 0),
                        json.dumps(tags_list, ensure_ascii=False),
                        len(tags_list),
                    )

                if to_parse_ids:
                    parsed_batches: List[Tuple[Any, ...]] = []
                    with ThreadPoolExecutor(max_workers=16) as pool:
                        for row_tuple in pool.map(_parse_item, to_parse_ids):
                            parsed_batches.append(row_tuple)
                    cache_conn.executemany(
                        """
                        INSERT OR REPLACE INTO ast_cache (
                            source_lib, item_id, mtime_ms, status, title, folder_ids_json,
                            folder_fallback, raw_prompt, clean_positive, dialect, ast_json,
                            axis_tags_json, extras_json, star, btime, eagle_tags_json, eagle_tags_count
                        ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
                        """,
                        parsed_batches,
                    )
                    cache_conn.commit()

                lib_active_rows = cache_conn.execute(
                    """
                    SELECT item_id, source_lib, title, folder_ids_json, folder_fallback,
                           dialect, raw_prompt, clean_positive, ast_json, axis_tags_json,
                           extras_json, star, btime, eagle_tags_json, eagle_tags_count
                    FROM ast_cache
                    WHERE source_lib = ? AND status = 'active'
                    """,
                    (source_lib,),
                ).fetchall()

                for cr in lib_active_rows:
                    iid = str(cr["item_id"])
                    pose_meta = telemetry_map.get(iid) or {}
                    fids = json.loads(cr["folder_ids_json"] or "[]")
                    resolved_folders = [folder_map.get(fid, fid) for fid in fids if fid]
                    if resolved_folders:
                        folder_str = resolved_folders[0]
                    elif cr["folder_fallback"]:
                        fb = str(cr["folder_fallback"])
                        folder_str = folder_map.get(fb, fb)
                    elif pose_meta.get("folder_names"):
                        folder_str = str(pose_meta["folder_names"][0])
                    else:
                        folder_str = "Sem Pasta"

                    active_rows.append(
                        {
                            "item_id": iid,
                            "source_lib": source_lib,
                            "title": str(cr["title"] or iid),
                            "folder": folder_str,
                            "dialect": str(cr["dialect"] or "qwen_natural"),
                            "raw_prompt": str(cr["raw_prompt"] or ""),
                            "clean_positive": str(cr["clean_positive"] or ""),
                            "ast_json": str(cr["ast_json"] or "{}"),
                            "axis_tags_json": str(cr["axis_tags_json"] or "{}"),
                            "extras_json": str(cr["extras_json"] or "{}"),
                            "pose_type": pose_meta.get("pose_type") or "",
                            "yaw": pose_meta.get("yaw"),
                            "pitch": pose_meta.get("pitch"),
                            "roll": pose_meta.get("roll"),
                            "badge": pose_meta.get("badge") or "",
                            "star": int(cr["star"] or 0),
                            "btime": int(cr["btime"] or 0),
                            "eagle_tags_json": str(cr["eagle_tags_json"] or "[]"),
                            "eagle_tags_count": int(cr["eagle_tags_count"] or 0),
                            "face_confidence": pose_meta.get("face_confidence"),
                        }
                    )

                sync_stats[source_lib] = {
                    "eagle_total": len(current_ids),
                    "active_prompts": len(lib_active_rows),
                    "new_or_modified": len(to_parse_ids),
                    "removed": len(removed_ids),
                    "lib_mtime_ts": lib_mtime_ts,
                }
                print(
                    f"[Ingest] {source_lib}: eagle={len(current_ids)} | "
                    f"novos/alterados={len(to_parse_ids)} | removidos={len(removed_ids)} | "
                    f"ativos={len(lib_active_rows)}"
                )
        finally:
            if conn_alfa_ro is not None:
                conn_alfa_ro.close()

        cache_conn.execute("PRAGMA wal_checkpoint(TRUNCATE)")
        cache_conn.execute("PRAGMA journal_mode = DELETE")
        cache_conn.commit()
    finally:
        cache_conn.close()

    return active_rows, sync_stats


def main() -> None:
    parser = argparse.ArgumentParser(description="Ingestão Read-Only Eagle -> Prompt Engine V1")
    parser.add_argument(
        "--stage-only",
        action="store_true",
        help="Grava saídas temporárias .next para swap seguro pelo servidor Vite.",
    )
    args, _ = parser.parse_known_args()

    t0 = time.time()
    DATA_DIR.mkdir(parents=True, exist_ok=True)

    print("[Ingest] Carregando embeddings EmbeddingGemma-2 & CLIP (RO)...")
    gemma_id_to_idx, gemma_mat = load_nonzero_embeddings(GEMMA2_BIN)
    clip_id_to_idx, clip_mat = load_nonzero_embeddings(CLIP_BIN)

    telemetry_map, _ = load_posematch_telemetry()
    conn_pm = open_ro(POSEMATCH_DB) if POSEMATCH_DB.exists() else None

    try:
        pm_tags_by_id: Dict[str, List[str]] = {}
        pm_items_count = 0
        if conn_pm is not None:
            for r in conn_pm.execute("SELECT item_id, tag FROM item_tags").fetchall():
                pm_tags_by_id.setdefault(r["item_id"], []).append(r["tag"])
            pm_cnt_row = conn_pm.execute("SELECT COUNT(*) FROM items").fetchone()
            pm_items_count = int(pm_cnt_row[0]) if pm_cnt_row else 0

        rows, sync_stats = sync_eagle_ast_cache(telemetry_map)

        n_total = len(rows)
        gf_total = sum(1 for r in rows if r["source_lib"] == "google_flow")
        gk_total = sum(1 for r in rows if r["source_lib"] == "gemini_kimi")
        print(f"[Ingest] Corpus unificado: {n_total} prompts (Google Flow={gf_total}, Gemini Kimi={gk_total}) em {time.time()-t0:.1f}s")

        # 1. Primeira passagem: estatísticas globais, matrizes 2D/3D (all-tag reais) & skeleton counts
        axis_counts_global: Dict[str, Counter] = {ax: Counter() for ax in AXIS_RARITY_PRIORITY}
        prim_counts_gf: Dict[str, Counter] = {ax: Counter() for ax in AXIS_RARITY_PRIORITY}
        prim_cooc_gf: Counter = Counter()

        ALL_GAP_AXES = ("environment", "lighting", "angle", "pose", "fabric", "wardrobe")
        TRIAD_AXIS_TRIPLES = (
            ("environment", "lighting", "angle"),
            ("pose", "environment", "lighting"),
            ("pose", "lighting", "angle"),
            ("fabric", "environment", "lighting"),
            ("wardrobe", "environment", "angle"),
            ("pose", "fabric", "angle"),
            ("environment", "lighting", "fabric"),
            ("pose", "wardrobe", "lighting"),
        )
        all_counts_gf: Dict[str, Counter] = {ax: Counter() for ax in ALL_GAP_AXES}
        all_cooc_gf: Counter = Counter()
        all_tri_cooc_gf: Counter = Counter()
        motif_counts_gf: Counter = Counter()
        motif_tri_cooc_gf: Counter = Counter()
        row_motifs_by_id: Dict[str, List[str]] = {}
        tested_bridges_raw: Dict[str, List[Tuple[str, int]]] = {}

        proj_totals: Counter = Counter()
        proj_subfolders: Dict[str, Counter] = {}
        proj_formats: Dict[str, Counter] = {}
        proj_prim_counts: Dict[str, Dict[str, Counter]] = {}
        proj_prim_cooc: Dict[str, Counter] = {}
        proj_all_counts: Dict[str, Dict[str, Counter]] = {}
        proj_all_cooc: Dict[str, Counter] = {}
        skeleton_counts: Counter = Counter()

        parsed_rows: List[Tuple[Any, str, str, str, List[str], Dict[str, Any], Dict[str, List[str]], Dict[str, Any], Dict[str, str], str]] = []

        for r in rows:
            src = r["source_lib"]
            iid = r["item_id"]
            raw = r["raw_prompt"] or ""
            ast = json.loads(r["ast_json"] or "{}")
            ax = json.loads(r["axis_tags_json"] or "{}")
            extras = json.loads(r["extras_json"] or "{}")
            macro_fmt, detected_dialect, top_keys = detect_macro_and_dialect(raw, r["dialect"])
            has_neg = bool(extras.get("has_explicit_negative"))
            norm_keys = "+".join(re.sub(r"[^a-z0-9_]+", "_", k.lower()).strip("_") for k in top_keys[:6]) or "prose"
            skel_sig = f"{macro_fmt}:{detected_dialect}:{norm_keys}:{'neg1' if has_neg else 'neg0'}"
            skeleton_counts[skel_sig] += 1

            folder_full = (r["folder"] or "Sem Pasta").strip()
            proj = top_project_name(src, folder_full)
            proj_totals[proj] += 1
            proj_subfolders.setdefault(proj, Counter())[folder_full] += 1
            proj_formats.setdefault(proj, Counter())[macro_fmt] += 1
            p_prim = proj_prim_counts.setdefault(proj, {k: Counter() for k in AXIS_RARITY_PRIORITY})
            p_cooc = proj_prim_cooc.setdefault(proj, Counter())
            p_all = proj_all_counts.setdefault(proj, {k: Counter() for k in ALL_GAP_AXES})
            p_all_cooc = proj_all_cooc.setdefault(proj, Counter())

            for cat, tlist in ax.items():
                if cat in axis_counts_global:
                    for t in tlist or []:
                        axis_counts_global[cat][t] += 1

            prim: Dict[str, str] = {}
            for cat, prio in AXIS_RARITY_PRIORITY.items():
                found = set(ax.get(cat) or [])
                for p in prio:
                    if p in found:
                        prim[cat] = p
                        p_prim[cat][p] += 1
                        if src == "google_flow":
                            prim_counts_gf[cat][p] += 1
                        break

            for ca, cb in MATRIX_AXIS_PAIRS:
                if ca in prim and cb in prim:
                    p_cooc[(ca, prim[ca], cb, prim[cb])] += 1
                    if src == "google_flow":
                        prim_cooc_gf[(ca, prim[ca], cb, prim[cb])] += 1

            # Contagem completa (all-tag) por eixo para eliminar falsos O=0
            ax_sets: Dict[str, List[str]] = {
                cax: list(dict.fromkeys(ax.get(cax) or []))
                for cax in ALL_GAP_AXES
            }
            for cax, tlist in ax_sets.items():
                for tg in tlist:
                    p_all[cax][tg] += 1
                    if src == "google_flow":
                        all_counts_gf[cax][tg] += 1

            for ca, cb in MATRIX_AXIS_PAIRS:
                ta_list = ax_sets.get(ca, [])
                tb_list = ax_sets.get(cb, [])
                if ta_list and tb_list:
                    for ta in ta_list:
                        for tb in tb_list:
                            p_all_cooc[(ca, ta, cb, tb)] += 1
                            if src == "google_flow":
                                all_cooc_gf[(ca, ta, cb, tb)] += 1

            if src == "google_flow":
                for c1, c2, c3 in TRIAD_AXIS_TRIPLES:
                    l1, l2, l3 = ax_sets.get(c1, []), ax_sets.get(c2, []), ax_sets.get(c3, [])
                    if l1 and l2 and l3:
                        for t1 in l1:
                            for t2 in l2:
                                for t3 in l3:
                                    all_tri_cooc_gf[(c1, t1, c2, t2, c3, t3)] += 1

                motifs = extract_clean_motifs(r["clean_positive"] or raw)
                if motifs:
                    row_motifs_by_id[iid] = motifs
                    for mf in motifs:
                        motif_counts_gf[mf] += 1
                        for ax2 in ("environment", "fabric", "pose", "wardrobe"):
                            for t2 in ax_sets.get(ax2, []):
                                for ax3 in ("lighting", "angle"):
                                    for t3 in ax_sets.get(ax3, []):
                                        motif_tri_cooc_gf[(mf, ax2, t2, ax3, t3)] += 1

            if '"gap_bridge"' in raw:
                bm = GAP_BRIDGE_RE.search(raw)
                if bm:
                    raw_bridge = bm.group(1).strip()
                    parts_b = [p.strip() for p in re.split(r"\s*×\s*|\s+[xX]\s+", raw_bridge) if p.strip()]
                    if len(parts_b) >= 2:
                        norm_bridge = " × ".join(parts_b)
                        tested_bridges_raw.setdefault(norm_bridge, []).append((iid, int(r.get("btime") or 0)))

            parsed_rows.append((r, macro_fmt, detected_dialect, skel_sig, top_keys, ast, ax, extras, prim, proj))

        tag_stats_map: Dict[Tuple[str, str], Tuple[int, float, float]] = {}
        for cat, cntr in axis_counts_global.items():
            for tag, cnt in cntr.items():
                pct = round((cnt / max(1, n_total)) * 100.0, 2)
                idf = round(math.log2((n_total + 1.0) / (cnt + 1.0)), 3)
                tag_stats_map[(cat, tag)] = (cnt, pct, idf)

        # 2. Raridade global e Maturidade sobre todos os 22.282 prompts
        raw_scores: List[float] = []
        row_raw_cache: List[Tuple[float, float]] = []
        for r, macro_fmt, detected_dialect, skel_sig, top_keys, ast, ax, extras, prim, proj in parsed_rows:
            idfs = []
            for axis_name, tlist in ax.items():
                for t in tlist or []:
                    _, _, idf = tag_stats_map.get((axis_name, t), (1, 0.01, 10.0))
                    idfs.append(idf)
            idfs.sort(reverse=True)
            top_idfs = idfs[:8]
            mean_idf = sum(top_idfs) / len(top_idfs) if top_idfs else 1.5

            pair_idfs = []
            for ca, cb in MATRIX_AXIS_PAIRS:
                if ca in prim and cb in prim:
                    c_pair = prim_cooc_gf[(ca, prim[ca], cb, prim[cb])]
                    pair_idfs.append(math.log2((max(1, gf_total) + 1.0) / (c_pair + 1.0)))
            pair_bonus = (sum(sorted(pair_idfs, reverse=True)[:4]) / 4.0) * 0.25 if pair_idfs else 0.0
            raw_r = round(mean_idf + pair_bonus, 3)
            raw_scores.append(raw_r)
            row_raw_cache.append((raw_r, pair_bonus))

        sorted_scores = sorted(raw_scores)

        # 3. Constrói todos os 22.282 registros completos + vocabulário para projeção 2D
        all_items: List[Dict[str, Any]] = []
        meta_records: List[Dict[str, Any]] = []
        proj_pct_sum: Counter = Counter()
        proj_mat_sum: Counter = Counter()
        proj_tier_dist: Dict[str, Counter] = {}
        proj_quad_dist: Dict[str, Counter] = {}

        # Vocabulário das 100 palavras mais informativas do clean_positive
        df_words: Counter = Counter()
        doc_tokens: List[List[str]] = []
        for r, *_ in parsed_rows:
            toks = list(set(WORD_RE.findall((r["clean_positive"] or "")[:700].lower())))
            doc_tokens.append(toks)
            for t in toks:
                df_words[t] += 1
        top_vocab = [w for w, c in df_words.most_common(450) if 25 <= c <= int(n_total * 0.65)][:120]
        vocab_idx = {w: i for i, w in enumerate(top_vocab)}

        # Índice de tags controladas
        tag_vocab: List[Tuple[str, str]] = []
        for cat, prio in AXIS_RARITY_PRIORITY.items():
            for t in prio:
                tag_vocab.append((cat, t))
        tag_vocab_idx = {k: i for i, k in enumerate(tag_vocab)}

        n_tag_feats = len(tag_vocab)
        n_word_feats = len(top_vocab)
        sem_raw_mat = np.zeros((n_total, n_tag_feats + n_word_feats + 32), dtype=np.float32)

        # Estrutural feature matrix
        struct_vocab: Dict[str, int] = {}
        struct_tokens_list: List[List[str]] = []

        for idx_row, (r, macro_fmt, detected_dialect, skel_sig, top_keys, ast, ax, extras, prim, proj) in enumerate(parsed_rows):
            src = r["source_lib"]
            iid = r["item_id"]
            raw_r, pair_bonus = row_raw_cache[idx_row]
            rank = bisect.bisect_right(sorted_scores, raw_r)
            percentile = max(1, min(99, round((rank / n_total) * 100)))
            tier = compute_tier(percentile)

            pm_tags = pm_tags_by_id.get(iid, [])
            pose_meta = {
                "pose_type": r["pose_type"],
                "yaw": r["yaw"],
                "pitch": r["pitch"],
                "roll": r["roll"],
                "badge": r["badge"],
                "face_confidence": r["face_confidence"],
            }

            attributes, all_tag_stats = build_attributes_from_ast(
                raw_prompt=r["raw_prompt"] or "",
                clean_positive=r["clean_positive"] or "",
                ast=ast,
                ax_tags=ax,
                extras=extras,
                macro_fmt=macro_fmt,
                dialect=detected_dialect,
                skel_sig=skel_sig,
                top_keys=top_keys,
                project_label=proj,
                pm_tags=pm_tags,
                pose_meta=pose_meta,
                tag_stats_map=tag_stats_map,
            )

            skel_reuse = skeleton_counts.get(skel_sig, 1)
            reuse_norm = clamp(math.log10(max(1, skel_reuse) + 1) / math.log10(1200), 0.0, 1.0)
            skeleton_reuse_score = round(reuse_norm * 100.0, 1)
            core_keys = ("sujeito", "cenario", "luz", "camera", "textura_material", "estilo")
            core_filled = sum(1 for k in core_keys if attributes[k]["filled"])
            total_filled = attributes["estrutura"]["filledAttributesCount"]
            completeness_score = round(
                clamp((core_filled / len(core_keys)) * 0.75 + (total_filled / 8.0) * 0.25, 0.0, 1.0) * 100.0, 1
            )

            cam_low = attributes["camera"]["text"].lower()
            luz_low = attributes["luz"]["text"].lower()
            suj_low = attributes["sujeito"]["text"].lower()
            tech_signals = 0.0
            if CAM_TECH_RE.search(cam_low):
                tech_signals += 1.0
            if LUZ_TECH_RE.search(luz_low):
                tech_signals += 1.0
            if SUJ_TECH_RE.search(suj_low):
                tech_signals += 1.0
            if attributes["estrutura"]["hasExplicitNegative"]:
                tech_signals += 1.0
            if attributes["estrutura"]["tokenCount"] >= 90:
                tech_signals += 0.5
            technical_precision_score = round(clamp(tech_signals / 4.5, 0.0, 1.0) * 100.0, 1)

            tags_cnt = max(int(r["eagle_tags_count"] or 0), len(pm_tags))
            star_val = int(r["star"] or 0)
            curation_raw = clamp(tags_cnt / 14.0, 0.0, 0.55) + clamp(star_val / 5.0, 0.0, 0.30)
            if r["face_confidence"] is not None and float(r["face_confidence"]) >= 80.0:
                curation_raw += 0.15
            elif attributes["projeto_cliente"]["filled"] and proj != "Sem Projeto":
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
            quadrant = classify_quadrant(percentile, maturity_score)

            proj_pct_sum[proj] += percentile
            proj_mat_sum[proj] += maturity_score
            proj_tier_dist.setdefault(proj, Counter())[tier] += 1
            proj_quad_dist.setdefault(proj, Counter())[quadrant] += 1

            all_tag_stats_sorted = sorted(all_tag_stats, key=lambda x: x["idfWeight"], reverse=True)
            top_idf_vals = [x["idfWeight"] for x in all_tag_stats_sorted[:8]]
            mean_idf = round(sum(top_idf_vals) / len(top_idf_vals), 3) if top_idf_vals else 1.5
            clean_prompt = strip_conversational_preamble(r["raw_prompt"] or "")
            excerpt_src = next(
                (attributes[k]["text"] for k in ("sujeito", "cenario", "luz") if len(attributes[k]["text"]) > 12),
                r["clean_positive"] or clean_prompt,
            )
            excerpt = re.sub(r"\s+", " ", excerpt_src).strip()[:175]

            # Preenche matriz de features semânticas
            for cat, tlist in ax.items():
                for t in tlist or []:
                    col_i = tag_vocab_idx.get((cat, t))
                    if col_i is not None:
                        _, _, idf = tag_stats_map.get((cat, t), (1, 0.1, 3.0))
                        sem_raw_mat[idx_row, col_i] = max(1.0, idf)
            for w in doc_tokens[idx_row]:
                wi = vocab_idx.get(w)
                if wi is not None:
                    sem_raw_mat[idx_row, n_tag_feats + wi] = 1.2
            if iid in gemma_id_to_idx:
                sem_raw_mat[idx_row, n_tag_feats + n_word_feats :] = gemma_mat[gemma_id_to_idx[iid]][:32] * 2.2
            elif iid in clip_id_to_idx:
                sem_raw_mat[idx_row, n_tag_feats + n_word_feats :] = clip_mat[clip_id_to_idx[iid]][:32] * 1.8

            s_toks = [
                f"fmt:{macro_fmt}",
                f"fmt2:{macro_fmt}",
                f"dia:{detected_dialect}",
                f"neg:{'1' if attributes['estrutura']['hasExplicitNegative'] else '0'}",
                f"fill:{total_filled}",
            ] + [f"k:{k.lower()}" for k in top_keys[:5]]
            struct_tokens_list.append(s_toks)
            for st in s_toks:
                if st not in struct_vocab:
                    struct_vocab[st] = len(struct_vocab)

            eagle_native_tags = json.loads(r.get("eagle_tags_json") or "[]")
            combined_tags = list(dict.fromkeys([*pm_tags, *eagle_native_tags]))[:12]

            item_obj = {
                "id": iid,
                "sourceLib": src,
                "title": str(r["title"] or iid),
                "project": proj,
                "folders": [r["folder"]] if r["folder"] and r["folder"] != "Sem Pasta" else [],
                "eagleTags": combined_tags,
                "star": star_val,
                "btime": int(r.get("btime") or 0),
                "thumbnailUrl": f"/api/thumbnail/{src}/{iid}",
                "rawPrompt": r["raw_prompt"] or "",
                "cleanPrompt": clean_prompt,
                "excerpt": excerpt,
                "attributes": attributes,
                "rarity": {
                    "score": raw_r,
                    "percentile": percentile,
                    "label": f"mais raro que {percentile}% da coleção",
                    "tier": tier,
                    "meanIdf": mean_idf,
                    "pairRarityBonus": round(pair_bonus, 3),
                    "rarestTags": all_tag_stats_sorted[:5],
                    "corpusRank": rank,
                    "corpusSize": n_total,
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
            }
            all_items.append(item_obj)
            label_tags = []
            for ak in ("cenario", "luz", "camera", "textura_material", "sujeito"):
                label_tags.extend(attributes[ak]["tags"])
            meta_records.append(
                {
                    "id": iid,
                    "project": proj,
                    "format": macro_fmt,
                    "tier": tier,
                    "percentile": percentile,
                    "maturity": maturity_score,
                    "label_tags": label_tags,
                }
            )

        print(f"[Ingest 22k] Atributos construídos para {n_total} prompts em {time.time()-t0:.1f}s")

        # 4. Projeção Semântica 24D + Spherical K-Means (K=12) sobre os 22.282 prompts
        sem_raw_mat -= sem_raw_mat.mean(axis=0, keepdims=True)
        cov = sem_raw_mat.T @ sem_raw_mat
        eigvals, eigvecs = np.linalg.eigh(cov)
        top_eigs = np.argsort(eigvals)[::-1][:24]
        sem_24d = sem_raw_mat @ eigvecs[:, top_eigs]
        s_norms = np.linalg.norm(sem_24d, axis=1, keepdims=True)
        s_norms[s_norms == 0] = 1.0
        sem_24d = (sem_24d / s_norms).astype(np.float32)

        sem_assign, sem_x, sem_y, sem_clusters = spherical_kmeans_22k(
            sem_24d, 12, meta_records, "CLUSTER", slot_step=12.0
        )

        # Projeção Estrutural (K=8) sobre os 22.282 prompts
        str_mat = np.zeros((n_total, len(struct_vocab)), dtype=np.float32)
        for i_s, toks in enumerate(struct_tokens_list):
            for tok in toks:
                str_mat[i_s, struct_vocab[tok]] += 1.0
        str_mat -= str_mat.mean(axis=0, keepdims=True)
        st_norms = np.linalg.norm(str_mat, axis=1, keepdims=True)
        st_norms[st_norms == 0] = 1.0
        str_mat /= st_norms
        str_assign, str_x, str_y, str_clusters = spherical_kmeans_22k(
            str_mat, 8, meta_records, "ESQUELETO", slot_step=12.0
        )

        for i_it, it in enumerate(all_items):
            it["mapClusterId"] = int(sem_assign[i_it])
            it["x"] = float(sem_x[i_it])
            it["y"] = float(sem_y[i_it])
            it["structClusterId"] = int(str_assign[i_it])
            it["structX"] = float(str_x[i_it])
            it["structY"] = float(str_y[i_it])

        print(f"[Ingest 22k] Clustering & Projeção 2D (12 clusters) concluídos em {time.time()-t0:.1f}s")

        # 5. Seleciona pool limpo de ~300 itens com miniatura em disco para pares rápidos & doadores de gaps
        feat_pool: List[Dict[str, Any]] = []
        seen_feat_dedup = set()
        # Garante diversidade de projetos, formatos e tiers
        by_proj: Dict[str, List[Dict[str, Any]]] = {}
        for it in all_items:
            if is_clean_prompt(it["rawPrompt"]):
                by_proj.setdefault(it["project"], []).append(it)
        for plist in by_proj.values():
            plist.sort(key=lambda x: (x["star"], x["attributes"]["estrutura"]["filledAttributesCount"], x["rarity"]["percentile"]), reverse=True)

        target_gf_projects = [
            p
            for p, cnt in proj_totals.most_common()
            if p not in ("Gemini Kimi + Antigravity", "Sem Projeto") and cnt >= 25
        ]
        all_target_projects = target_gf_projects + (
            ["Gemini Kimi + Antigravity"] if proj_totals["Gemini Kimi + Antigravity"] > 0 else []
        )
        for proj_n in all_target_projects:
            pool = by_proj.get(proj_n, [])
            added = 0
            for fmt in ("json", "sections", "single_paragraph"):
                sub = [p for p in pool if p["attributes"]["estrutura"]["macroFormat"] == fmt]
                cnt_fmt = 0
                for cand in sub:
                    dk = cand["cleanPrompt"][:100].lower()
                    if dk in seen_feat_dedup:
                        continue
                    if resolve_thumbnail(cand["sourceLib"], cand["id"]) is None:
                        continue
                    seen_feat_dedup.add(dk)
                    feat_pool.append(cand)
                    cnt_fmt += 1
                    added += 1
                    if cnt_fmt >= 14:
                        break
            for cand in pool:
                if added >= 42:
                    break
                dk = cand["cleanPrompt"][:100].lower()
                if dk in seen_feat_dedup:
                    continue
                if resolve_thumbnail(cand["sourceLib"], cand["id"]) is None:
                    continue
                seen_feat_dedup.add(dk)
                feat_pool.append(cand)
                added += 1

        # Matrizes 2D, Tríades Reais (all-tag O=0) e Fronteiras Criativas sobre Google Flow
        item_by_id = {it["id"]: it for it in all_items}
        donor_usage_counter: Counter = Counter()

        def score_donor_item(it: Dict[str, Any], attr_key: str) -> float:
            raw_len = len(it.get("rawPrompt") or "")
            clean_p = (it.get("cleanPrompt") or "").strip()
            tags_len = len(it["attributes"][attr_key]["tags"])
            specificity = 22.0 / max(1, tags_len)
            length_bonus = 10.0 if 320 <= raw_len <= 3800 else (-12.0 if raw_len > 5200 else 2.0)
            boilerplate_pen = -14.0 if re.match(r"^(?:#prompt\s+\d+|Create image:\s*use the attached|STUDIO EDITORIAL)", clean_p, re.I) else 0.0
            mat_bonus = float(it["maturity"]["score"]) * 0.24 + float(it["rarity"]["percentile"]) * 0.1
            reuse_pen = float(donor_usage_counter[it["id"]]) * 7.5
            return specificity + length_bonus + boilerplate_pen + mat_bonus - reuse_pen

        def find_donor(axis: str, tag: str) -> Optional[str]:
            if axis == "motif":
                cands = [it for it in feat_pool if tag in (row_motifs_by_id.get(it["id"]) or [])]
                if not cands:
                    cands = [it for it in all_items if tag in (row_motifs_by_id.get(it["id"]) or [])]
                if not cands:
                    return None
                cands.sort(key=lambda x: score_donor_item(x, "estilo"), reverse=True)
                chosen_id = cands[0]["id"]
                donor_usage_counter[chosen_id] += 1
                return chosen_id

            attr_key = {
                "environment": "cenario",
                "lighting": "luz",
                "pose": "sujeito",
                "angle": "camera",
                "fabric": "textura_material",
                "wardrobe": "textura_material",
            }.get(axis, "sujeito")
            cands = [it for it in feat_pool if tag in it["attributes"][attr_key]["tags"]]
            if not cands:
                cands = [it for it in all_items if tag in it["attributes"][attr_key]["tags"]]
            if not cands:
                return None
            cands.sort(key=lambda x: score_donor_item(x, attr_key), reverse=True)
            chosen_id = cands[0]["id"]
            donor_usage_counter[chosen_id] += 1
            return chosen_id

        matrices: List[Dict[str, Any]] = []
        project_gaps: List[Dict[str, Any]] = []
        global_triad_gaps: List[Dict[str, Any]] = []
        creative_frontier_gaps: List[Dict[str, Any]] = []
        global_underexplored: List[Dict[str, Any]] = []

        scopes_to_build = ["all"] + all_target_projects
        for scope in scopes_to_build:
            total_s = gf_total if scope == "all" else proj_totals[scope]
            cnt_map = all_counts_gf if scope == "all" else proj_all_counts[scope]
            cooc_src = all_cooc_gf if scope == "all" else proj_all_cooc[scope]

            for ca, cb in MATRIX_AXIS_PAIRS:
                rows_tags = [t for t in AXIS_RARITY_PRIORITY[ca] if cnt_map[ca][t] > 0][:9]
                cols_tags = [t for t in AXIS_RARITY_PRIORITY[cb] if cnt_map[cb][t] > 0][:9]
                if not rows_tags or not cols_tags:
                    continue

                cells = []
                for ta in rows_tags:
                    fa = cnt_map[ca][ta]
                    for tb in cols_tags:
                        fb = cnt_map[cb][tb]
                        obs = cooc_src[(ca, ta, cb, tb)]
                        exp = round((fa * fb) / max(1, total_s), 2)
                        lift = round(obs / max(0.01, exp), 3) if exp > 0 else 0.0
                        dummy_blocks = {
                            "environment_props": {"text": ta if ca == "environment" else (tb if cb == "environment" else "")},
                            "lighting_physics": {"text": ta if ca == "lighting" else (tb if cb == "lighting" else "")},
                            "wardrobe_materials": {"text": ta if ca in ("wardrobe", "fabric") else (tb if cb in ("wardrobe", "fabric") else "")},
                            "camera_framing_occlusion": {"text": ta if ca == "angle" else (tb if cb == "angle" else "")},
                            "body_mechanics_pose": {"text": ta if ca == "pose" else (tb if cb == "pose" else "")},
                        }
                        coherent, _ = check_physical_and_empirical_coherence(dummy_blocks, conn=None, axis_tags={ca: [ta], cb: [tb]})
                        is_gap = obs == 0 and fa >= 12 and fb >= 12 and exp >= 0.8 and coherent
                        cells.append(
                            {
                                "row": ta,
                                "col": tb,
                                "observed": obs,
                                "expected": exp,
                                "lift": lift,
                                "isGap": is_gap,
                                "isCoherent": coherent,
                            }
                        )

                        if scope != "all" and is_gap:
                            project_gaps.append(
                                {
                                    "id": f"pgap:{scope}:{ca}:{ta}:{cb}:{tb}",
                                    "kind": "project_2d_zero",
                                    "scope": scope,
                                    "axisA": ca,
                                    "tagA": ta,
                                    "freqA": fa,
                                    "axisB": cb,
                                    "tagB": tb,
                                    "freqB": fb,
                                    "observedCount": 0,
                                    "expectedCount": exp,
                                    "lift": 0.0,
                                    "isCoherent": True,
                                    "donorAId": find_donor(ca, ta),
                                    "donorBId": find_donor(cb, tb),
                                    "title": f"{human_tag(ta)} × {human_tag(tb)}",
                                    "rationale": f"Dentro de '{scope}' (N={total_s}), '{human_tag(ta)}' ({fa}x) e '{human_tag(tb)}' ({fb}x) nunca se cruzaram (O=0 real, E={exp}).",
                                }
                            )
                        elif scope == "all" and coherent and fa >= 120 and fb >= 120 and exp >= 12.0 and 0 < obs and lift < 0.45:
                            global_underexplored.append(
                                {
                                    "id": f"g2d:{ca}:{ta}:{cb}:{tb}",
                                    "kind": "global_2d_low_lift",
                                    "scope": f"Google Flow ({fmt_pt(gf_total)})",
                                    "axisA": ca,
                                    "tagA": ta,
                                    "freqA": fa,
                                    "axisB": cb,
                                    "tagB": tb,
                                    "freqB": fb,
                                    "observedCount": obs,
                                    "expectedCount": exp,
                                    "lift": lift,
                                    "isCoherent": True,
                                    "donorAId": find_donor(ca, ta),
                                    "donorBId": find_donor(cb, tb),
                                    "title": f"{human_tag(ta)} × {human_tag(tb)}",
                                    "rationale": f"Subexplorado em Google Flow: observado apenas {obs}x vs. {exp}x esperado (Lift {lift}x).",
                                }
                            )

                matrices.append(
                    {
                        "scope": scope,
                        "axisA": ca,
                        "axisB": cb,
                        "axisALabel": AXIS_LABELS_PT[ca],
                        "axisBLabel": AXIS_LABELS_PT[cb],
                        "totalPrompts": total_s,
                        "rows": rows_tags,
                        "cols": cols_tags,
                        "rowTotals": {t: cnt_map[ca][t] for t in rows_tags},
                        "colTotals": {t: cnt_map[cb][t] for t in cols_tags},
                        "cells": cells,
                    }
                )

        # Tríades globais multi-eixo com O=0 REAL (contagem all-tag em todos os eixos)
        raw_triad_candidates: List[Tuple[float, str, str, int, str, str, int, str, str, int]] = []
        seen_triad_keys = set()
        for c1, c2, c3 in TRIAD_AXIS_TRIPLES:
            for t1, f1 in all_counts_gf[c1].items():
                if f1 < 60:
                    continue
                for t2, f2 in all_counts_gf[c2].items():
                    if f2 < 60:
                        continue
                    for t3, f3 in all_counts_gf[c3].items():
                        if f3 < 60:
                            continue
                        canonical_set = tuple(sorted(((c1, t1), (c2, t2), (c3, t3))))
                        if canonical_set in seen_triad_keys:
                            continue
                        if all_tri_cooc_gf[(c1, t1, c2, t2, c3, t3)] != 0:
                            continue
                        exp = round((f1 * f2 * f3) / (max(1, gf_total) ** 2), 2)
                        if exp < 0.6:
                            continue
                        dummy_blocks = {
                            "environment_props": {"text": t1 if c1 == "environment" else (t2 if c2 == "environment" else (t3 if c3 == "environment" else ""))},
                            "lighting_physics": {"text": t1 if c1 == "lighting" else (t2 if c2 == "lighting" else (t3 if c3 == "lighting" else ""))},
                            "camera_framing_occlusion": {"text": t1 if c1 == "angle" else (t2 if c2 == "angle" else (t3 if c3 == "angle" else ""))},
                            "wardrobe_materials": {"text": " ".join(x for c, x in ((c1, t1), (c2, t2), (c3, t3)) if c in ("fabric", "wardrobe"))},
                            "body_mechanics_pose": {"text": t1 if c1 == "pose" else (t2 if c2 == "pose" else (t3 if c3 == "pose" else ""))},
                        }
                        ax_map: Dict[str, List[str]] = {}
                        for cx, tx in ((c1, t1), (c2, t2), (c3, t3)):
                            ax_map.setdefault(cx, []).append(tx)
                        coherent, _ = check_physical_and_empirical_coherence(dummy_blocks, conn=None, axis_tags=ax_map)
                        if coherent:
                            seen_triad_keys.add(canonical_set)
                            raw_triad_candidates.append((exp, c1, t1, f1, c2, t2, f2, c3, t3, f3))

        raw_triad_candidates.sort(key=lambda x: x[0], reverse=True)
        triad_tag_quota: Counter = Counter()
        for exp, c1, t1, f1, c2, t2, f2, c3, t3, f3 in raw_triad_candidates:
            if len(global_triad_gaps) >= 55:
                break
            if triad_tag_quota[(c1, t1)] >= 7 or triad_tag_quota[(c2, t2)] >= 7 or triad_tag_quota[(c3, t3)] >= 7:
                continue
            triad_tag_quota[(c1, t1)] += 1
            triad_tag_quota[(c2, t2)] += 1
            triad_tag_quota[(c3, t3)] += 1
            global_triad_gaps.append(
                {
                    "id": f"g3d:{c1}:{t1}:{c2}:{t2}:{c3}:{t3}",
                    "kind": "global_3d_zero",
                    "scope": f"Google Flow ({fmt_pt(gf_total)})",
                    "axisA": c1,
                    "tagA": t1,
                    "freqA": f1,
                    "axisB": c2,
                    "tagB": t2,
                    "freqB": f2,
                    "axisC": c3,
                    "tagC": t3,
                    "freqC": f3,
                    "observedCount": 0,
                    "expectedCount": exp,
                    "lift": 0.0,
                    "isCoherent": True,
                    "donorAId": find_donor(c1, t1),
                    "donorBId": find_donor(c2, t2),
                    "donorCId": find_donor(c3, t3),
                    "title": f"{human_tag(t1)} × {human_tag(t2)} × {human_tag(t3)}",
                    "rationale": f"O=0 verificado em todas as tags dos {fmt_pt(gf_total)} prompts ({AXIS_LABELS_PT[c1]} × {AXIS_LABELS_PT[c2]} × {AXIS_LABELS_PT[c3]} · E={exp}).",
                }
            )

        # Fronteiras Criativas O=0 (motivos raros da cauda longa cruzados com os eixos do acervo)
        raw_frontier_candidates: List[Tuple[float, str, int, str, str, int, str, str, int]] = []
        for mf, fm in motif_counts_gf.items():
            if fm < 12:
                continue
            for ax2 in ("environment", "fabric", "pose", "wardrobe"):
                for t2, f2 in all_counts_gf[ax2].items():
                    if f2 < 200:
                        continue
                    for ax3 in ("lighting", "angle"):
                        for t3, f3 in all_counts_gf[ax3].items():
                            if f3 < 200:
                                continue
                            if motif_tri_cooc_gf[(mf, ax2, t2, ax3, t3)] != 0:
                                continue
                            if not is_frontier_pair_coherent(mf, ax2, t2, ax3, t3):
                                continue
                            exp = round((fm * f2 * f3) / (max(1, gf_total) ** 2), 2)
                            if exp < 0.45:
                                continue
                            raw_frontier_candidates.append((exp, mf, fm, ax2, t2, f2, ax3, t3, f3))

        raw_frontier_candidates.sort(key=lambda x: x[0], reverse=True)
        motif_quota: Counter = Counter()
        frontier_pair_quota: Counter = Counter()
        for exp, mf, fm, ax2, t2, f2, ax3, t3, f3 in raw_frontier_candidates:
            if len(creative_frontier_gaps) >= 54:
                break
            if motif_quota[mf] >= 3 or frontier_pair_quota[(ax2, t2, ax3, t3)] >= 2:
                continue
            motif_quota[mf] += 1
            frontier_pair_quota[(ax2, t2, ax3, t3)] += 1
            catalyst = f"Motivo raro ({fm}x no acervo) colidindo com {human_tag(t2)} e {human_tag(t3)} para romper o padrão habitual."
            creative_frontier_gaps.append(
                {
                    "id": f"gfnt:{mf}:{ax2}:{t2}:{ax3}:{t3}",
                    "kind": "global_frontier_zero",
                    "scope": f"Google Flow ({fmt_pt(gf_total)})",
                    "axisA": "motif",
                    "tagA": mf,
                    "freqA": fm,
                    "axisB": ax2,
                    "tagB": t2,
                    "freqB": f2,
                    "axisC": ax3,
                    "tagC": t3,
                    "freqC": f3,
                    "observedCount": 0,
                    "expectedCount": exp,
                    "lift": 0.0,
                    "isCoherent": True,
                    "isFrontier": True,
                    "creativeCatalyst": catalyst,
                    "donorAId": find_donor("motif", mf),
                    "donorBId": find_donor(ax2, t2),
                    "donorCId": find_donor(ax3, t3),
                    "title": f"{human_tag(mf)} × {human_tag(t2)} × {human_tag(t3)}",
                    "rationale": f"Fronteira Inédita (O=0 real em {fmt_pt(gf_total)} prompts · E={exp}). {catalyst}",
                }
            )

        tested_bridges_list: List[Dict[str, Any]] = []
        for bkey, entries in tested_bridges_raw.items():
            entries_sorted = sorted(entries, key=lambda x: x[1], reverse=True)
            thumbs: List[Dict[str, Any]] = []
            projs_seen: List[str] = []
            for iid, bt in entries_sorted:
                it = item_by_id.get(iid)
                if not it:
                    continue
                if it["project"] not in projs_seen:
                    projs_seen.append(it["project"])
                if len(thumbs) < 6:
                    thumbs.append(
                        {
                            "id": it["id"],
                            "title": it["title"],
                            "project": it["project"],
                            "sourceLib": it["sourceLib"],
                            "thumbnailUrl": it["thumbnailUrl"],
                            "btime": bt,
                            "rarityTier": it["rarity"]["tier"],
                            "rarityPercentile": it["rarity"]["percentile"],
                            "maturityScore": it["maturity"]["score"],
                        }
                    )
            tested_bridges_list.append(
                {
                    "bridgeKey": bkey,
                    "tags": [p.strip() for p in bkey.split("×") if p.strip()],
                    "count": len(entries),
                    "latestBtime": entries_sorted[0][1] if entries_sorted else 0,
                    "projects": projs_seen,
                    "items": thumbs,
                }
            )
        tested_bridges_list.sort(key=lambda x: x["latestBtime"], reverse=True)

        project_gaps.sort(key=lambda g: g["expectedCount"], reverse=True)
        global_triad_gaps.sort(key=lambda g: g["expectedCount"], reverse=True)
        creative_frontier_gaps.sort(key=lambda g: g["expectedCount"], reverse=True)
        global_underexplored.sort(key=lambda g: (g["lift"], -g["expectedCount"]))

        # Manchas vazias (voidZones) no mapa de 22k pontos
        void_zones: List[Dict[str, Any]] = []
        pts_xy = np.stack([sem_x, sem_y], axis=1)
        cluster_pairs = []
        for a_i in range(len(sem_clusters)):
            for b_i in range(a_i + 1, len(sem_clusters)):
                ca, cb = sem_clusters[a_i], sem_clusters[b_i]
                cluster_pairs.append((math.hypot(cb["cx"] - ca["cx"], cb["cy"] - ca["cy"]), ca, cb))
        cluster_pairs.sort(key=lambda x: x[0])

        gap_pool_voids = creative_frontier_gaps[:8] + global_triad_gaps[:8] + project_gaps[:8]
        used_voids: List[Tuple[float, float]] = []
        for _, ca, cb in cluster_pairs:
            if len(void_zones) >= 8:
                break
            mx = (ca["cx"] + cb["cx"]) * 0.5
            my = (ca["cy"] + cb["cy"]) * 0.5
            min_pt_d = float(np.min(np.hypot(pts_xy[:, 0] - mx, pts_xy[:, 1] - my)))
            if min_pt_d < 95.0:
                dx, dy = cb["cx"] - ca["cx"], cb["cy"] - ca["cy"]
                seg_l = max(1.0, math.hypot(dx, dy))
                nx, ny = -dy / seg_l, dx / seg_l
                for sign in (1.0, -1.0):
                    cx_cand, cy_cand = mx + nx * 165.0 * sign, my + ny * 165.0 * sign
                    d2 = float(np.min(np.hypot(pts_xy[:, 0] - cx_cand, pts_xy[:, 1] - cy_cand)))
                    if d2 > min_pt_d:
                        mx, my, min_pt_d = cx_cand, cy_cand, d2
                        break
            if min_pt_d < 85.0:
                continue
            if any(math.hypot(mx - ux, my - uy) < 220.0 for ux, uy in used_voids):
                continue
            used_voids.append((mx, my))
            gap_ref = gap_pool_voids[len(void_zones) % max(1, len(gap_pool_voids))] if gap_pool_voids else None
            void_zones.append(
                {
                    "id": f"void-{len(void_zones) + 1}",
                    "label": gap_ref["title"] if gap_ref else f"Vazio C{ca['clusterId']:02d}–C{cb['clusterId']:02d}",
                    "x": round(mx, 1),
                    "y": round(my, 1),
                    "radius": round(min(130.0, max(78.0, min_pt_d * 0.72)), 1),
                    "betweenClusters": [ca["clusterId"], cb["clusterId"]],
                    "axisA": gap_ref["axisA"] if gap_ref else "environment",
                    "tagA": gap_ref["tagA"] if gap_ref else "studio_seamless_backdrop",
                    "axisB": gap_ref["axisB"] if gap_ref else "lighting",
                    "tagB": gap_ref["tagB"] if gap_ref else "chiaroscuro_gobo_caustics",
                    "observedCount": 0,
                    "expectedCount": gap_ref["expectedCount"] if gap_ref else 4.0,
                    "scopeLabel": gap_ref["scope"] if gap_ref else "Google Flow",
                    "gapId": gap_ref["id"] if gap_ref else None,
                }
            )

        # 6. Pares em duas camadas sobre feat_pool (~300 itens com miniatura garantida)
        id_to_all_idx = {it["id"]: i for i, it in enumerate(all_items)}
        fp_n = len(feat_pool)
        fp_sem = np.stack([sem_24d[id_to_all_idx[it["id"]]] for it in feat_pool], axis=0)
        fp_cos = np.clip(fp_sem @ fp_sem.T, 0.0, 1.0)
        fp_toks = [
            {w for w in WORD_RE.findall(" ".join(it["attributes"][k]["text"] for k in ("sujeito", "cenario", "luz", "textura_material", "estilo")).lower())}
            for it in feat_pool
        ]
        fp_keys = [
            set([it["attributes"]["estrutura"]["macroFormat"], it["attributes"]["estrutura"]["kernelDialect"]] + [k.lower() for k in it["attributes"]["estrutura"]["topKeysOrSections"]])
            for it in feat_pool
        ]

        def jacc(a: set, b: set) -> float:
            if not a and not b:
                return 1.0
            if not a or not b:
                return 0.0
            return len(a & b) / len(a | b)

        pair_scores = []
        for i in range(fp_n):
            id_i = feat_pool[i]["id"]
            est_i = feat_pool[i]["attributes"]["estrutura"]
            for j in range(i + 1, fp_n):
                id_j = feat_pool[j]["id"]
                neural_sim = float(fp_cos[i, j])
                if id_i in gemma_id_to_idx and id_j in gemma_id_to_idx:
                    neural_sim = 0.55 * max(0.0, float(np.dot(gemma_mat[gemma_id_to_idx[id_i]], gemma_mat[gemma_id_to_idx[id_j]]))) + 0.45 * neural_sim
                elif id_i in clip_id_to_idx and id_j in clip_id_to_idx:
                    neural_sim = 0.45 * max(0.0, float(np.dot(clip_mat[clip_id_to_idx[id_i]], clip_mat[clip_id_to_idx[id_j]]))) + 0.55 * neural_sim
                sem_s = round(0.72 * neural_sim + 0.28 * jacc(fp_toks[i], fp_toks[j]), 3)
                est_j = feat_pool[j]["attributes"]["estrutura"]
                same_f = 1.0 if est_i["macroFormat"] == est_j["macroFormat"] else 0.0
                same_d = 1.0 if est_i["kernelDialect"] == est_j["kernelDialect"] else 0.0
                str_s = round(0.35 * same_f + 0.25 * same_d + 0.40 * jacc(fp_keys[i], fp_keys[j]), 3)
                pair_scores.append((i, j, sem_s, str_s, round(abs(sem_s - str_s), 3)))

        def mk_pair(i: int, j: int, sem_s: float, str_s: float, div_s: float, cat: str, reason: str) -> Dict[str, Any]:
            a, b = feat_pool[i], feat_pool[j]
            changed = [
                k for k in ("sujeito", "cenario", "luz", "camera", "textura_material", "estilo", "projeto_cliente", "estrutura")
                if a["attributes"][k]["text"].strip().lower() != b["attributes"][k]["text"].strip().lower()
            ]
            return {
                "id": f"{cat}:{a['id']}:{b['id']}",
                "idA": a["id"],
                "idB": b["id"],
                "category": cat,
                "semanticSim": sem_s,
                "structuralSim": str_s,
                "divergenceScore": div_s,
                "changedAttributes": changed,
                "sharedAttributeCount": 8 - len(changed),
                "reason": reason,
            }

        same_skel_diff_subj: List[Dict[str, Any]] = []
        c1 = [p for p in pair_scores if p[3] >= 0.65 and p[2] <= 0.44]
        c1.sort(key=lambda p: (p[3] - p[2]), reverse=True)
        # Sample evenly across c1 when there are > 30 candidates so scores aren't all saturated at 100%/0%
        c1_non_zero = [p for p in c1 if p[2] > 0.01]
        c1_pool = c1_non_zero if len(c1_non_zero) >= 30 else c1
        step1 = max(1, len(c1_pool) // 90)
        c1_sampled = c1_pool[::step1]
        seen1: Dict[str, int] = {}
        for i, j, sem_s, str_s, div_s in c1_sampled:
            if len(same_skel_diff_subj) >= 30:
                break
            id_a, id_b = feat_pool[i]["id"], feat_pool[j]["id"]
            if seen1.get(id_a, 0) >= 2 or seen1.get(id_b, 0) >= 2:
                continue
            seen1[id_a] = seen1.get(id_a, 0) + 1
            seen1[id_b] = seen1.get(id_b, 0) + 1
            same_skel_diff_subj.append(
                mk_pair(
                    i, j, sem_s, str_s, div_s, "same_skeleton_diff_subject",
                    f"Mesmo molde estrutural ({feat_pool[i]['attributes']['estrutura']['kernelDialect']}, {round(str_s*100)}%) aplicado a cenas distintas ({round(sem_s*100)}% semântica).",
                )
            )

        same_subj_diff_skel: List[Dict[str, Any]] = []
        c2 = [p for p in pair_scores if p[2] >= 0.56 and p[3] <= 0.45]
        c2.sort(key=lambda p: (p[2] - p[3]), reverse=True)
        seen2 = set()
        for i, j, sem_s, str_s, div_s in c2:
            if len(same_subj_diff_skel) >= 30:
                break
            if feat_pool[i]["id"] in seen2 and feat_pool[j]["id"] in seen2:
                continue
            seen2.update([feat_pool[i]["id"], feat_pool[j]["id"]])
            fa = feat_pool[i]["attributes"]["estrutura"]["macroFormat"].upper()
            fb = feat_pool[j]["attributes"]["estrutura"]["macroFormat"].upper()
            same_subj_diff_skel.append(
                mk_pair(
                    i, j, sem_s, str_s, div_s, "same_subject_diff_skeleton",
                    f"Mesmo universo visual ({int(sem_s*100)}% semântica) escrito em formatos distintos ({fa} vs {fb}, {int(str_s*100)}% estrutural).",
                )
            )

        near_dups: List[Dict[str, Any]] = []
        c3 = [
            p for p in pair_scores
            if p[2] >= 0.72 and p[3] >= 0.70 and feat_pool[p[0]]["cleanPrompt"] != feat_pool[p[1]]["cleanPrompt"]
        ]
        c3.sort(key=lambda p: (p[2] + p[3]), reverse=True)
        for i, j, sem_s, str_s, div_s in c3[:30]:
            near_dups.append(
                mk_pair(
                    i, j, sem_s, str_s, div_s, "near_duplicate",
                    f"Quase duplicados ({int(sem_s*100)}% semântica · {int(str_s*100)}% estrutural) — variação incremental.",
                )
            )

        # 7. Sumário de Projetos (Google Flow dinâmico + Gemini Kimi)
        projects_data: List[Dict[str, Any]] = []
        for proj_name in all_target_projects:
            p_tot = proj_totals[proj_name]
            p_src = "gemini_kimi" if proj_name == "Gemini Kimi + Antigravity" else "google_flow"
            p_subfolders = [{"name": sf, "count": cnt} for sf, cnt in proj_subfolders[proj_name].most_common(10)]
            p_fmts = proj_formats[proj_name]
            p_tiers = proj_tier_dist.get(proj_name, Counter())
            p_quads = proj_quad_dist.get(proj_name, Counter())
            avg_pct = round(proj_pct_sum[proj_name] / max(1, p_tot), 1)
            avg_mat = round(proj_mat_sum[proj_name] / max(1, p_tot), 1)

            dom_tags = []
            for ax_name in ("environment", "lighting", "pose", "angle", "fabric", "wardrobe"):
                for tg, cnt in proj_prim_counts[proj_name][ax_name].most_common(2):
                    dom_tags.append({"axis": ax_name, "tag": tg, "count": cnt, "pct": round((cnt / max(1, p_tot)) * 100.0, 1)})
            dom_tags.sort(key=lambda x: x["count"], reverse=True)

            p_top_gaps = [g for g in project_gaps if g["scope"] == proj_name][:4]
            ex_ids = [it["id"] for it in feat_pool if it["project"] == proj_name][:6]
            projects_data.append(
                {
                    "id": re.sub(r"[^a-z0-9]+", "-", proj_name.lower()).strip("-"),
                    "name": proj_name,
                    "sourceLib": p_src,
                    "totalPrompts": p_tot,
                    "corpusSharePct": round((p_tot / max(1, n_total)) * 100.0, 1),
                    "sampleCount": p_tot,
                    "avgRarityPercentile": avg_pct,
                    "avgMaturityScore": avg_mat,
                    "tierDistribution": {t: p_tiers.get(t, 0) for t in ("S", "A", "B", "C", "D")},
                    "formatDistribution": {
                        "json": p_fmts.get("json", 0),
                        "sections": p_fmts.get("sections", 0),
                        "single_paragraph": p_fmts.get("single_paragraph", 0),
                    },
                    "quadrantDistribution": {
                        q: p_quads.get(q, 0)
                        for q in ("raro_maduro", "raro_imaturo", "comum_maduro", "comum_imaturo")
                    },
                    "subfolders": p_subfolders,
                    "dominantTags": dom_tags[:6],
                    "topGaps": p_top_gaps,
                    "exemplarIds": ex_ids,
                }
            )

        # Coleta exatamente todos os itens referenciados por pares, doadores de gaps e exemplares de projetos para suite JSON
        featured_ids = set()
        for p in same_skel_diff_subj + same_subj_diff_skel + near_dups:
            featured_ids.add(p["idA"])
            featured_ids.add(p["idB"])
        for g in project_gaps[:80] + global_triad_gaps[:60] + creative_frontier_gaps[:54] + global_underexplored[:50]:
            if g.get("donorAId"):
                featured_ids.add(g["donorAId"])
            if g.get("donorBId"):
                featured_ids.add(g["donorBId"])
            if g.get("donorCId"):
                featured_ids.add(g["donorCId"])
        for pr in projects_data:
            for eid in pr["exemplarIds"]:
                featured_ids.add(eid)
        featured_items = [item_by_id[fid] for fid in featured_ids if fid in item_by_id]

        fmt_dist_global = Counter(it["attributes"]["estrutura"]["macroFormat"] for it in all_items)
        tier_dist_global = Counter(it["rarity"]["tier"] for it in all_items)
        quad_dist_global = Counter(it["quadrant"] for it in all_items)

        suite_payload = {
            "stats": {
                "generatedAt": datetime.now(timezone.utc).isoformat(),
                "primaryLibraryName": "Google Flow + Prompts.library",
                "primaryLibraryPath": str(GOOGLE_FLOW_LIB),
                "totalCorpusSize": n_total,
                "googleFlowSize": gf_total,
                "geminiKimiSize": gk_total,
                "sampleSize": len(featured_items),
                "sourcesReadOnly": [
                    {
                        "name": "Google Flow + Prompts.library",
                        "path": str(GOOGLE_FLOW_LIB),
                        "count": gf_total,
                        "mode": "READ_ONLY",
                    },
                    {
                        "name": "EmbeddingGemma-2 + CLIP (Int8)",
                        "path": str(GEMMA2_BIN),
                        "count": len(gemma_id_to_idx) + len(clip_id_to_idx),
                        "mode": "READ_ONLY",
                    },
                    {
                        "name": "PoseMatch (posematch_eagle.sqlite)",
                        "path": str(POSEMATCH_DB),
                        "count": pm_items_count if POSEMATCH_DB.exists() else 0,
                        "mode": "READ_ONLY",
                    },
                ],
                "formatDistribution": {
                    "json": fmt_dist_global.get("json", 0),
                    "sections": fmt_dist_global.get("sections", 0),
                    "single_paragraph": fmt_dist_global.get("single_paragraph", 0),
                },
                "tierDistribution": {t: tier_dist_global.get(t, 0) for t in ("S", "A", "B", "C", "D")},
                "quadrantDistribution": {
                    q: quad_dist_global.get(q, 0)
                    for q in ("raro_maduro", "raro_imaturo", "comum_maduro", "comum_imaturo")
                },
                "sampleGapPreviews": [
                    {
                        "axisA": g["axisA"],
                        "tagA": g["tagA"],
                        "freqA": g["freqA"],
                        "axisB": g["axisB"],
                        "tagB": g["tagB"],
                        "freqB": g["freqB"],
                        "observedCount": 0,
                        "expectedCount": g["expectedCount"],
                    }
                    for g in project_gaps[:8]
                ],
            },
            "items": featured_items,
            "mapData": {
                "clusters": sem_clusters,
                "structuralClusters": str_clusters,
                "voidZones": void_zones,
            },
            "pairsData": {
                "sameSkeletonDiffSubject": same_skel_diff_subj,
                "sameSubjectDiffSkeleton": same_subj_diff_skel,
                "nearDuplicates": near_dups,
            },
            "gapsData": {
                "matrices": matrices,
                "projectGaps": project_gaps[:80],
                "globalTriadGaps": global_triad_gaps[:55],
                "creativeFrontierGaps": creative_frontier_gaps[:54],
                "globalUnderexplored": global_underexplored[:50],
                "testedBridges": tested_bridges_list,
            },
            "projectsData": projects_data,
        }

        synced_at_iso = datetime.now(timezone.utc).isoformat()
        target_suite_path = (
            DATA_DIR / "suite_google_flow.json.next" if args.stage_only else OUTPUT_SUITE_JSON
        )
        tmp_suite_path = DATA_DIR / "suite_google_flow.json.tmp"
        tmp_suite_path.write_text(json.dumps(suite_payload, ensure_ascii=False), encoding="utf-8")

        # 8. Grava todos os prompts no SQLite com FTS5 e blobs de vetores 24d + sync_meta
        target_db_path = (
            DATA_DIR / "prompt_engine_v1.sqlite.next" if args.stage_only else OUTPUT_DB
        )
        tmp_db = OUTPUT_DB.with_suffix(".sqlite.tmp")
        for sidecar in (
            tmp_db,
            tmp_db.with_name(tmp_db.name + "-wal"),
            tmp_db.with_name(tmp_db.name + "-shm"),
        ):
            if sidecar.exists():
                sidecar.unlink()
        out_conn = sqlite3.connect(tmp_db)
        try:
            ocur = out_conn.cursor()
            ocur.executescript(
                """
                PRAGMA journal_mode = WAL;
                PRAGMA synchronous = NORMAL;
                CREATE TABLE prompts (
                    id TEXT PRIMARY KEY,
                    source_lib TEXT NOT NULL,
                    title TEXT NOT NULL,
                    project_name TEXT NOT NULL,
                    folders_json TEXT NOT NULL,
                    eagle_tags_json TEXT NOT NULL,
                    star INTEGER DEFAULT 0,
                    btime INTEGER DEFAULT 0,
                    thumbnail_url TEXT,
                    raw_prompt TEXT NOT NULL,
                    clean_prompt TEXT NOT NULL,
                    excerpt TEXT NOT NULL,
                    macro_format TEXT NOT NULL,
                    kernel_dialect TEXT NOT NULL,
                    skeleton_signature TEXT NOT NULL,
                    filled_attributes_count INTEGER NOT NULL,
                    rarity_score REAL NOT NULL,
                    rarity_percentile INTEGER NOT NULL,
                    rarity_label TEXT NOT NULL,
                    rarity_tier TEXT NOT NULL,
                    maturity_score REAL NOT NULL,
                    quadrant TEXT NOT NULL,
                    map_cluster_id INTEGER NOT NULL,
                    x REAL NOT NULL,
                    y REAL NOT NULL,
                    struct_cluster_id INTEGER NOT NULL,
                    struct_x REAL NOT NULL,
                    struct_y REAL NOT NULL,
                    attributes_json TEXT NOT NULL,
                    rarity_breakdown_json TEXT NOT NULL,
                    maturity_breakdown_json TEXT NOT NULL,
                    pose_telemetry_json TEXT,
                    sem_vec BLOB NOT NULL
                );

                CREATE VIRTUAL TABLE prompts_fts USING fts5(
                    id UNINDEXED,
                    title,
                    project_name,
                    clean_prompt,
                    tags_text,
                    kernel_dialect
                );

                CREATE TABLE similarity_pairs (
                    prompt_id_a TEXT NOT NULL,
                    prompt_id_b TEXT NOT NULL,
                    semantic_sim REAL NOT NULL,
                    structural_sim REAL NOT NULL,
                    divergence_score REAL NOT NULL,
                    category TEXT NOT NULL,
                    PRIMARY KEY (prompt_id_a, prompt_id_b, category)
                );

                CREATE TABLE sync_meta (
                    key TEXT PRIMARY KEY,
                    value TEXT NOT NULL
                );

                CREATE TABLE gap_bridges (
                    bridge_key TEXT NOT NULL,
                    prompt_id TEXT NOT NULL,
                    btime INTEGER NOT NULL DEFAULT 0,
                    PRIMARY KEY (bridge_key, prompt_id)
                );
                """
            )

            prompt_rows_db = []
            fts_rows_db = []
            for idx_it, it in enumerate(all_items):
                est = it["attributes"]["estrutura"]
                vec_blob = sem_24d[idx_it].tobytes()
                all_tags_str = " ".join(
                    t
                    for k in ("sujeito", "cenario", "luz", "camera", "textura_material", "estilo")
                    for t in it["attributes"][k]["tags"]
                ) + " " + " ".join(it["eagleTags"]) + " " + " ".join(row_motifs_by_id.get(it["id"], []))

                prompt_rows_db.append(
                    (
                        it["id"],
                        it["sourceLib"],
                        it["title"],
                        it["project"],
                        json.dumps(it["folders"], ensure_ascii=False),
                        json.dumps(it["eagleTags"], ensure_ascii=False),
                        it["star"],
                        it["btime"],
                        it["thumbnailUrl"],
                        it["rawPrompt"],
                        it["cleanPrompt"],
                        it["excerpt"],
                        est["macroFormat"],
                        est["kernelDialect"],
                        est["skeletonSignature"],
                        est["filledAttributesCount"],
                        it["rarity"]["score"],
                        it["rarity"]["percentile"],
                        it["rarity"]["label"],
                        it["rarity"]["tier"],
                        it["maturity"]["score"],
                        it["quadrant"],
                        it["mapClusterId"],
                        it["x"],
                        it["y"],
                        it["structClusterId"],
                        it["structX"],
                        it["structY"],
                        json.dumps(it["attributes"], ensure_ascii=False),
                        json.dumps(it["rarity"], ensure_ascii=False),
                        json.dumps(it["maturity"], ensure_ascii=False),
                        json.dumps(it["poseTelemetry"], ensure_ascii=False) if it["poseTelemetry"] else None,
                        vec_blob,
                    )
                )
                fts_rows_db.append(
                    (
                        it["id"],
                        it["title"],
                        it["project"],
                        it["cleanPrompt"],
                        all_tags_str.strip(),
                        est["kernelDialect"],
                    )
                )

            ocur.executemany(
                "INSERT INTO prompts VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
                prompt_rows_db,
            )
            ocur.executemany(
                "INSERT INTO prompts_fts (id, title, project_name, clean_prompt, tags_text, kernel_dialect) VALUES (?,?,?,?,?,?)",
                fts_rows_db,
            )
            for p in same_skel_diff_subj + same_subj_diff_skel + near_dups:
                ocur.execute(
                    "INSERT OR IGNORE INTO similarity_pairs VALUES (?,?,?,?,?,?)",
                    (p["idA"], p["idB"], p["semanticSim"], p["structuralSim"], p["divergenceScore"], p["category"]),
                )
            for bkey, entries in tested_bridges_raw.items():
                for iid, bt in entries:
                    ocur.execute(
                        "INSERT OR IGNORE INTO gap_bridges VALUES (?,?,?)",
                        (bkey, iid, bt),
                    )

            gf_sync = sync_stats.get("google_flow", {})
            gk_sync = sync_stats.get("gemini_kimi", {})
            new_parsed_total = int(gf_sync.get("new_or_modified", 0)) + int(gk_sync.get("new_or_modified", 0))
            sync_meta_rows = [
                ("synced_at", synced_at_iso),
                ("gf_eagle_total", str(gf_sync.get("eagle_total", 0))),
                ("gk_eagle_total", str(gk_sync.get("eagle_total", 0))),
                ("gf_active_prompts", str(gf_total)),
                ("gk_active_prompts", str(gk_total)),
                ("gf_mtime_ts", str(gf_sync.get("lib_mtime_ts", 0))),
                ("gk_mtime_ts", str(gk_sync.get("lib_mtime_ts", 0))),
                ("new_parsed_count", str(new_parsed_total)),
                ("total_corpus", str(n_total)),
            ]
            ocur.executemany("INSERT OR REPLACE INTO sync_meta VALUES (?, ?)", sync_meta_rows)

            ocur.executescript(
                """
                CREATE INDEX idx_prompts_source_tier ON prompts(source_lib, rarity_tier);
                CREATE INDEX idx_prompts_project ON prompts(project_name);
                CREATE INDEX idx_prompts_quadrant ON prompts(quadrant);
                CREATE INDEX idx_prompts_format ON prompts(macro_format);
                CREATE INDEX idx_prompts_cluster ON prompts(map_cluster_id);
                CREATE INDEX idx_prompts_rarity_pct ON prompts(rarity_percentile DESC, maturity_score DESC);
                """
            )
            out_conn.commit()
            out_conn.execute("PRAGMA wal_checkpoint(TRUNCATE)")
            out_conn.execute("PRAGMA journal_mode = DELETE")
            out_conn.commit()
        finally:
            out_conn.close()

        final_db_path = target_db_path
        final_suite_path = target_suite_path
        try:
            for sidecar in (
                target_db_path.with_name(target_db_path.name + "-wal"),
                target_db_path.with_name(target_db_path.name + "-shm"),
            ):
                if sidecar.exists():
                    sidecar.unlink()
            if target_db_path.exists():
                target_db_path.unlink()
            tmp_db.replace(target_db_path)

            if target_suite_path.exists():
                target_suite_path.unlink()
            tmp_suite_path.replace(target_suite_path)
        except PermissionError:
            if args.stage_only:
                raise
            staged_db = DATA_DIR / "prompt_engine_v1.sqlite.next"
            staged_suite = DATA_DIR / "suite_google_flow.json.next"
            if staged_db.exists():
                staged_db.unlink()
            tmp_db.replace(staged_db)
            if staged_suite.exists():
                staged_suite.unlink()
            tmp_suite_path.replace(staged_suite)
            final_db_path = staged_db
            final_suite_path = staged_suite
            print(
                "[Ingest] Servidor em execução mantém trava em data/prompt_engine_v1.sqlite; "
                "saídas gravadas em .next para promoção automática pelo servidor."
            )

        print(f"[Ingest] Concluído em {time.time()-t0:.1f}s! (stage_only={args.stage_only})")
        print(f"[Ingest] SQLite FTS5: {final_db_path} ({final_db_path.stat().st_size // (1024*1024)} MB)")
        print(f"[Ingest] Suite JSON: {final_suite_path} ({final_suite_path.stat().st_size // 1024} KB)")
        print(f"[Ingest] Featured items: {len(featured_items)} | Clusters: {len(sem_clusters)} | Manchas vazias: {len(void_zones)}")
        print(
            f"[Ingest] Pares -> Mesmo Esqueleto/Assunto Diff: {len(same_skel_diff_subj)} | "
            f"Mesmo Assunto/Esqueleto Diff: {len(same_subj_diff_skel)} | Quase Duplicados: {len(near_dups)}"
        )
    finally:
        if conn_pm is not None:
            conn_pm.close()


if __name__ == "__main__":
    main()
