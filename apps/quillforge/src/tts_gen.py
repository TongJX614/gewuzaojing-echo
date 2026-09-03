# -*- coding: utf-8 -*-
"""
MiMo TTS 语音合成模块（OpenAI 兼容 chat.completions + audio 参数 + 磁盘缓存）

基于小米 MiMo-V2.5-TTS 系列模型，通过 tokendance.space 网关调用。
支持两种模式：
  1. 音色克隆（mimo-v2.5-tts-voiceclone）：传入参考音频样本，复刻任意音色。
  2. 预置音色（mimo-v2.5-tts）：使用内置精品音色（冰糖/茉莉/苏打/白桦等）。
  当角色有参考音频时自动用克隆模式，否则回退到预置音色。

设计目标（和 image_gen.py 保持一致）：
- 磁盘缓存：同一 (speaker + text) 只合成一次，重玩/重开同一剧本不重复花钱。
- 未配置 TTS_API_KEY 时自动禁用，调用方回退到纯文字模式，游戏照常可玩。
- 角色音色映射：优先使用角色卡中的 voiceSample/voiceId 字段，其次用 TTS_VOICE_MAP
  环境变量，再按 gender 推断预置音色，最后回退到 TTS_DEFAULT_VOICE。
"""
from __future__ import annotations

import logging
import re
import time
import base64
import hashlib
from pathlib import Path
from typing import Optional

logger = logging.getLogger(__name__)

from config_manager import QuillForgeSettings, get_settings
from runtime_paths import ensure_runtime_paths, resolve_runtime_paths


_PROJECT_ROOT = Path(__file__).resolve().parent.parent  # quillforge
_RUNTIME_PATHS = ensure_runtime_paths(resolve_runtime_paths())


# 生成音频的磁盘缓存目录
AUDIO_DIR = _RUNTIME_PATHS.generated_audio

# 参考音频样本目录（用于音色克隆）
VOICE_SAMPLES_DIR = _PROJECT_ROOT / "voice_samples"

# MiMo 预置音色集合（非文件路径的 voiceId 视为预置音色名）
_PRESET_VOICES = {
    "mimo_default", "冰糖", "茉莉", "苏打", "白桦",
    "Mia", "Chloe", "Milo", "Dean",
}


def _fix_voice_encoding(voice_id: str) -> str:
    """修复 Windows 上 python-dotenv 把 UTF-8 中文音色名当作 GBK 解码导致的乱码。
    如 '苏打' 的 UTF-8 字节被当作 GBK 解码后变成 3 字符乱码 '鑻忔墦'，
    通过反向操作（GBK 编码→UTF-8 解码）还原正确音色名。
    """
    if not voice_id or voice_id in _PRESET_VOICES:
        return voice_id
    try:
        fixed = voice_id.encode("gbk").decode("utf-8")
        if fixed in _PRESET_VOICES:
            return fixed
    except (UnicodeDecodeError, UnicodeEncodeError) as e:
        logger.debug("[tts_gen] 音色编码修复失败 '%s': %s", voice_id, e)
    return voice_id


