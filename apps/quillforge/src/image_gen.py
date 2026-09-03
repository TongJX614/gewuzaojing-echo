# -*- coding: utf-8 -*-
"""
通用生图模块（OpenAI 兼容协议）

设计目标：
- 兼容任意 OpenAI 图像接口的服务：硅基流动（FLUX.1-schnell / Kolors）、智谱 CogView、
  OpenAI gpt-image-1 / DALL-E 3 等，只需在 .env 配置 IMAGE_API_KEY / IMAGE_BASE_URL / IMAGE_MODEL。
- 磁盘缓存：同一 (model + size + prompt) 只生成一次，重玩/重开同一剧本不重复花钱。
- 未配置 IMAGE_API_KEY 时自动禁用，调用方回退到占位图，游戏照常可玩。
"""
from __future__ import annotations

import re
import time
import base64
import hashlib
import threading
import urllib.request
from pathlib import Path

import logging
logger = logging.getLogger(__name__)

from config_manager import QuillForgeSettings, get_settings
from runtime_paths import ensure_runtime_paths, resolve_runtime_paths


_RUNTIME_PATHS = ensure_runtime_paths(resolve_runtime_paths())


# 生成图片的磁盘缓存目录
IMAGES_DIR = _RUNTIME_PATHS.generated_images

# 模块级值供现有路由导入；依赖装配会在路由加载前用同一个 Settings 配置它们。
_REMOVE_BG_ENABLED = True

# 默认尺寸（可被 .env 覆盖）：背景横屏 16:9、立绘竖屏
# 1344x768 / 768x1344 同时被硅基流动 FLUX/Kolors 与智谱 CogView 支持
DEFAULT_BG_SIZE = "1344x768"
DEFAULT_CHAR_SIZE = "768x1344"

# 风格后缀：中文描述 + 英文标签，兼顾国产模型（Kolors/CogView 中文强）与 FLUX（英文强）
STYLE_SUFFIX_CHAR = (
    "，日系动漫风格，视觉小说角色立绘，精致细节，电影级光影，"
    "上半身像，居中构图，纯绿色背景，绿幕，无文字，无水印, "
    "anime style, visual novel character sprite, upper body, bust shot, centered, solid green background, green screen, high quality, detailed"
)
# 非人类角色（动物/妖怪/机器人等）：改用全身像构图，避免“上半身像”把动物画成人形
STYLE_SUFFIX_CHAR_NONHUMAN = (
    "，日系动漫风格，视觉小说角色立绘，精致细节，电影级光影，"
    "全身像，居中构图，纯绿色背景，绿幕，无文字，无水印, "
    "anime style, visual novel character sprite, full body, centered, solid green background, green screen, high quality, detailed"
)

# species 字段判定为人类的取值（小写比较）
_HUMAN_SPECIES_VALUES = {"", "human", "人类", "人", "male", "female"}
STYLE_SUFFIX_BG = (
    "，日系动漫风格，视觉小说场景背景，精致细节，电影级光影，"
    "宽银幕构图，无人物，无文字，无水印, "
    "anime style, visual novel background art, scenic, wide shot, no people, high quality, detailed"
)


# ── 全局图片生成请求交错 ──
# 避免多线程同时发出请求触发 API IPM 限制，每个请求自动顺延 _IMG_STAGGER_SEC 秒
_IMG_STAGGER_SEC = 1.5
_img_stagger_lock = threading.Lock()
_img_next_slot = 0.0


def configure_image_settings(settings: QuillForgeSettings) -> None:
    """Configure legacy module constants from the process settings object."""
    global _REMOVE_BG_ENABLED, DEFAULT_BG_SIZE, DEFAULT_CHAR_SIZE, _IMG_STAGGER_SEC
    _REMOVE_BG_ENABLED = settings.image_remove_bg.strip().lower() not in (
        "false", "0", "off", "no",
    )
    DEFAULT_BG_SIZE = settings.image_size_bg.strip() or "1344x768"
    DEFAULT_CHAR_SIZE = settings.image_size_char.strip() or "768x1344"
    _IMG_STAGGER_SEC = settings.image_stagger_sec


def _img_stagger():
    """让并发请求依次错开，避免同时到达 API 触发 IPM 限频。"""
    global _img_next_slot
    with _img_stagger_lock:
        now = time.monotonic()
        wait = _img_next_slot - now
        if wait > 0:
            time.sleep(wait)
            _img_next_slot = time.monotonic() + _IMG_STAGGER_SEC
        else:
            _img_next_slot = now + _IMG_STAGGER_SEC


