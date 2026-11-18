"""
Ingestão Completa 100% Read-Only (Escala 22.282 Prompts) -> SQLite FTS5 + Mapa 22k Pontos + Suíte JSON.

Fontes lidas exclusivamente em modo Read-Only:
  1. D:\\Meus Documentos\\Imagens\\Eagle.cool\\Google Flow + Prompts.library
  2. D:\\Meus Documentos\\Imagens\\Eagle.cool\\Gemini Kimi + Antigravity.library
  3. B:\\AntiGravity\\Projeto Alfa\\data\\prompt_dna.sqlite (?mode=ro, 22.282 prompts)
  4. C:\\Users\\conta\\Documents\\antigravity\\fearless-euclid\\data\\posematch_eagle.sqlite (?mode=ro)
  5. C:\\Users\\conta\\Documents\\antigravity\\calm-brahmagupta\\.omnimage\\embeddings\\*.bin

Saídas gravadas apenas em b:\\AntiGravity\\Prompt-EngineV1\\data\\:
  - prompt_engine_v1.sqlite (22.282 prompts + tabela virtual prompts_fts FTS5 + vetores semânticos 24d)
  - suite_google_flow.json (metadados globais, 12 clusters, 8 manchas vazias, pares, matrizes 2D, gaps, projetos)
"""

from __future__ import annotations

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
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

import numpy as np

PROJECT_ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = PROJECT_ROOT / "data"
OUTPUT_SUITE_JSON = DATA_DIR / "suite_google_flow.json"
OUTPUT_DB = DATA_DIR / "prompt_engine_v1.sqlite"

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
GEMINI_KIMI_IMAGES = Path(r"D:\Meus Documentos\Imagens\Eagle.cool\Gemini Kimi + Antigravity.library\images")

if str(ALFA_ROOT) not in sys.path:
    sys.path.insert(0, str(ALFA_ROOT))

from backend.domain_rules import check_physical_and_empirical_coherence  # type: ignore
from backend.ontology import AXIS_RARITY_PRIORITY  # type: ignore

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
}

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


