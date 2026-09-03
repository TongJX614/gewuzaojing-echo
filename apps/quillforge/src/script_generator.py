# -*- coding: utf-8 -*-
"""
AI 剧本生成器 (Script Generator)
根据用户一句话描述，调用 DeepSeek 生成完整剧本包。

生成策略：内部分步（2次 LLM 调用），对外一次性返回。
  Step 1: 元数据 + 世界书 + 角色
  Step 2: 主线剧情 + 结局 + 场景 + 素材

输出：写入 var/uploads/{uuid8}/{剧本名}/ 目录，结构与上传剧本一致。
"""

from __future__ import annotations

import re
import time
import uuid
import yaml
from pathlib import Path
from typing import Generator
from datetime import date
from concurrent.futures import ThreadPoolExecutor, as_completed

from llm_client import LLMClient
from config_manager import QuillForgeSettings, get_settings
from logger import get_logger

logger = get_logger(__name__)

# 项目路径
PROJECT_ROOT = Path(__file__).resolve().parent.parent  # quillforge/
WORKSPACE_ROOT = PROJECT_ROOT.parent  # QuillForge workspace root
SAMPLES_DIR = PROJECT_ROOT / "samples"

# 输入限制
MAX_INPUT_LENGTH = 150


# ═══════════════════════════════════════════════════════
# LLM 客户端（使用统一模块）
# ═══════════════════════════════════════════════════════

def _build_script_gen_client(
    settings: QuillForgeSettings | None = None,
) -> LLMClient:
    """构建剧本生成专用 LLM 客户端。

    剧本生成使用 Settings 中独立的 script_model。
    游戏运行时对话仍走 .env 配置的模型（如 v4-pro）。
    必须禁用 thinking：思考模型未禁用时 content 返回空串，导致全步骤静默失败。
    """
    settings = settings or get_settings()
    return LLMClient(
        connection=settings.connection,
        model=settings.script_model,
        temperature=settings.script_gen_temperature,
        max_tokens=settings.script_gen_max_tokens,
        timeout=settings.script_gen_timeout,
        connect_timeout=settings.llm_connect_timeout,
        extra_body={"thinking": {"type": "disabled"}},
    )


# ═══════════════════════════════════════════════════════
# 提示词
# ═══════════════════════════════════════════════════════

SYSTEM_PROMPT_STEP1A = """\
你是一位专业的互动叙事剧本设计师。用户会给你一句话描述，你需要据此创作剧本的世界观基础设定。

要求：
- 自动推断合适的题材、故事规模
- 目标游玩时长约25-30分钟（4个场景、2-3个结局）
- 内容原创、有深度、有情感张力
- 所有输出使用中文
- 【内容安全】严禁设计涉及色情低俗、性暗示、暴力血腥、残忍虐待、政治敏感或其他违法违规的
  世界观、规则和剧情；若用户输入包含此类内容，须转化为安全、中性的表达，不得扩展违规内容

请严格按以下格式输出，不要添加任何额外说明：

===FILE: 剧本元数据.yaml===
（YAML格式，包含 script_id, title, version, author, created_date, last_modified, target_audience, age_rating, language, estimated_duration, difficulty, replay_value, genre, narrative_style）

===FILE: 世界书.md===
（Markdown格式，包含：世界背景、核心设定、社会规则、故事边界（必须遵守/禁止出现）、情感基调）

===END===
"""