def slugify(title: str) -> str:
    """把剧本标题转成安全的目录名（保留中文/字母数字，其余替换为下划线）"""
    s = re.sub(r"[^\w\u4e00-\u9fff]+", "_", str(title or "")).strip("_")
    return s or "script"


def build_character_prompt(char: dict) -> str:
    """从角色数据构建生图提示词（name + age + occupation + personality + appearance）。

    若角色带 species 字段且为非人类形态（动物/妖怪/机器人等），
    提示词会明确要求按该形态绘制并使用全身像构图，避免画成人形。
    """
    name = str(char.get("name", "")).strip()
    appearance = str(char.get("appearance", "")).strip() or "（无外貌描述，按角色气质自由发挥）"
    personality = str(char.get("personality", "")).strip()
    age = str(char.get("age", "")).strip()
    age_str = (f"{age}岁" if age.isdigit() else age) if age else ""
    identity = str(char.get("occupation", "")).strip() or str(char.get("role", "")).strip()
    species = str(char.get("species", "")).strip()
    is_human = species.lower() in _HUMAN_SPECIES_VALUES
    parts = [f"角色：{name}"] + ([age_str] if age_str and is_human else []) + ([identity] if identity else [])
    head = "，".join(parts)
    personality_str = f"。性格：{personality}" if personality else ""
    if is_human:
        return f"{head}{personality_str}。外貌：{appearance}{STYLE_SUFFIX_CHAR}"
    # 非人类形态：强调物种本体，禁止拟人化身体
    species_note = (
        f"。【重要】该角色的形态是{species}，必须按{species}的真实形态绘制"
        f"（完整的动物/生物身体结构，四足着地或符合其物种的姿态），"
        f"严禁画成人类身体、人形或拟人化站立"
    )
    return f"{head}{personality_str}{species_note}。外貌：{appearance}{STYLE_SUFFIX_CHAR_NONHUMAN}"


def build_background_prompt(scene: dict) -> str:
    """从场景数据构建生图提示词（场景名/地点/氛围/画面）。
    兼容两种数据源：素材清单场景素材（mood/details）与游戏场景（atmosphere/description）。"""
    name = str(scene.get("name", "")).strip()
    location = str(scene.get("location", "")).strip()
    mood = str(scene.get("mood", "") or scene.get("atmosphere", "")).strip()
    details = str(scene.get("details", "") or scene.get("description", "")).strip()
    if len(details) > 200:
        details = details[:200] + "…"
    parts = [
        f"场景：{name}" if name else "",
        f"地点：{location}" if location else "",
        f"氛围：{mood}" if mood else "",
        f"画面：{details}" if details else "",
    ]
    head = "，".join(p for p in parts if p)
    return f"{head}{STYLE_SUFFIX_BG}"


def _chroma_key(img):
    """色度键：将 rembg 误判为前景的纯绿色不透明像素直接设为透明。
    判定条件：G 通道占主导（G > R+40 且 G > B+40 且 G > 80），且当前 alpha > 200。
    对边缘过渡区域（alpha 100~200）做渐变透明处理。"""
    import numpy as np
    data = np.array(img).astype(np.float32)
    r, g, b, a = data[:,:,0], data[:,:,1], data[:,:,2], data[:,:,3]

    # 纯绿色判定：G 显著高于 R 和 B
    is_green = (g > r + 40) & (g > b + 40) & (g > 80)

    # 不透明绿色像素 → 完全透明
    opaque_green = is_green & (a > 200)
    data[:,:,3][opaque_green] = 0

    # 半透明绿色像素（边缘过渡）→ 按绿色纯度降低 alpha
    semi_green = is_green & (a > 50) & (a <= 200)
    if semi_green.any():
        # 绿色越纯，alpha 降得越多
        greenness = (g[semi_green] - np.maximum(r[semi_green], b[semi_green])) / 255.0
        data[:,:,3][semi_green] = a[semi_green] * (1.0 - greenness.clip(0, 1))

    from PIL import Image as _Img
    return _Img.fromarray(data.clip(0, 255).astype(np.uint8), "RGBA")