def main() -> None:
    t0 = time.time()
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    if not ALFA_DB.exists():
        raise FileNotFoundError(f"Banco Alfa não encontrado: {ALFA_DB}")

    print("[Ingest 22k] Carregando embeddings EmbeddingGemma-2 & CLIP (RO)...")
    gemma_id_to_idx, gemma_mat = load_nonzero_embeddings(GEMMA2_BIN)
    clip_id_to_idx, clip_mat = load_nonzero_embeddings(CLIP_BIN)

    conn_alfa = open_ro(ALFA_DB)
    conn_pm = open_ro(POSEMATCH_DB) if POSEMATCH_DB.exists() else None

    try:
        cur = conn_alfa.cursor()

        pm_tags_by_id: Dict[str, List[str]] = {}
        if conn_pm is not None:
            for r in conn_pm.execute("SELECT item_id, tag FROM item_tags").fetchall():
                pm_tags_by_id.setdefault(r["item_id"], []).append(r["tag"])

        rows = cur.execute(
            """
            SELECT item_id, source_lib, title, folder, dialect, raw_prompt, clean_positive,
                   ast_json, axis_tags_json, extras_json, pose_type, yaw, pitch, roll, badge,
                   star, eagle_tags_count, face_confidence
            FROM prompts
            WHERE source_lib IN ('google_flow', 'gemini_kimi')
            """
        ).fetchall()

        n_total = len(rows)
        gf_total = sum(1 for r in rows if r["source_lib"] == "google_flow")
        gk_total = sum(1 for r in rows if r["source_lib"] == "gemini_kimi")
        print(f"[Ingest 22k] Lidos {n_total} prompts (Google Flow={gf_total}, Gemini Kimi={gk_total}) em {time.time()-t0:.1f}s")

        # 1. Primeira passagem: estatísticas globais, matrizes 2D/3D (sobre Google Flow 19.227) & skeleton counts
        axis_counts_global: Dict[str, Counter] = {ax: Counter() for ax in AXIS_RARITY_PRIORITY}
        prim_counts_gf: Dict[str, Counter] = {ax: Counter() for ax in AXIS_RARITY_PRIORITY}
        prim_cooc_gf: Counter = Counter()
        tri_cooc_gf: Counter = Counter()

        proj_totals: Counter = Counter()
        proj_subfolders: Dict[str, Counter] = {}
        proj_formats: Dict[str, Counter] = {}
        proj_prim_counts: Dict[str, Dict[str, Counter]] = {}
        proj_prim_cooc: Dict[str, Counter] = {}
        skeleton_counts: Counter = Counter()

        parsed_rows: List[Tuple[Any, str, str, str, List[str], Dict[str, Any], Dict[str, List[str]], Dict[str, Any], Dict[str, str], str]] = []

        for r in rows:
            src = r["source_lib"]
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

            if src == "google_flow" and "environment" in prim and "lighting" in prim and "angle" in prim:
                tri_cooc_gf[(prim["environment"], prim["lighting"], prim["angle"])] += 1

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

            item_obj = {
                "id": iid,
                "sourceLib": src,
                "title": str(r["title"] or iid),
                "project": proj,
                "folders": [r["folder"]] if r["folder"] and r["folder"] != "Sem Pasta" else [],
                "eagleTags": pm_tags[:12],
                "star": star_val,
                "btime": 0,
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
            "Iberica character",
            "Character Infusion",
            "Iberica",
            "Imagen 4",
            "Eccomerce style",
            "Lua's Collection",
            "Testes de Fotos",
        ]
        for proj_n in target_gf_projects + ["Gemini Kimi + Antigravity"]:
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

        # Matrizes 2D e Gaps sobre os 19.227 prompts de Google Flow
        item_by_id = {it["id"]: it for it in all_items}

        def find_donor(axis: str, tag: str) -> Optional[str]:
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
                cands = [it for it in all_items[:3000] if tag in it["attributes"][attr_key]["tags"]]
            if not cands:
                return None
            cands.sort(key=lambda x: x["maturity"]["score"], reverse=True)
            return cands[0]["id"]

        matrices: List[Dict[str, Any]] = []
        project_gaps: List[Dict[str, Any]] = []
        global_triad_gaps: List[Dict[str, Any]] = []
        global_underexplored: List[Dict[str, Any]] = []

        scopes_to_build = ["all"] + target_gf_projects + ["Gemini Kimi + Antigravity"]
        for scope in scopes_to_build:
            total_s = gf_total if scope == "all" else proj_totals[scope]
            cnt_map = prim_counts_gf if scope == "all" else proj_prim_counts[scope]
            cooc_src = prim_cooc_gf if scope == "all" else proj_prim_cooc[scope]

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
                                    "rationale": f"Dentro de '{scope}' (N={total_s}), '{human_tag(ta)}' ({fa}x) e '{human_tag(tb)}' ({fb}x) nunca se cruzaram (O=0, E={exp}).",
                                }
                            )
                        elif scope == "all" and coherent and fa >= 80 and fb >= 80 and exp >= 10.0 and lift < 0.36:
                            global_underexplored.append(
                                {
                                    "id": f"g2d:{ca}:{ta}:{cb}:{tb}",
                                    "kind": "global_2d_low_lift",
                                    "scope": "Google Flow (19.227)",
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

        # Tríades globais O=0
        for e_tag in AXIS_RARITY_PRIORITY["environment"]:
            fe = prim_counts_gf["environment"][e_tag]
            if fe < 120:
                continue
            for l_tag in AXIS_RARITY_PRIORITY["lighting"]:
                fl = prim_counts_gf["lighting"][l_tag]
                if fl < 120:
                    continue
                for a_tag in AXIS_RARITY_PRIORITY["angle"]:
                    fa = prim_counts_gf["angle"][a_tag]
                    if fa < 120:
                        continue
                    obs = tri_cooc_gf[(e_tag, l_tag, a_tag)]
                    if obs != 0:
                        continue
                    exp = round((fe * fl * fa) / (max(1, gf_total) ** 2), 2)
                    if exp < 4.0:
                        continue
                    dummy_blocks = {
                        "environment_props": {"text": e_tag},
                        "lighting_physics": {"text": l_tag},
                        "camera_framing_occlusion": {"text": a_tag},
                        "wardrobe_materials": {"text": ""},
                        "body_mechanics_pose": {"text": ""},
                    }
                    coherent, _ = check_physical_and_empirical_coherence(
                        dummy_blocks, conn=None, axis_tags={"environment": [e_tag], "lighting": [l_tag], "angle": [a_tag]}
                    )
                    if coherent:
                        global_triad_gaps.append(
                            {
                                "id": f"g3d:{e_tag}:{l_tag}:{a_tag}",
                                "kind": "global_3d_zero",
                                "scope": "Google Flow (19.227)",
                                "axisA": "environment",
                                "tagA": e_tag,
                                "freqA": fe,
                                "axisB": "lighting",
                                "tagB": l_tag,
                                "freqB": fl,
                                "axisC": "angle",
                                "tagC": a_tag,
                                "freqC": fa,
                                "observedCount": 0,
                                "expectedCount": exp,
                                "lift": 0.0,
                                "isCoherent": True,
                                "donorAId": find_donor("environment", e_tag),
                                "donorBId": find_donor("lighting", l_tag),
                                "title": f"{human_tag(e_tag)} × {human_tag(l_tag)} × {human_tag(a_tag)}",
                                "rationale": f"Zero ocorrências (O=0) nos 19.227 prompts de Google Flow, apesar de esperado estatístico E={exp}.",
                            }
                        )

        project_gaps.sort(key=lambda g: g["expectedCount"], reverse=True)
        global_triad_gaps.sort(key=lambda g: g["expectedCount"], reverse=True)
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

        gap_pool_voids = global_triad_gaps[:12] + project_gaps[:12]
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
        c1 = [p for p in pair_scores if p[3] >= 0.78 and p[2] <= 0.44]
        c1.sort(key=lambda p: (p[3] - p[2]), reverse=True)
        seen1 = set()
        for i, j, sem_s, str_s, div_s in c1:
            if len(same_skel_diff_subj) >= 30:
                break
            if feat_pool[i]["id"] in seen1 and feat_pool[j]["id"] in seen1:
                continue
            seen1.update([feat_pool[i]["id"], feat_pool[j]["id"]])
            same_skel_diff_subj.append(
                mk_pair(
                    i, j, sem_s, str_s, div_s, "same_skeleton_diff_subject",
                    f"Mesmo molde estrutural ({feat_pool[i]['attributes']['estrutura']['kernelDialect']}, {int(str_s*100)}%) aplicado a cenas distintas ({int(sem_s*100)}% semântica).",
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

        # 7. Sumário de Projetos (7 de Google Flow + Gemini Kimi)
        projects_data: List[Dict[str, Any]] = []
        for proj_name in target_gf_projects + ["Gemini Kimi + Antigravity"]:
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
        for g in project_gaps[:80] + global_triad_gaps[:60] + global_underexplored[:50]:
            if g.get("donorAId"):
                featured_ids.add(g["donorAId"])
            if g.get("donorBId"):
                featured_ids.add(g["donorBId"])
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
                        "name": "Gemini Kimi + Antigravity.library",
                        "path": str(GEMINI_KIMI_IMAGES.parent),
                        "count": gk_total,
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
                        "count": 15086 if POSEMATCH_DB.exists() else 0,
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
                "globalTriadGaps": global_triad_gaps[:60],
                "globalUnderexplored": global_underexplored[:50],
            },
            "projectsData": projects_data,
        }

        OUTPUT_SUITE_JSON.write_text(json.dumps(suite_payload, ensure_ascii=False), encoding="utf-8")

        # 8. Grava todos os 22.282 prompts no SQLite com FTS5 e blobs de vetores 24d
        tmp_db = OUTPUT_DB.with_suffix(".sqlite.tmp")
        if tmp_db.exists():
            tmp_db.unlink()
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
                ) + " " + " ".join(it["eagleTags"])

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
        finally:
            out_conn.close()

        if OUTPUT_DB.exists():
            OUTPUT_DB.unlink()
        tmp_db.replace(OUTPUT_DB)

        print(f"[Ingest 22k] Concluído em {time.time()-t0:.1f}s!")
        print(f"[Ingest 22k] SQLite FTS5: {OUTPUT_DB} ({OUTPUT_DB.stat().st_size // (1024*1024)} MB)")
        print(f"[Ingest 22k] Suite JSON: {OUTPUT_SUITE_JSON} ({OUTPUT_SUITE_JSON.stat().st_size // 1024} KB)")
        print(f"[Ingest 22k] Featured items: {len(featured_items)} | Clusters: {len(sem_clusters)} | Manchas vazias: {len(void_zones)}")
        print(
            f"[Ingest 22k] Pares -> Mesmo Esqueleto/Assunto Diff: {len(same_skel_diff_subj)} | "
            f"Mesmo Assunto/Esqueleto Diff: {len(same_subj_diff_skel)} | Quase Duplicados: {len(near_dups)}"
        )
    finally:
        conn_alfa.close()
        if conn_pm is not None:
            conn_pm.close()


if __name__ == "__main__":
    main()