SYSTEM_PROMPT_STEP1B = """\
你是一位专业的互动叙事剧本设计师。用户会给你一句话描述，你需要据此创作剧本的角色设定。

要求：
- 角色数量 3-4 位
- 角色设定要丰满，外貌描述要具体（用于AI生图）
- 【物种真实性】角色外貌必须严格符合其物种/形态：若剧情设定角色是动物、妖怪、
  机器人等非人类形态，appearance 必须描述该形态本身的特征（毛色、品种、体型、尾巴等），
  严禁把非人类角色描写成人类外貌；species 字段填该形态（如“狗”），人类角色填 human
- 角色设定必须具备高辨识度：每个角色的性格、说话风格、行为模式必须有明显区别，
  确保在后续场景生成中角色行为保持一致——同一角色在不同场景中的性格、说话方式、
  价值观不能前后矛盾
- voice_tone 字段要具体描述说话风格（口头禅、语气习惯、用词偏好），确保可辨识
- 所有输出使用中文

请严格按以下格式输出，不要添加任何额外说明：

===FILE: 主要角色.yaml===
（YAML格式，顶层键 characters，列表。每个角色包含：id, name, role, species, gender, age, occupation, background, personality, motivation, secrets, relationships, appearance, voice_tone, arc）
species 字段填角色当前身体形态（human 或具体形态如狗/猫/机器人），用于AI生图时区分人形与非人形角色。
注意：appearance 字段要详细描述外貌特征（身高体型、发型发色、标志性特征、穿着风格），这将直接用于AI生图。
gender 字段必须填写 male 或 female，用于 TTS 语音合成时区分男女声。
age 字段必须填写数字年龄（如 17、35、68），用于 TTS 语音合成时按年龄段（少年/青年/中年/老年）选择不同声线。

===FILE: 角色关系.yaml===
（YAML格式，包含：
1. 顶层键 relationships，列表。每项含：source(角色id), target(角色id), type, description, initial_level(1-10), dynamic(true/false), development(列表，每项含 trigger/change/scene)。
2. 顶层键 relationship_types，列表。每项含 id, name, description, min_level, max_level。
3. 顶层键 change_rules，列表。每项含 rule_id, description, condition, change, max_level, min_level。）

===END===
"""

SYSTEM_PROMPT_STEP2A = """\
你是一位专业的互动叙事剧本设计师。基于已确定的基础设定，完成剧本的剧情主线、结局系统和世界线。

要求：
- 4个场景（scene_01~scene_04），节奏紧凑
- 2-3个结局（至少包含 good/normal/bad 中的两种）
- 所有输出使用中文，内容精炼，避免冗长描述

请严格按以下格式输出，不要添加任何额外说明：

===FILE: 主线剧情.yaml===
（YAML格式，顶层键 main_plot，包含 summary(≤80字), themes(最多3个), core_conflict(1句话), stages(4个阶段，每个含 name/goal/conflict，每个字段1句话), beats, hooks(2-3个)）

===FILE: 结局系统.yaml===
（YAML格式，顶层键 endings，列表。每个结局包含：id, type, title, trigger_conditions, narrative(≤2句), epilogue(≤2句), replay_value, unlock_conditions）

===FILE: 世界线.yaml===
（YAML格式，包含：
1. 顶层键 world_lines，列表。每条世界线包含：id, name, description(1句), path(场景序列，每项含 scene_id/sequence/description), key_choices, end_ending。
   必须包含一条 main_line（主线）和至少一条 branch_line（分支线，额外含 origin_scene, conditions, consequences(1句)）。
2. 顶层键 convergence_points，列表。每项含 scene_id, description(1句), required_conditions。
3. 顶层键 rules，最多2条。每项含 rule_id, name, description(1句), condition, effect(1句)。）

===END===
"""