def _green_despill(img):
    """绿幕溢出消除：对所有可见像素，压制 G 通道相对 R/B 的溢出。
    分两档处理：强溢出（G > max(R,B)+15）直接压制；弱溢出（G > max(R,B)+8）按比例衰减。"""
    import numpy as np
    data = np.array(img).astype(np.float32)
    r, g, b, a = data[:,:,0], data[:,:,1], data[:,:,2], data[:,:,3]
    visible = a > 0
    max_rb = np.maximum(r, b)
    diff = g - max_rb  # G 相对 R/B 的溢出量

    # 强溢出：G 比 max(R,B) 高 15 以上 → 直接压制到 max(R,B)
    strong = visible & (diff > 15)
    if strong.any():
        data[:,:,1][strong] = max_rb[strong]

    # 弱溢出：G 比 max(R,B) 高 8~15 → 按比例衰减（越接近15压制越多）
    weak = visible & (diff > 8) & (diff <= 15)
    if weak.any():
        ratio = (diff[weak] - 8) / 7.0  # 0~1
        data[:,:,1][weak] = g[weak] - diff[weak] * ratio

    from PIL import Image as _Img
    return _Img.fromarray(data.clip(0, 255).astype(np.uint8), "RGBA")


def _defringe(img):
    """去除半透明边缘像素的背景色残留：对 alpha<250 的像素，将 RGB 向主体颜色靠拢"""
    import numpy as np
    data = np.array(img).astype(np.float32)
    alpha = data[:, :, 3]
    # 半透明区域（0 < alpha < 250）
    semi = (alpha > 0) & (alpha < 250)
    if not semi.any():
        return img
    # 不透明区域的中位色作为参考
    opaque = alpha >= 250
    if opaque.any():
        ref_r = np.median(data[:, :, 0][opaque])
        ref_g = np.median(data[:, :, 1][opaque])
        ref_b = np.median(data[:, :, 2][opaque])
    else:
        ref_r, ref_g, ref_b = 128, 128, 128
    # 对半透明像素：按透明度混合向参考色靠拢（越透明越靠近参考色）
    blend = 1.0 - (alpha[semi] / 250.0)
    data[:, :, 0][semi] = data[:, :, 0][semi] * (1 - blend) + ref_r * blend
    data[:, :, 1][semi] = data[:, :, 1][semi] * (1 - blend) + ref_g * blend
    data[:, :, 2][semi] = data[:, :, 2][semi] * (1 - blend) + ref_b * blend
    from PIL import Image as _Img
    return _Img.fromarray(data.clip(0, 255).astype(np.uint8), "RGBA")


# rembg session 单例（避免每次调用都重新初始化/下载模型，并发安全）
_rembg_session = None
_rembg_session_lock = threading.Lock()
# 推理锁：Numba workqueue 层不支持多线程并发调用，必须串行化 rembg 推理
_rembg_infer_lock = threading.Lock()

def _get_rembg_session():
    """lazy 初始化 rembg session（线程安全单例）"""
    global _rembg_session
    if _rembg_session is not None:
        return _rembg_session
    with _rembg_session_lock:
        if _rembg_session is None:
            from rembg import new_session
            print("[image_gen] 初始化 rembg session (isnet-anime)...", flush=True)
            _rembg_session = new_session("isnet-anime")
            print("[image_gen] rembg session 就绪", flush=True)
    return _rembg_session


def remove_background(image_path: Path) -> bool:
    """使用 rembg 去除图片背景（AI 抠图），将结果覆盖写回原文件（PNG 透明通道）。
    使用 isnet-anime 模型 + alpha_matting + green_despill + defringe。
    成功返回 True，失败返回 False（保留原图不破坏）。"""
    try:
        from rembg import remove
        from PIL import Image

        session = _get_rembg_session()
        img = Image.open(image_path)
        with _rembg_infer_lock:  # 串行化推理，防止 Numba 并发崩溃
            result = remove(
                img,
                session=session,
                post_process_mask=True,
                alpha_matting=True,
                alpha_matting_foreground_threshold=240,
                alpha_matting_background_threshold=10,
                alpha_matting_erode_size=15,
            )
        result = result.convert("RGBA")
        # 1) 色度键：将误判为前景的纯绿色像素直接透明化
        result = _chroma_key(result)
        # 2) 绿幕溢出消除：压制残留绿色
        result = _green_despill(result)
        # 3) 边缘 defringe：半透明像素向主体色靠拢
        result = _defringe(result)
        result.save(image_path, format="PNG")
        return True
    except Exception as e:
        print(f"[image_gen] rembg 去背景失败: {type(e).__name__}: {e}", flush=True)
        return False