class TTSGenerator:
    """MiMo TTS 客户端（带磁盘缓存与无 key 回退）"""

    def __init__(self, settings: QuillForgeSettings | None = None):
        self._settings = settings or get_settings()
        _s = self._settings
        self.api_key = _s.tts_api_key.strip()
        base_url = _s.tts_base_url.strip()
        self.base_url = base_url or None
        # 主模型（音色克隆）
        self.model = _s.tts_model.strip()
        # 回退模型（预置音色，不需要参考音频）
        self.fallback_model = _s.tts_fallback_model.strip()
        # 默认预置音色
        self.default_voice = _s.tts_default_voice.strip()
        # 默认男声/女声预置音色（角色卡有 gender 字段时自动选择）
        self.default_voice_male = _s.tts_default_voice_male.strip()
        self.default_voice_female = _s.tts_default_voice_female.strip()
        # 按年龄分段的预置音色映射（环境变量可覆盖）
        # 格式: voice1,voice2,...（按年龄段顺序：少年/青年/中年/老年）
        self.voice_male_by_age = self._load_age_voices(
            _s, "tts_voice_male_by_age", "TTS_VOICE_MALE_BY_AGE",
            ["Milo", "苏打", "Dean", "白桦"]
        )
        self.voice_female_by_age = self._load_age_voices(
            _s, "tts_voice_female_by_age", "TTS_VOICE_FEMALE_BY_AGE",
            ["茉莉", "冰糖", "Mia", "Chloe"]
        )
        # 年龄分段阈值
        self.age_thresholds = self._load_age_thresholds(_s)
        # 角色名 -> 音色ID/音频文件路径 映射（环境变量配置）
        self.voice_map = self._load_voice_map(_s)
        # 初始化 OpenAI 客户端
        self.client = None
        if self.api_key:
            try:
                from openai import OpenAI
                self.client = OpenAI(api_key=self.api_key, base_url=self.base_url)
            except Exception as e:
                logger.warning("[tts_gen] 初始化 TTS 客户端失败: %s", e)
                self.client = None
        # 是否启用
        self.enabled = self.client is not None

    @staticmethod
    def _load_voice_map(_s: QuillForgeSettings) -> dict:
        """加载角色->音色映射，格式: TTS_VOICE_MAP=角色名:voice_id,角色名:voice_id"""
        raw = _s.tts_voice_map
        result = {}
        for pair in raw.split(","):
            pair = pair.strip()
            if ":" in pair:
                name, vid = pair.split(":", 1)
                result[name.strip()] = vid.strip()
        return result

    @staticmethod
    def _load_age_voices(
        _s: QuillForgeSettings,
        attr: str,
        _env_key: str,
        default_list: list,
    ) -> list:
        """加载按年龄分段的音色列表，格式: voice1,voice2,voice3,voice4
        顺序: 少年(<=18) / 青年(19-35) / 中年(36-55) / 老年(56+)
        """
        raw = getattr(_s, attr, "")
        if not raw.strip():
            return default_list
        parts = [v.strip() for v in raw.split(",") if v.strip()]
        # 不足4个时用默认值补齐
        while len(parts) < 4:
            parts.append(default_list[len(parts)])
        return parts

    @staticmethod
    def _load_age_thresholds(_s: QuillForgeSettings) -> list:
        """加载年龄分段阈值，格式: 18,35,55
        对应分段: <=18 / 19-35 / 36-55 / 56+
        """
        raw = _s.tts_age_thresholds
        try:
            thresholds = [int(x.strip()) for x in raw.split(",") if x.strip()]
            if len(thresholds) >= 3:
                return thresholds[:3]
        except ValueError as e:
            logger.debug("[tts_gen] 年龄阈值解析失败 '%s': %s", raw, e)
        return [18, 35, 55]

    @staticmethod
    def _normalize_gender(raw: str) -> str:
        """将性别字段归一化为 male/female，兼容中文和常见缩写。"""
        g = str(raw or "").strip().lower()
        if g in ("male", "m", "男", "男性", "男生", "男子"):
            return "male"
        if g in ("female", "f", "女", "女性", "女生", "女子"):
            return "female"
        return ""

    @staticmethod
    def _infer_gender(char: dict) -> str:
        """当 gender 字段缺失时，从角色卡其他字段推断性别。
        推断策略（按可靠性排序）：
          1. role 字段含明确性别词（男主角/反派女 等）
          2. appearance 字段含性别特征词
          3. personality 字段含性别倾向词
          4. occupation 字段含性别倾向词
        返回 'male'/'female'，无法推断返回 ''。
        """
        _MALE_KEYWORDS = (
            "男主", "男主角", "少年", "青年男", "男性",
            "他", "硬汉", "粗犷", "阳刚", "魁梧", "肌肉", "络腮胡", "胡茬",
            "短发", "平头", "寸头", "西装", "衬衫",
            "将军", "士兵", "骑士", "剑士", "猎人", "铁匠",
        )
        _FEMALE_KEYWORDS = (
            "女主", "女主角", "少女", "青年女", "女性",
            "她", "柔美", "纤细", "婀娜", "丰满", "长发", "马尾", "双马尾",
            "裙子", "连衣裙", "短裙", "长裙", "旗袍", "发簪", "发卡",
            "公主", "女王", "女巫", "女仆", "侍女", "宫女", "巫女",
        )
        # 按字段优先级检查
        fields_to_check = ["role", "appearance", "personality", "occupation"]
        for field in fields_to_check:
            text = str(char.get(field, "") or "").strip()
            if not text:
                continue
            male_hits = sum(1 for kw in _MALE_KEYWORDS if kw in text)
            female_hits = sum(1 for kw in _FEMALE_KEYWORDS if kw in text)
            if male_hits > female_hits:
                return "male"
            if female_hits > male_hits:
                return "female"
        return ""

    def _voice_by_age(self, gender: str, age_str: str) -> Optional[str]:
        """根据性别和年龄返回对应的预置音色名。"""
        gender = self._normalize_gender(gender)
        if not age_str:
            return None
        # 尝试提取数字年龄
        age_match = re.search(r"\d+", age_str)
        if not age_match:
            return None
        age = int(age_match.group())
        thresholds = self.age_thresholds  # [18, 35, 55]
        if age <= thresholds[0]:
            idx = 0  # 少年
        elif age <= thresholds[1]:
            idx = 1  # 青年
        elif age <= thresholds[2]:
            idx = 2  # 中年
        else:
            idx = 3  # 老年
        if gender == "male":
            return self.voice_male_by_age[idx]
        elif gender == "female":
            return self.voice_female_by_age[idx]
        return None

    # 常见称谓后缀，匹配时剥离
    _HONORIFICS = ("同学", "老师", "先生", "小姐", "前辈", "学长", "学姐",
                   "师傅", "大人", "殿下", "陛下", "将军", "队长", "医生", "教授")

    @classmethod
    def _strip_honorific(cls, name: str) -> str:
        """剥离名字末尾的称谓后缀，如 '林老师' -> '林'"""
        for h in cls._HONORIFICS:
            if name.endswith(h) and len(name) > len(h):
                return name[:-len(h)]
        return name

    @staticmethod
    def _match_character(speaker: str, characters: list) -> Optional[dict]:
        """根据 speaker 名在角色列表中查找匹配的角色卡。
        匹配策略（按优先级）：
          1. 精确匹配 name
          2. 括号别名匹配：角色名含 "A（B）" 时，speaker 为 A 或 B 均命中
          3. 去称谓匹配：剥离 '老师/同学/先生' 等后缀再比较
          4. 子串包含：speaker 是 name 的子串，或 name 是 speaker 的子串
          5. 姓氏+单字匹配：如 speaker='小林' 匹配 name='林远'
        """
        if not speaker:
            return None
        # 1. 精确匹配
        for c in characters:
            if isinstance(c, dict) and c.get("name") == speaker:
                return c
        # 2. 括号别名拆分匹配（中英文括号）
        for c in characters:
            if not isinstance(c, dict):
                continue
            name = str(c.get("name", ""))
            parts = re.split(r"[（(]", name)
            aliases = [parts[0].strip()]
            for p in parts[1:]:
                aliases.append(re.sub(r"[）)]", "", p).strip())
            if speaker in aliases:
                return c
        # 3. 去称谓匹配
        speaker_stripped = TTSGenerator._strip_honorific(speaker)
        if speaker_stripped != speaker:
            for c in characters:
                if not isinstance(c, dict):
                    continue
                name = str(c.get("name", ""))
                name_stripped = TTSGenerator._strip_honorific(name)
                if speaker_stripped == name_stripped or speaker_stripped == name:
                    return c
        # 4. 子串包含（双向，至少2字符避免误匹配）
        for c in characters:
            if not isinstance(c, dict):
                continue
            name = str(c.get("name", ""))
            if len(name) >= 2 and len(speaker) >= 2:
                if speaker in name or name in speaker:
                    return c
        # 5. 姓氏匹配：speaker 含 "小X/老X/阿X" 且 X 是某角色姓氏
        if len(speaker) >= 2 and speaker[0] in "小老阿":
            surname = speaker[1]
            for c in characters:
                if not isinstance(c, dict):
                    continue
                name = str(c.get("name", ""))
                if name and name[0] == surname:
                    return c
        return None

    def get_voice_id(self, speaker: str, characters: list) -> str:
        """根据角色名获取音色ID或音频文件路径。
        优先级: 角色卡 voiceSample > voiceId > TTS_VOICE_MAP 环境变量 > gender 推断 > 默认
        """
        # 1. 角色卡显式 voiceSample 字段（指向音频文件路径，用于音色克隆）
        char = self._match_character(speaker, characters)
        if char:
            voice_sample = str(char.get("voiceSample", "") or char.get("voice_sample", "")).strip()
            if voice_sample:
                logger.debug("[tts_voice] %s → voiceSample: %s", speaker, voice_sample)
                return voice_sample

        # 2. 角色卡显式 voiceId 字段（预置音色名 或 音频文件路径）
        if char:
            voice_id = str(char.get("voiceId", "") or char.get("voice_id", "")).strip()
            if voice_id:
                logger.debug("[tts_voice] %s → voiceId: %s", speaker, voice_id)
                return voice_id

        # 3. TTS_VOICE_MAP 环境变量
        if speaker in self.voice_map:
            logger.debug("[tts_voice] %s → voice_map: %s", speaker, self.voice_map[speaker])
            return self.voice_map[speaker]

        # 4. 按 gender + age 推断预置音色（gender 缺失时尝试从其他字段推断）
        if char:
            gender = self._normalize_gender(char.get("gender", ""))
            if not gender:
                gender = self._infer_gender(char)
            age = str(char.get("age", "")).strip()
            if gender in ("male", "female"):
                voice = self._voice_by_age(gender, age)
                if voice:
                    logger.debug("[tts_voice] %s → gender=%s age=%s → %s", speaker, gender, age, voice)
                    return voice
                # age 无效时回退到默认男女声
                if gender == "male":
                    logger.debug("[tts_voice] %s → male default: %s", speaker, self.default_voice_male)
                    return self.default_voice_male
                elif gender == "female":
                    logger.debug("[tts_voice] %s → female default: %s", speaker, self.default_voice_female)
                    return self.default_voice_female

        # 5. 默认音色
        logger.info("[tts_voice] %s → fallback default: %s (char_matched=%s, chars_count=%d)",
                    speaker, self.default_voice, char is not None, len(characters))
        return self.default_voice

    def _resolve_voice_sample(self, voice_id: str) -> Optional[Path]:
        """尝试将 voice_id 解析为参考音频文件路径。
        如果 voice_id 不是预置音色名，尝试在 voice_samples/ 目录下查找音频文件。
        """
        if not voice_id or voice_id in _PRESET_VOICES:
            return None

        # 尝试多种路径组合
        candidates = [
            VOICE_SAMPLES_DIR / voice_id,
            _PROJECT_ROOT.parent / "voice_samples" / voice_id,
            VOICE_SAMPLES_DIR / f"{voice_id}.mp3",
            VOICE_SAMPLES_DIR / f"{voice_id}.wav",
            Path(voice_id),  # 绝对路径
        ]
        for c in candidates:
            try:
                if c.exists() and c.is_file() and c.suffix.lower() in (".mp3", ".wav"):
                    return c.resolve()
            except Exception:
                continue
        return None

    def generate(self, script_slug: str, speaker: str, text: str, voice_id: str = "") -> Optional[str]:
        """
        合成语音并返回 data URI（data:audio/wav;base64,...）。
        不写入磁盘缓存（LLM 每次生成内容不同，缓存无复用价值）。
        未启用或失败返回 None。
        """
        if not text.strip():
            return None

        # 如果未显式传入 voice_id，尝试从角色列表推断
        vid = voice_id or self.get_voice_id(speaker, [])

        if not self.enabled:
            return None

        # 网络瞬时故障自动重试
        max_attempts = 3
        last_err = None
        for attempt in range(1, max_attempts + 1):
            try:
                audio_data = self._call_tts_api(text, vid)
                if audio_data:
                    b64 = base64.b64encode(audio_data).decode("utf-8")
                    return f"data:audio/wav;base64,{b64}"
                else:
                    logger.warning("[tts_gen] %s: API 返回空音频数据", speaker)
                    return None
            except Exception as e:
                last_err = e
                if attempt < max_attempts:
                    wait = attempt * 2
                    logger.warning("[tts_gen] %s TTS 合成异常，%ss 后重试(%s/%s): %s", speaker, wait, attempt, max_attempts, e)
                    time.sleep(wait)
                    continue

        logger.error("[tts_gen] 合成失败 %s: %s: %s", speaker, type(last_err).__name__, last_err)
        return None

    def generate_to_file(self, script_slug: str, speaker: str, text: str, voice_id: str = "") -> Optional[str]:
        """合成语音并保存到磁盘，返回 URL 路径（/generated_audio/xxx.wav）。
        用于实时管线：避免 base64 data URI 过大导致 sessionStorage 溢出。
        未启用或失败返回 None。
        """
        if not text.strip():
            return None
        vid = voice_id or self.get_voice_id(speaker, [])
        if not self.enabled:
            return None

        max_attempts = 3
        last_err = None
        for attempt in range(1, max_attempts + 1):
            try:
                audio_data = self._call_tts_api(text, vid)
                if audio_data:
                    # 用内容哈希作文件名，避免重复
                    h = hashlib.md5(audio_data).hexdigest()[:12]
                    filename = f"tts_{h}.wav"
                    AUDIO_DIR.mkdir(parents=True, exist_ok=True)
                    filepath = AUDIO_DIR / filename
                    if not filepath.exists():
                        filepath.write_bytes(audio_data)
                    return f"/generated_audio/{filename}"
                else:
                    logger.warning("[tts_gen] %s: API 返回空音频数据", speaker)
                    return None
            except Exception as e:
                last_err = e
                if attempt < max_attempts:
                    wait = attempt * 2
                    logger.warning("[tts_gen] %s TTS 合成异常，%ss 后重试(%s/%s): %s", speaker, wait, attempt, max_attempts, e)
                    time.sleep(wait)
                    continue

        logger.error("[tts_gen] 合成失败 %s: %s: %s", speaker, type(last_err).__name__, last_err)
        return None

    def _call_tts_api(self, text: str, voice_id: str) -> Optional[bytes]:
        """
        调用 MiMo TTS API 合成语音，返回 WAV 音频二进制数据。

        API 使用 OpenAI 兼容的 chat.completions.create() 端点：
        - 合成文本放在 assistant 消息的 content 中
        - 风格指令可放在 user 消息的 content 中（可选）
        - audio.voice 参数指定音色：
          - 预置音色：直接传音色名（如 "冰糖"）
          - 音色克隆：传 "data:{mime};base64,{base64_audio}" 格式的参考音频

        当角色有参考音频文件时使用 mimo-v2.5-tts-voiceclone（音色克隆），
        否则回退到 mimo-v2.5-tts（预置音色）。
        """
        # 尝试解析 voice_id 为参考音频文件路径
        voice_sample_path = self._resolve_voice_sample(voice_id)

        if voice_sample_path:
            # ─── 音色克隆模式 ───
            sample_bytes = voice_sample_path.read_bytes()
            # 检查 base64 编码后是否超过 10MB 限制
            sample_b64_size = len(sample_bytes) * 4 // 3
            if sample_b64_size > 10 * 1024 * 1024:
                logger.warning("[tts_gen] 参考音频过大（%sMB > 10MB 限制），回退到预置音色", sample_b64_size // 1024 // 1024)
                voice_sample_path = None

        if voice_sample_path:
            # 音色克隆：使用 mimo-v2.5-tts-voiceclone
            mime = "audio/mpeg" if voice_sample_path.suffix.lower() == ".mp3" else "audio/wav"
            voice_b64 = base64.b64encode(sample_bytes).decode("utf-8")
            voice_param = f"data:{mime};base64,{voice_b64}"
            model = self.model
            logger.debug("[tts_api] voiceclone mode, sample=%s", voice_sample_path.name)
        else:
            # 预置音色：使用 mimo-v2.5-tts
            # 修复 Windows dotenv 编码问题导致的中文音色名乱码
            voice_id = _fix_voice_encoding(voice_id)
            in_preset = voice_id in _PRESET_VOICES
            voice_param = voice_id if in_preset else self.default_voice
            model = self.fallback_model
            if not in_preset:
                logger.warning("[tts_api] voice_id '%s' 不在预置音色集中，回退为 '%s'", voice_id, self.default_voice)
            else:
                logger.debug("[tts_api] preset voice='%s', model='%s'", voice_param, model)

        # 构建 messages：合成文本放在 assistant 消息中
        messages = [
            {"role": "user", "content": ""},      # 风格指令（空=默认风格）
            {"role": "assistant", "content": text},  # 要合成的文本
        ]

        # 调用 API（非流式，返回完整 WAV）
        completion = self.client.chat.completions.create(
            model=model,
            messages=messages,
            audio={"format": "wav", "voice": voice_param},
        )

        # 从响应中提取音频数据
        message = completion.choices[0].message
        audio_data = getattr(getattr(message, "audio", None), "data", None)
        if not audio_data:
            # 兼容 dict 格式
            audio_obj = getattr(message, "audio", None)
            if isinstance(audio_obj, dict):
                audio_data = audio_obj.get("data", "")
        if not audio_data:
            logger.warning("[tts_gen] 响应中无 audio.data 字段")
            return None

        return base64.b64decode(audio_data)