SYSTEM_PROMPT_STEP2B = """\
你是一位专业的互动叙事剧本设计师。基于已确定的基础设定，完成剧本的场景设计、素材清单和事件清单。

要求：
- 4个场景（scene_01~scene_04），每个场景有明确的叙事目的
- 每个场景的 branching_point 必须为 true：玩家在每个场景结束时都要做出关键抉择才能推进到下一场景
- 所有输出使用中文，内容精炼，避免冗长描述
- 场景中的角色行为必须与角色设定一致：性格、说话风格、动机不能矛盾
- 素材清单中场景背景的 details 字段只描述场景环境（地点/时间/天气/光影/建筑），
  绝对不要描述任何人物——背景图只生成场景不生成人物

请严格按以下格式输出，不要添加任何额外说明：

===FILE: 场景清单.yaml===
（YAML格式，顶层键 scenes，列表。每个场景包含：id, name, location, time, atmosphere, description(≤2句), trigger_conditions, characters_present(角色id列表), interactions(最多3个), assets_needed, branching_point(true/false), critical_choice, narrative_notes(1句)）
注意：第一个场景的 trigger_conditions type 为 "game_start"；场景id必须为 scene_01 到 scene_04。
critical_choice 填写对应关键选择的 id（格式 choice_XX），后续步骤会生成这些选择。

===FILE: 素材清单.yaml===
（YAML格式，顶层键 assets，包含 visual 列表。visual 中必须包含：
1. type="角色立绘" 条目（含 characters 子列表，每个角色有 name）
2. type="场景背景" 条目（含 scenes 子列表，每个场景有 name/mood/details(1句话)，数量与场景数一致）
   注意：details 只描述场景环境，不包含任何人物描述

===FILE: 事件清单.yaml===
（YAML格式，顶层键 events，列表，2个事件即可。每个事件包含：id, name, type, description(1句), trigger_conditions, location, time, characters_involved, content(2-3句), choices(2个), rewards(1句)）

===END===
"""

SYSTEM_PROMPT_STEP2C = """\
你是一位专业的互动叙事剧本设计师。基于已确定的场景清单，为每一个场景生成关键选择。

要求：
- 必须为场景清单中的每个场景（scene_01~scene_04）各生成一个关键选择，scene_id 一一对应，不得遗漏——这是玩家离开该场景、推进剧情时的抉择点
- 每个选择2-3个选项；最后一个场景的选择可通过 leads_to_ending 导向不同结局
- 所有输出使用中文，内容精炼

请严格按以下格式输出，不要添加任何额外说明：

===FILE: 关键选择.yaml===
（YAML格式，顶层键 choices，列表。每个选择包含：id(如choice_01), scene_id, prompt(1句), description(1句), options。
每个 option 只包含：id, text(选项文本), leads_to_ending(结局id或null)。）

===END===
"""


# ═══════════════════════════════════════════════════════
# 输出解析
# ═══════════════════════════════════════════════════════

def _parse_files_output(text: str) -> dict[str, str]:
    """
    解析 LLM 输出中的 ===FILE: xxx=== ... ===END=== 格式
    返回 {filename: content}
    """
    files = {}
    # 按 ===FILE: 或 ===END 分割
    parts = re.split(r'\n?===(?:FILE:\s*(.+?)|END)===\s*', text)
    # parts 结构: [前缀, filename1, content1, filename2, content2, ..., None/''(END后)]
    i = 1
    while i < len(parts) - 1:
        fname = parts[i]
        content = parts[i + 1] if i + 1 < len(parts) else ''
        if fname:  # 跳过 END 标记（fname 为 None）
            fname = fname.strip()
            content = content.strip()
            # 去除可能的代码围栏
            content = re.sub(r'^```\w*\n?', '', content)
            content = re.sub(r'\n?```$', '', content)
            if fname and content:
                files[fname] = content
        i += 2
    return files


def _validate_yaml(content: str) -> bool:
    """验证内容是否为合法 YAML"""
    try:
        yaml.safe_load(content)
        return True
    except Exception as e:
        logger.debug("[script_gen] YAML 验证失败: %s", e)
        return False


# ═══════════════════════════════════════════════════════
# ID 一致性校验
# ═══════════════════════════════════════════════════════