class ImageGenerator:
    """OpenAI 兼容的生图客户端（带磁盘缓存与无 key 回退）"""

    def __init__(self, settings: QuillForgeSettings | None = None):
        self._settings = settings or get_settings()
        configure_image_settings(self._settings)
        self.default_bg_size = DEFAULT_BG_SIZE
        self.default_char_size = DEFAULT_CHAR_SIZE
        self.api_key = self._settings.image_api_key.strip()
        base_url = self._settings.image_base_url.strip()
        self.base_url = base_url or None
        self.model = self._settings.image_model.strip()
        # 可选：画质（hd/standard，空则用模型默认）
        self.quality = self._settings.image_quality.strip()
        # 可选：水印开关（仅部分服务商支持，如智谱需先签免责声明才能关）；空则不传、用服务商默认
        wm = self._settings.image_watermark.strip().lower()
        self.watermark_enabled = None
        if wm in ("false", "0", "off", "no"):
            self.watermark_enabled = False
        elif wm in ("true", "1", "on", "yes"):
            self.watermark_enabled = True
        self.client = None
        if self.api_key:
            try:
                from openai import OpenAI
                # 超时 120s：防止 API 无响应时永久挂起（默认 600s 太长会导致加载界面卡死）
                self.client = OpenAI(api_key=self.api_key, base_url=self.base_url, timeout=120.0)
            except Exception as e:  # pragma: no cover
                print(f"[image_gen] 初始化生图客户端失败: {e}")
                self.client = None

    @property
    def enabled(self) -> bool:
        return self.client is not None

    def _cache_path(self, script_slug: str, kind: str, asset_id: str, prompt: str, size: str) -> Path:
        """缓存文件名含 (model|size|prompt) 的哈希：提示词/模型变化时自动重新生成"""
        h = hashlib.md5(f"{self.model}|{size}|{prompt}".encode("utf-8")).hexdigest()[:8]
        safe_id = re.sub(r"[^\w\u4e00-\u9fff]+", "_", str(asset_id or "x")).strip("_") or "x"
        d = IMAGES_DIR / script_slug
        d.mkdir(parents=True, exist_ok=True)
        return d / f"{kind}_{safe_id}_{h}.png"

    def _find_external_asset(self, script_slug: str, kind: str, asset_id: str) -> Path | None:
        """在缓存目录中查找外部提供的素材文件（非标准哈希命名）。
        匹配规则：文件名包含 asset_id 的 .png 文件（排除标准缓存格式）。
        用于支持用户手动替换/补充的图片素材。"""
        d = IMAGES_DIR / script_slug
        if not d.is_dir():
            return None
        safe_id = re.sub(r"[^\w\u4e00-\u9fff]+", "_", str(asset_id or "x")).strip("_") or "x"
        safe_id_norm = safe_id.replace("_", "").lower()  # 去下划线版本，用于模糊匹配
        # 短 id（如纯数字 "1"/"2"）要求词边界，避免子串误匹配（char_1 命中 char/2）
        short_id = len(safe_id_norm) <= 2
        id_boundary_re = re.compile(rf"(?<![\w]){re.escape(safe_id)}(?![\w])", re.IGNORECASE)
        # 标准缓存格式: {kind}_{safe_id}_{8位hex}.png — 排除这些
        cache_pattern = re.compile(rf"^{re.escape(kind)}_{re.escape(safe_id)}_[0-9a-f]{{8}}\.png$")
        strict: list[Path] = []  # kind 前缀 + id 双匹配
        loose: list[Path] = []   # 仅 id 匹配（兼容非常规命名的旧素材）
        for f in d.iterdir():
            if not f.is_file() or f.suffix.lower() != ".png":
                continue
            if cache_pattern.match(f.name):
                continue  # 跳过标准缓存文件
            # 匹配：文件名中包含 asset_id（如 "scene_01" 或 "einstein"）
            # 同时支持去下划线模糊匹配（de_broglie → debroglie）
            stem_norm = f.stem.replace("_", "").lower()
            id_hit = (
                (id_boundary_re.search(f.stem) is not None) if short_id
                else (safe_id in f.stem or safe_id_norm in stem_norm)
            )
            if not id_hit:
                continue
            if f.stem.startswith(f"{kind}_"):
                strict.append(f)  # 防止背景图被误当立绘（或反之）
            else:
                loose.append(f)
        candidates = strict or loose
        if not candidates:
            return None
        # 多个候选时按文件名排序取第一个（确定性）
        candidates.sort(key=lambda p: p.name)
        return candidates[0]

    def generate(self, script_slug: str, kind: str, asset_id: str, prompt: str, size: str) -> str | None:
        """
        生成图片并缓存到磁盘。
        返回可访问的 URL 路径（/generated_images/<slug>/<file>.png）；未启用或失败返回 None。
        """
        path = self._cache_path(script_slug, kind, asset_id, prompt, size)
        rel_url = f"/generated_images/{script_slug}/{path.name}"

        # 命中缓存：直接复用，不重复调用 API
        if path.exists() and path.stat().st_size > 0:
            # 角色立绘额外检查：若应有透明通道但实际没有（上次 rembg 失败），补跑一次
            if kind == "char" and _REMOVE_BG_ENABLED:
                try:
                    from PIL import Image as _PILImg
                    _img = _PILImg.open(path)
                    _has_alpha = (_img.mode == "RGBA"
                                  and _img.getchannel("A").getextrema()[0] < 250)
                    if not _has_alpha:
                        print(f"[image_gen] 缓存命中但无透明通道，补跑 rembg: {path.name}", flush=True)
                        remove_background(path)
                except Exception as e:
                    logger.warning("[image_gen] 缓存透明通道检查失败 (%s): %s", path.name, e)
            return rel_url

        # 标准缓存未命中 → 尝试查找外部提供的素材（用户手动替换的图片）
        ext_path = self._find_external_asset(script_slug, kind, asset_id)
        if ext_path and ext_path.stat().st_size > 0:
            ext_url = f"/generated_images/{script_slug}/{ext_path.name}"
            print(f"[image_gen] 使用外部素材: {ext_path.name} (for {kind}/{asset_id})", flush=True)
            return ext_url

        if not self.enabled:
            return None

        # 交错延迟：避免多线程同时请求触发 API IPM 限制
        _img_stagger()

        kwargs = dict(model=self.model, prompt=prompt, size=size, n=1)
        if self.quality:
            kwargs["quality"] = self.quality
        extra_body = {}
        if self.watermark_enabled is not None:
            extra_body["watermark_enabled"] = self.watermark_enabled
        if extra_body:
            kwargs["extra_body"] = extra_body

        # 可重试异常：连接故障 + 速率限制（429 IPM）
        try:
            from openai import APIConnectionError, APITimeoutError, RateLimitError
            retryable = (APIConnectionError, APITimeoutError)
        except Exception:  # pragma: no cover
            RateLimitError = None
            retryable = ()
        max_attempts = 4
        last_err = None
        for attempt in range(1, max_attempts + 1):
            try:
                resp = self.client.images.generate(**kwargs)
                item = resp.data[0]
                b64 = getattr(item, "b64_json", None)
                url = getattr(item, "url", None)
                if b64:
                    path.write_bytes(base64.b64decode(b64))
                elif url:
                    # 使用 urlopen + timeout 替代 urlretrieve（后者无超时参数，可能永久挂起）
                    with urllib.request.urlopen(url, timeout=90) as resp_dl:
                        path.write_bytes(resp_dl.read())
                else:
                    print(f"[image_gen] {kind}/{asset_id}: 响应中既无 b64_json 也无 url", flush=True)
                    return None

                # 角色立绘：AI 去背景（白底 → 透明）
                if kind == "char" and _REMOVE_BG_ENABLED:
                    print(f"[image_gen] 正在为 {asset_id} 去除背景...", flush=True)
                    if remove_background(path):
                        print(f"[image_gen] {asset_id} 背景去除完成", flush=True)

                return rel_url
            except retryable as e:
                last_err = e
                if attempt < max_attempts:
                    wait = attempt * 3
                    print(f"[image_gen] {kind}/{asset_id} 连接异常，{wait}s 后重试({attempt}/{max_attempts}): {e}", flush=True)
                    time.sleep(wait)
                    continue
            except Exception as e:
                # 429 速率限制：指数退避重试
                if RateLimitError and isinstance(e, RateLimitError) and attempt < max_attempts:
                    last_err = e
                    wait = attempt * 15  # 15s, 30s, 45s
                    print(f"[image_gen] {kind}/{asset_id} 触发速率限制，{wait}s 后重试({attempt}/{max_attempts})", flush=True)
                    time.sleep(wait)
                    continue
                last_err = e
                break

        msg = f"[image_gen] 生成失败 {kind}/{asset_id}: {type(last_err).__name__}: {last_err}"
        print(msg, flush=True)
        try:
            with open(IMAGES_DIR / "error.log", "a", encoding="utf-8") as f:
                f.write(msg + "\n")
        except Exception as e:
            logger.warning("[image_gen] error.log 写入失败: %s", e)
        return None