def _fix_character_refs(step1: dict[str, str], step2: dict[str, str]) -> dict[str, str]:
    """校验场景清单中 characters_present 引用的角色 ID 是否都在主要角色.yaml 中定义。
    不匹配时尝试自动替换为最接近的已定义 ID；无法匹配的保留原样（adapter 层会兜底）。
    """
    # 解析已定义角色
    chars_yaml = step1.get("主要角色.yaml", "")
    try:
        chars_data = yaml.safe_load(chars_yaml)
    except Exception as e:
        logger.warning("[script_gen] 角色 YAML 解析失败，跳过引用校验: %s", e)
        return step2
    if not isinstance(chars_data, dict):
        return step2
    char_list = chars_data.get("characters", [])
    if not isinstance(char_list, list):
        return step2

    # 构建 id/name 集合
    defined_ids: set[str] = set()
    id_lookup: dict[str, str] = {}  # lower_token -> actual_id
    for c in char_list:
        if not isinstance(c, dict):
            continue
        cid = str(c.get("id", "")).strip()
        cname = str(c.get("name", "")).strip()
        if cid:
            defined_ids.add(cid)
            id_lookup[cid.lower()] = cid
            # 拆分 token 便于模糊匹配
            for tok in cid.lower().replace("-", "_").split("_"):
                if tok and len(tok) > 2:
                    id_lookup.setdefault(tok, cid)
        if cname:
            defined_ids.add(cname)

    # 解析场景清单
    scenes_yaml = step2.get("场景清单.yaml", "")
    try:
        scenes_data = yaml.safe_load(scenes_yaml)
    except Exception as e:
        logger.warning("[script_gen] 场景 YAML 解析失败，跳过引用校验: %s", e)
        return step2
    if not isinstance(scenes_data, dict):
        return step2
    scene_list = scenes_data.get("scenes", [])
    if not isinstance(scene_list, list):
        return step2

    # 检查并修复引用
    fixed = False
    for scene in scene_list:
        if not isinstance(scene, dict):
            continue
        refs = scene.get("characters_present", [])
        if not isinstance(refs, list):
            continue
        new_refs = []
        for ref in refs:
            ref_str = str(ref).strip()
            if ref_str in defined_ids:
                new_refs.append(ref_str)
                continue
            # 尝试模糊匹配
            matched = _fuzzy_match_id(ref_str, defined_ids, id_lookup)
            if matched:
                new_refs.append(matched)
                fixed = True
            else:
                new_refs.append(ref_str)  # 保留原样
        scene["characters_present"] = new_refs

    # 重新序列化场景清单
    if fixed:
        step2 = dict(step2)
        step2["场景清单.yaml"] = yaml.dump(
            scenes_data, allow_unicode=True, default_flow_style=False, sort_keys=False
        )
    return step2


def _link_critical_choices(step2: dict[str, str]) -> dict[str, str]:
    """将关键选择按 scene_id 回写到场景的 critical_choice 字段。

    LLM 不保证主动填写 critical_choice，若不连线则 get_scene_choices
    返回空：剧本选项退化为 LLM 现场生成，小游戏随机注入也随之失效。
    后端确定性连线，保证生成剧本与上传剧本走同一选项链路。
    """
    choices_yaml = step2.get("关键选择.yaml", "")
    scenes_yaml = step2.get("场景清单.yaml", "")
    try:
        choices_data = yaml.safe_load(choices_yaml)
        scenes_data = yaml.safe_load(scenes_yaml)
    except Exception as e:
        logger.warning("[script_gen] 连线解析失败，跳过: %s", e)
        return step2
    if not isinstance(choices_data, dict) or not isinstance(scenes_data, dict):
        return step2

    # scene_id → choice_id（同一场景多个选择时取第一个）
    scene_to_choice: dict[str, str] = {}
    for ch in choices_data.get("choices", []) or []:
        if not isinstance(ch, dict):
            continue
        sid = str(ch.get("scene_id", "")).strip()
        cid = str(ch.get("id", "")).strip()
        if sid and cid and sid not in scene_to_choice:
            scene_to_choice[sid] = cid
    if not scene_to_choice:
        return step2

    linked = 0
    for scene in scenes_data.get("scenes", []) or []:
        if not isinstance(scene, dict):
            continue
        cid = scene_to_choice.get(str(scene.get("id", "")).strip())
        if not cid:
            continue
        # 以 scene_id 匹配为准强制写入：LLM 可能把 critical_choice 写成
        # 描述性文本而非 choice id，会导致 get_scene_choices 查不到选项
        if str(scene.get("critical_choice", "")).strip() != cid:
            scene["critical_choice"] = cid
            linked += 1
        # 有关键选择的场景必须标记为分支点，供前端/适配层识别
        scene["branching_point"] = True

    if linked:
        step2 = dict(step2)
        step2["场景清单.yaml"] = yaml.dump(
            scenes_data, allow_unicode=True, default_flow_style=False, sort_keys=False
        )
        logger.info("[script_gen] critical_choice 连线完成: %d 个场景", linked)
    return step2


def _fuzzy_match_id(ref: str, defined_ids: set[str], id_lookup: dict[str, str]) -> str | None:
    """尝试将未匹配的 ref 映射到已定义的字符 ID"""
    ref_lower = ref.lower().replace("-", "_")
    # 1. 子串匹配
    for did in defined_ids:
        did_lower = did.lower().replace("-", "_")
        if ref_lower in did_lower or did_lower in ref_lower:
            return did
    # 2. token 重叠
    ref_tokens = set(ref_lower.split("_")) - {""}
    best_id, best_score = None, 0
    for did in defined_ids:
        did_tokens = set(did.lower().replace("-", "_").split("_")) - {""}
        overlap = len(ref_tokens & did_tokens)
        if overlap > best_score:
            best_score = overlap
            best_id = did
    if best_score >= 1:
        return best_id
    # 3. 查找表
    for tok in ref_lower.split("_"):
        if tok in id_lookup:
            return id_lookup[tok]
    return None


# ═══════════════════════════════════════════════════════
# 核心生成逻辑
# ═══════════════════════════════════════════════════════

def generate_script(user_input: str, max_retries: int = 1) -> Generator[dict, None, None]:
    """
    生成完整剧本包。

    Yields 进度事件 dict:
      {"type": "progress", "step": str, "message": str}
      {"type": "done", "script_id": str, "path": str, "summary": dict}
      {"type": "error", "message": str}
    """
    # 输入校验
    user_input = user_input.strip()
    if not user_input:
        yield {"type": "error", "message": "请输入剧本描述"}
        return
    if len(user_input) > MAX_INPUT_LENGTH:
        yield {"type": "error", "message": f"描述不能超过{MAX_INPUT_LENGTH}字（当前{len(user_input)}字）"}
        return

    _sg_client = _build_script_gen_client()

    # ─── Step 1: 基础设定（并行：世界+角色） ───
    yield {"type": "progress", "step": "foundation", "message": "正在并行构思世界观与角色..."}

    def _call_step1a():
        """Call A: 元数据 + 世界书"""
        for attempt in range(max_retries):
            try:
                raw = _sg_client.generate(SYSTEM_PROMPT_STEP1A,
                                f"用户想要的剧本：{user_input}", max_tokens=4000, temperature=0.85)
                files = _parse_files_output(raw)
                if "剧本元数据.yaml" in files and _validate_yaml(files["剧本元数据.yaml"]):
                    return files
            except Exception as e:
                logger.warning("Step 1A attempt %d/%d failed: %s", attempt + 1, max_retries, e)
                if attempt < max_retries - 1:
                    time.sleep(min(2 ** attempt, 10))
        return None

    def _call_step1b():
        """Call B: 角色 + 角色关系"""
        for attempt in range(max_retries):
            try:
                raw = _sg_client.generate(SYSTEM_PROMPT_STEP1B,
                                f"用户想要的剧本：{user_input}", max_tokens=6000, temperature=0.85)
                files = _parse_files_output(raw)
                if "主要角色.yaml" in files and _validate_yaml(files["主要角色.yaml"]):
                    return files
            except Exception as e:
                logger.warning("Step 1B attempt %d/%d failed: %s", attempt + 1, max_retries, e)
                if attempt < max_retries - 1:
                    time.sleep(min(2 ** attempt, 10))
        return None

    # 并行执行
    with ThreadPoolExecutor(max_workers=2) as executor:
        future_a = executor.submit(_call_step1a)
        future_b = executor.submit(_call_step1b)
        files_a = future_a.result()
        files_b = future_b.result()

    if not files_a or not files_b:
        yield {"type": "error", "message": "基础设定生成失败，请重新输入"}
        return

    step1_output = {**files_a, **files_b}

    # 提取标题
    meta = yaml.safe_load(step1_output.get("剧本元数据.yaml", "{}"))
    title = meta.get("title", "未命名剧本") if isinstance(meta, dict) else "未命名剧本"

    # ─── Step 2: 剧情结构（并行：2A剧情+2B场景，然后串行 2C关键选择） ───
    yield {"type": "progress", "step": "structure", "message": f"正在并行编写《{title}》的剧情与场景..."}

    # 构建上下文：将 step1 的角色和元数据摘要传给 step2
    context_for_step2 = f"""已确定的基础设定：

【剧本标题】{title}
【题材】{meta.get('genre', '')}
【叙事风格】{meta.get('narrative_style', '')}

【世界书摘要】
{step1_output.get('世界书.md', '')[:800]}

【角色列表】
{step1_output.get('主要角色.yaml', '')[:1500]}
"""

    def _call_step2a():
        """2A: 主线剧情 + 结局系统 + 世界线"""
        for attempt in range(max_retries):
            try:
                raw = _sg_client.generate(SYSTEM_PROMPT_STEP2A,
                                context_for_step2, max_tokens=5000, temperature=0.8)
                files = _parse_files_output(raw)
                if "结局系统.yaml" in files and _validate_yaml(files["结局系统.yaml"]):
                    if "主线剧情.yaml" in files and _validate_yaml(files["主线剧情.yaml"]):
                        return files
            except Exception as e:
                logger.warning("Step 2A attempt %d/%d failed: %s", attempt + 1, max_retries, e)
                if attempt < max_retries - 1:
                    time.sleep(min(2 ** attempt, 10))
        return None

    def _call_step2b():
        """2B: 场景清单 + 素材清单 + 事件清单"""
        for attempt in range(max_retries):
            try:
                raw = _sg_client.generate(SYSTEM_PROMPT_STEP2B,
                                context_for_step2, max_tokens=5000, temperature=0.8)
                files = _parse_files_output(raw)
                if "场景清单.yaml" in files and _validate_yaml(files["场景清单.yaml"]):
                    return files
            except Exception as e:
                logger.warning("Step 2B attempt %d/%d failed: %s", attempt + 1, max_retries, e)
                if attempt < max_retries - 1:
                    time.sleep(min(2 ** attempt, 10))
        return None

    # 2A + 2B 并行
    with ThreadPoolExecutor(max_workers=2) as executor:
        fut_a = executor.submit(_call_step2a)
        fut_b = executor.submit(_call_step2b)
        files_2a = fut_a.result()
        files_2b = fut_b.result()

    if not files_2a:
        yield {"type": "error", "message": "剧情主线生成失败，请重新输入"}
        return
    if not files_2b:
        yield {"type": "error", "message": "场景设计生成失败，请重新输入"}
        return

    # ─── Step 2C: 关键选择（需要场景ID） ───
    yield {"type": "progress", "step": "choices", "message": "正在生成分支选项..."}

    # 构建场景摘要传给 2C
    scenes_yaml = files_2b.get("场景清单.yaml", "")
    endings_yaml = files_2a.get("结局系统.yaml", "")
    context_for_step2c = f"""已确定的场景清单：
{scenes_yaml[:2000]}

已确定的结局列表（只看 id 和 title）：
{endings_yaml[:800]}
"""

    files_2c = None
    for attempt in range(max_retries):
        try:
            raw = _sg_client.generate(SYSTEM_PROMPT_STEP2C,
                            context_for_step2c, max_tokens=3000, temperature=0.8)
            files = _parse_files_output(raw)
            if "关键选择.yaml" in files and _validate_yaml(files["关键选择.yaml"]):
                files_2c = files
                break
            logger.warning("Step 2C attempt %d/%d: validation failed, retrying", attempt + 1, max_retries)
            if attempt < max_retries - 1:
                time.sleep(min(2 ** attempt, 10))
        except Exception as e:
            logger.warning("Step 2C attempt %d/%d failed: %s", attempt + 1, max_retries, e)
            if attempt < max_retries - 1:
                time.sleep(min(2 ** attempt, 10))
            if attempt >= max_retries - 1:
                yield {"type": "error", "message": f"关键选择生成失败: {str(e)}"}
                return

    if files_2c is None:
        yield {"type": "error", "message": "关键选择生成失败，请重新输入"}
        return

    step2_output = {**files_2a, **files_2b, **files_2c}

    # ─── ID 一致性校验与自动修复 ───
    yield {"type": "progress", "step": "validate", "message": "正在校验角色引用一致性..."}
    step2_output = _fix_character_refs(step1_output, step2_output)

    # ─── 关键选择连线：scene_id → critical_choice ───
    yield {"type": "progress", "step": "link", "message": "正在绑定关键选择与场景..."}
    step2_output = _link_critical_choices(step2_output)

    # ─── 写入磁盘 ───
    yield {"type": "progress", "step": "saving", "message": "正在保存剧本..."}

    script_id = uuid.uuid4().hex
    # 清理标题中的非法路径字符
    safe_title = re.sub(r'[<>:"/\\|?*]', '', title).strip() or "未命名剧本"
    script_dir = SAMPLES_DIR / safe_title
    # 同名剧本已存在时追加短 ID 避免覆盖
    if script_dir.exists():
        script_dir = SAMPLES_DIR / f"{safe_title}_{script_id}"
    script_dir.mkdir(parents=True, exist_ok=True)

    # 创建子目录
    (script_dir / "角色").mkdir(exist_ok=True)
    (script_dir / "剧情").mkdir(exist_ok=True)
    (script_dir / "剧情" / "事件").mkdir(exist_ok=True)
    (script_dir / "场景").mkdir(exist_ok=True)
    (script_dir / "素材").mkdir(exist_ok=True)

    # 写入文件
    all_files = {**step1_output, **step2_output}
    file_mapping = {
        "剧本元数据.yaml": script_dir / "剧本元数据.yaml",
        "世界书.md": script_dir / "世界书.md",
        "主要角色.yaml": script_dir / "角色" / "主要角色.yaml",
        "角色关系.yaml": script_dir / "角色" / "角色关系.yaml",
        "主线剧情.yaml": script_dir / "剧情" / "主线剧情.yaml",
        "结局系统.yaml": script_dir / "剧情" / "结局系统.yaml",
        "世界线.yaml": script_dir / "剧情" / "世界线.yaml",
        "关键选择.yaml": script_dir / "剧情" / "事件" / "关键选择.yaml",
        "事件清单.yaml": script_dir / "剧情" / "事件" / "事件清单.yaml",
        "场景清单.yaml": script_dir / "场景" / "场景清单.yaml",
        "素材清单.yaml": script_dir / "素材" / "素材清单.yaml",
    }

    for fname, content in all_files.items():
        target = file_mapping.get(fname)
        if target:
            target.write_text(content, encoding="utf-8")

    # ─── 构建摘要 ───
    characters_data = yaml.safe_load(all_files.get("主要角色.yaml", "{}"))
    scenes_data = yaml.safe_load(all_files.get("场景清单.yaml", "{}"))
    endings_data = yaml.safe_load(all_files.get("结局系统.yaml", "{}"))

    char_list = characters_data.get("characters", []) if isinstance(characters_data, dict) else []
    scene_list = scenes_data.get("scenes", []) if isinstance(scenes_data, dict) else []
    ending_list = endings_data.get("endings", []) if isinstance(endings_data, dict) else []

    summary = {
        "title": title,
        "genre": meta.get("genre", ""),
        "characters": len(char_list),
        "character_names": [c.get("name", "") for c in char_list if isinstance(c, dict)],
        "scenes": len(scene_list),
        "scene_names": [s.get("name", "") for s in scene_list if isinstance(s, dict)],
        "endings": len(ending_list),
        "estimated_duration": meta.get("estimated_duration", "25-30分钟"),
        "narrative_style": meta.get("narrative_style", ""),
    }

    yield {
        "type": "done",
        "script_id": script_id,
        "path": str(script_dir),
        "summary": summary,
    }
