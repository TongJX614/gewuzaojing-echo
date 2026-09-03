# -*- coding: utf-8 -*-
"""
剧情小游戏生成器 (Minigame Generator)
根据上传剧本素材，调用独立模型生成三类剧情小游戏的结构化数据，
供前端独立试玩页渲染；玩家作答后由本模块判定成败。

玩法类型（kind）：
  - clue     线索指认：从若干线索卡中选出能回答问题的关键线索
  - cipher   密码解密：破译与剧情相关的密文（倒序/藏头/藏尾三种规则）
  - sequence 时间线排序：把打乱的剧情片段按正确顺序排列
  - match    连线配对：把左栏项与右栏项一一连线对应
  - classify 证物归类：把散落的条目按依据投入正确的分类箱
  - unlock   逐步解锁：多层机关逐层即时判定，全部答对揭示封存档案
  - voyage   巡航收集：驾驶巡逻艇限时撞击记忆浮标攒分达标
  - shuffle  碎纸复原：被撕碎的关键证物在九宫格里交换拼回原文
  - radio    频段截听：旋转调频旋钮对齐目标波形并稳住，截获密电
  - search   现场搜证：限时从陈列架的物品中圈出全部目标证物
  - dial     密码转盘：根据锁身谜面提示拨动转盘密码锁，按 A/B 反馈推理出真实密码
  - maze     档案室迷宫：限时穿过程序生成的迷宫网格抵达出口，躲开三盏游动的巡逻光点

流程：提取剧本素材 → LLM 输出结构化 JSON → 校验重试 → 后端渲染演出参数。
LLM 只负责内容创作；卡片配色、打乱顺序等演出参数由本模块计算。
答案（correct 字段）只保留在服务端用于判定，不下发前端。
"""

from __future__ import annotations

import random
import uuid
from functools import lru_cache

from llm_client import LLMClient
from config_manager import QuillForgeSettings, get_settings
from logger import get_logger

logger = get_logger("minigame_generator")

VALID_KINDS = ("clue", "cipher", "sequence",
               "match", "classify", "unlock", "voyage",
               "shuffle", "radio", "search", "dial", "maze")

# 别名兼容：剧本中可写 type: puzzle（对应密码解密玩法）；
# dossier（原案卷整理）与时间线排序机制重复，已并入 sequence
KIND_ALIASES = {"puzzle": "cipher", "dossier": "sequence"}


def normalize_kind(kind: str) -> str:
    """归一化玩法类型（去空白 + 别名映射）"""
    kind = str(kind or "").strip().lower()
    return KIND_ALIASES.get(kind, kind)


# ═══════════════════════════════════════════════
# 剧情内嵌：选项随机注入配置与注入函数
# ═══════════════════════════════════════════════

@lru_cache()
def _mg_yaml_config() -> dict:
    """读取 quillforge_config.yaml 的 minigame 节（不存在时返回空 dict）"""
    try:
        from quillforge.sut import load_config
        cfg = load_config() or {}
        return cfg.get("quillforge", {}).get("minigame", {}) or {}
    except Exception:
        return {}


def get_inject_config() -> dict:
    """选项注入小游戏的运行参数（概率与去重开关）"""
    cfg = _mg_yaml_config()
    prob = cfg.get("choiceProbability", 0.8)
    try:
        prob = max(0.0, min(1.0, float(prob)))
    except (TypeError, ValueError):
        prob = 0.8
    return {"choiceProbability": prob, "avoidRecentKind": bool(cfg.get("avoidRecentKind", True))}


# 前期场景防剧透：内容配额型玩法必须引用剧情事件，前期场景的已揭示视野
# 支撑不起，容易逼着 LLM 从伏笔外推凑数而剧透；场景索引小于该值时只注入风味型玩法
_EARLY_SCENE_LIMIT = 2
_CONTENT_HEAVY_KINDS = ("clue", "sequence", "match", "classify", "unlock")


def inject_choice_minigames(choices: list[dict], last_kind: str | None = None,
                            config: dict | None = None,
                            scene_index: int | None = None) -> tuple[list[dict], dict[int, dict]]:
    """为选项列表随机注入小游戏声明（剧情内嵌模式）。

    规则：
      - 已带合法 minigame 声明的选项（剧作者显式配置）优先保留，不参与注入
      - 兼容占位项（__advance__/__finish__）不注入
      - 其余选项逐个按 choiceProbability 掷骰子挂载随机玩法
      - 同一场景内注入的玩法互不重复；avoidRecentKind 开启时避开上一场景刚玩过的 kind
      - 前期场景（scene_index < _EARLY_SCENE_LIMIT）只注入风味型玩法，防剧透

    Args:
        choices: 选项 dict 列表（不被原地修改）
        last_kind: 上一场景实际玩过的 kind（避免连续重复）
        config: 覆盖默认配置 {choiceProbability, avoidRecentKind}（测试用）
        scene_index: 当前场景索引（None 时不做前期场景过滤）
    Returns:
        (注入后的新选项列表, {选项下标: 注入的 minigame 声明})
    """
    cfg = config or get_inject_config()
    prob = float(cfg.get("choiceProbability", 0.8))
    avoid_recent = bool(cfg.get("avoidRecentKind", True))

    injected: dict[int, dict] = {}
    used_kinds: set[str] = set()
    out: list[dict] = []
    for i, c in enumerate(choices):
        c = dict(c)
        decl = c.get("minigame")
        yaml_valid = isinstance(decl, dict) and normalize_kind(decl.get("type", "")) in VALID_KINDS
        is_placeholder = str(c.get("id", "")).startswith("__")
        if not yaml_valid and not is_placeholder and random.random() < prob:
            pool = [k for k in VALID_KINDS if k not in used_kinds]
            if scene_index is not None and scene_index < _EARLY_SCENE_LIMIT:
                # 前期场景视野窄，只允许风味型玩法（LLM 只写包装文案，不引用剧情事件）
                pool = [k for k in pool if k not in _CONTENT_HEAVY_KINDS]
            if avoid_recent and last_kind:
                filtered = [k for k in pool if k != normalize_kind(last_kind)]
                if filtered:
                    pool = filtered
            if pool:
                kind = random.choice(pool)
                used_kinds.add(kind)
                decl = {"type": kind, "hint": "", "injected": True}
                c["minigame"] = decl
                injected[i] = decl
        out.append(c)
    return out, injected

_KIND_TITLES = {
    "clue": "线索指认",
    "cipher": "密码解密",
    "sequence": "时间线排序",
    "match": "连线配对",
    "classify": "证物归类",
    "unlock": "逐步解锁",
    "voyage": "巡航收集",
    "shuffle": "碎纸复原",
    "radio": "频段截听",
    "search": "现场搜证",
    "dial": "密码转盘",
    "maze": "档案室迷宫",
}


# ═══════════════════════════════════════════════════════
# LLM 客户端（独立模型，不占用游戏运行时模型）
# ═══════════════════════════════════════════════════════

def _build_minigame_client(
    settings: QuillForgeSettings | None = None,
) -> LLMClient:
    """构建小游戏生成专用 LLM 客户端。

    小游戏生成使用 Settings 中独立的 minigame_model。
    必须禁用 thinking：思考模型会把 max_tokens 耗尽在 reasoning 上，
    导致正式输出为空。
    """
    settings = settings or get_settings()
    return LLMClient(
        connection=settings.connection,
        model=settings.minigame_model,
        temperature=0.85,
        max_tokens=3000,
        timeout=120.0,
        connect_timeout=settings.llm_connect_timeout,
        extra_body={"thinking": {"type": "disabled"}},
    )


# ═══════════════════════════════════════════════════════
# 提示词（内联风格，与 debate_generator / script_generator 一致）
# ═══════════════════════════════════════════════════════

_CLUE_SYSTEM_PROMPT = """\
你是一位悬疑互动剧的小游戏设计师。玩家正在体验一部互动剧本，
现在进入「线索指认」环节：根据此前剧情中出现的线索回答问题，
只有一张线索卡是正确答案，其余是看似相关但站不住脚的干扰项。

只输出一个 JSON 对象，不要任何额外说明、不要 markdown 代码块，结构如下：
{
  "title": "环节标题（≤15字）",
  "question": "问题（≤40字，必须能用一张线索卡回答）",
  "successText": "答对时的结算语（1句话，点破推理）",
  "failureText": "答错时的结算语（1句话，暗示错过关键）",
  "correctClueId": "正确线索的 id",
  "clues": [
    { "id": "clue_1", "text": "线索内容（≤60字，具体可查证）", "source": "线索来源（≤20字，如场景名/人物/物件）" }
  ]
}

硬性约束：
1. clues 数量 4~6 张，id 为 clue_1 到 clue_6，互不重复
2. correctClueId 必须是 clues 中已定义的 id
3. 问题与线索必须围绕剧本的核心冲突和剧情细节创作，不要照抄设定原文
4. 干扰项必须与剧本相关、有迷惑性，但细想无法回答问题
5.【内容安全】严禁色情低俗、暴力血腥、政治敏感内容
"""

_CIPHER_SYSTEM_PROMPT = """\
你是一位悬疑互动剧的小游戏设计师。玩家正在体验一部互动剧本，
现在进入「密码解密」环节：一段与剧情紧密相关的密文等待破译。

只输出一个 JSON 对象，不要任何额外说明、不要 markdown 代码块，结构如下：
{
  "title": "环节标题（≤15字）",
  "story": "背景叙述（≤80字，说明密文从何而来）",
  "rule": "加密方式，只能填 reverse（倒序）/ acrostic（藏头）/ tail（藏尾）",
  "answer": "明文答案（3~6字，唯一确定）",
  "sentences": ["仅 rule=acrostic/tail 时必填：数量与 answer 字数相同，每句≤20字；acrostic 按顺序每句首字连起来恰好是 answer，tail 按顺序每句最后一个字连起来恰好是 answer"],
  "successText": "解密成功时的结算语（1句话，衔接剧情）",
  "failureText": "解密失败时的结算语（1句话）"
}

硬性约束：
1. 难度面向普通玩家，密文由后端根据 rule 自动生成，你不需要也严禁自己编造 cipherText
2. reverse：把 answer 倒过来读就是密文；acrostic：每句首字依次拼出 answer；
   tail：每句末字依次拼出 answer。sentences 必须逐句核对首字/末字与 answer 逐字对应，
   且句子通顺、与剧情相关，藏字位置尽量不显眼
3. answer 是剧情中的具体名词/人名/地点/短句，3~6 字，优先选 4 字以上
4. 密文内容必须与剧本的核心冲突或关键道具相关
5.【内容安全】严禁色情低俗、暴力血腥、政治敏感内容
"""

_SEQUENCE_SYSTEM_PROMPT = """\
你是一位悬疑互动剧的小游戏设计师。玩家正在体验一部互动剧本，
现在进入「时间线排序」环节：若干打乱的剧情片段需要按真实发生顺序排列。

只输出一个 JSON 对象，不要任何额外说明、不要 markdown 代码块，结构如下：
{
  "title": "环节标题（≤15字）",
  "story": "背景叙述（≤80字，说明为何需要还原时间线）",
  "hint": "排序提示（≤40字）",
  "successText": "排序成功时的结算语（1句话）",
  "failureText": "排序失败时的结算语（1句话）",
  "items": [
    { "id": "seg_1", "text": "剧情片段（≤40字，一件具体事件）" }
  ]
}

硬性约束：
1. items 数量 3~6 个，id 为 seg_1 到 seg_6，互不重复
2. items 必须按正确的时间先后顺序输出（后端会负责打乱）
3. 每个片段是独立、具体、有先后逻辑的事件，排序存在唯一正解
4. 内容围绕剧本主线创作，体现事件因果
5.【内容安全】严禁色情低俗、暴力血腥、政治敏感内容
"""

_MATCH_SYSTEM_PROMPT = """\
你是一位悬疑互动剧的小游戏设计师。玩家正在体验一部互动剧本，
现在进入「连线配对」环节：调查板上散落着若干成对的信息，
玩家需要把左栏与右栏一一连线对应，全部配对正确才算过关。

只输出一个 JSON 对象，不要任何额外说明、不要 markdown 代码块，结构如下：
{
  "title": "环节标题（≤15字）",
  "question": "配对要求（≤30字，如“把人物与其动机连起来”）",
  "successText": "全部配对正确时的结算语（1句话）",
  "failureText": "配对有误时的结算语（1句话）",
  "pairs": [
    { "id": "pair_1", "left": "左栏项（≤12字，如人名/物件名）", "right": "右栏项（≤25字，与左栏项唯一对应）" }
  ]
}

硬性约束：
1. pairs 数量 3~5 组，id 为 pair_1 到 pair_5，互不重复
2. 每个 left 与 right 一一对应且互不重复，配对存在唯一正解（后端会负责打乱右栏）
3. 配对素材取自剧本的人物关系、动机、证物归属或事件因果
4. 干扰来自右栏打乱本身，不要设计模棱两可的配对
5.【内容安全】严禁色情低俗、暴力血腥、政治敏感内容
"""

_CLASSIFY_SYSTEM_PROMPT = """\
你是一位悬疑互动剧的小游戏设计师。玩家正在体验一部互动剧本，
现在进入「证物归类」环节：散落的条目需要按统一依据投入正确的分类箱。

只输出一个 JSON 对象，不要任何额外说明、不要 markdown 代码块，结构如下：
{
  "title": "环节标题（≤15字）",
  "question": "归类依据（≤30字，如“按证据来源分类”）",
  "successText": "归类全部正确时的结算语（1句话）",
  "failureText": "归类有误时的结算语（1句话）",
  "categories": [
    { "id": "cat_1", "name": "类别名（≤10字）" }
  ],
  "items": [
    { "id": "item_1", "text": "条目内容（≤40字）", "categoryId": "所属类别 id" }
  ]
}

硬性约束：
1. categories 数量 2~3 个，items 数量 4~8 个，各自 id 互不重复
2. 每个条目恰好属于一个类别，且每个类别至少分到一个条目
3. 归类依据明确唯一（按来源/按属性/按立场等），不存在跨类歧义
4. 内容围绕剧本核心冲突创作，营造整理案卷的氛围
5.【内容安全】严禁色情低俗、暴力血腥、政治敏感内容
"""

_UNLOCK_SYSTEM_PROMPT = """\
你是一位悬疑互动剧的小游戏设计师。玩家正在体验一部互动剧本，
现在进入「逐步解锁」环节：一道多层机关（封存档案/加密终端/保险箱），
每一层是一道单选题，玩家逐层作答、即时验证，选对才能进入下一层，
全部答对后机关开启，揭示一份与剧情相关的封存档案。

只输出一个 JSON 对象，不要任何额外说明、不要 markdown 代码块，结构如下：
{
  "title": "环节标题（≤15字）",
  "story": "背景叙述（≤80字，说明这道机关从何而来）",
  "successText": "解锁成功时的结算语（1句话，衔接档案内容）",
  "failureText": "解锁失败时的结算语（1句话）",
  "archive": {
    "title": "档案标题（≤15字，如“封存档案 · 织女号”）",
    "content": "档案正文（80~150字，解锁后揭示的关键剧情材料：实验记录/遗书/内部通报等）"
  },
  "steps": [
    {
      "id": "step_1",
      "prompt": "本层问题（≤30字）",
      "options": [ { "id": "opt_a", "text": "选项（≤20字）" } ],
      "correctId": "正确选项的 id",
      "hint": "本层答错时给出的提示（≤30字，指向正确方向但不直接说出答案）"
    }
  ]
}

硬性约束：
1. steps 数量 2~4 层；每层 options 数量 2~4 个，各自 id 互不重复
2. 每层 correctId 必须是该层 options 中已定义的 id，答案唯一
3. 每层 hint 必须引导玩家回想相关剧情细节，不得直接包含正确选项的文字
4. archive.content 必须与剧本核心秘密相关，是解锁行为值得换取的情报
5. 问题取材于剧情中的关键事实（人物/行为/物件/时间），干扰项貌似合理但可被剧情细节排除
6.【内容安全】严禁色情低俗、暴力血腥、政治敏感内容
"""

_VOYAGE_SYSTEM_PROMPT = """\
你是一位悬疑互动剧的小游戏设计师。玩家正在体验一部互动剧本，
现在进入「巡航收集」环节：玩家驾驶巡逻艇在剧情相关的水域航行，
限时撞击打捞漂浮的目标浮标攒分，达到目标分数即成功；
水面同时漂着暗礁与游动的障碍，撞上会被扣分。
玩法参数（时长/分数/浮标与障碍生成）由后端自动生成，你只创作主题内容。

只输出一个 JSON 对象，不要任何额外说明、不要 markdown 代码块，结构如下：
{
  "title": "环节标题（≤15字）",
  "story": "背景叙述（≤80字，说明为何出航、要打捞什么）",
  "targets": [
    { "id": "t_1", "label": "浮标名称（≤8字，收集目标物的名字）" }
  ],
  "successText": "达标时的结算语（1句话，衔接剧情）",
  "failureText": "未达标时的结算语（1句话）"
}

硬性约束：
1. targets 数量 2~4 个，label 为简洁名词且互不重复（如“记忆碎片”）
2. story 必须与剧本主线相关，说明出航动机
3. 严禁输出任何分数、时长、坐标等玩法数值，全部由后端生成
4.【内容安全】严禁色情低俗、暴力血腥、政治敏感内容
"""

_SHUFFLE_SYSTEM_PROMPT = """\
你是一位悬疑互动剧的小游戏设计师。玩家正在体验一部互动剧本，
现在进入「碎纸复原」环节：一份关键证物被撕碎成若干纸片，
玩家需要在调查台上把乱序的碎片交换拼回完整文件。

只输出一个 JSON 对象，不要任何额外说明、不要 markdown 代码块，结构如下：
{
  "title": "环节标题（≤15字）",
  "story": "背景叙述（≤80字，说明这份文件从何而来、为何被撕碎）",
  "docTitle": "证物文件标题（≤12字，如“尸检报告·柒号”）",
  "pieces": [
    { "id": "p_1", "text": "碎片内容（≤22字，文件的一个语句片段）" }
  ],
  "successText": "复原成功时的结算语（1句话，点破文件里的关键信息）",
  "failureText": "复原失败时的结算语（1句话）"
}

硬性约束：
1. pieces 数量只能是 6、8 或 9 个，id 为 p_1 到 p_9，互不重复
2. pieces 必须按文件的正确阅读顺序输出（后端会负责打乱）
3. 碎片按顺序连起来是一份完整连贯的文件（报告/口供/信件/电报等），语义连贯、断点自然
4. 文件内容必须与剧本核心冲突相关，藏着值得玩家拼出来挖掘的剧情信息
5.【内容安全】严禁色情低俗、暴力血腥、政治敏感内容
"""

_RADIO_SYSTEM_PROMPT = """\
你是一位悬疑互动剧的小游戏设计师。玩家正在体验一部互动剧本，
现在进入「频段截听」环节：一台秘密电台正在某个频段播发密电，
玩家旋转调频旋钮，让接收波形与目标密电波形重合并稳住片刻即可截获。
玩法参数（频率/容差/稳定时长/干扰频段/限时）全部由后端自动生成，你只创作主题内容。

只输出一个 JSON 对象，不要任何额外说明、不要 markdown 代码块，结构如下：
{
  "title": "环节标题（≤15字）",
  "story": "背景叙述（≤80字，说明秘密电台的来历与截获动机）",
  "callSign": "电台呼号（≤10字，如“夜枭”）",
  "interceptText": "截获的密电全文（40~90字，具体剧情情报：地点/日期/暗语/人名）",
  "successText": "截获成功时的结算语（1句话，衔接剧情）",
  "failureText": "截获失败时的结算语（1句话）"
}

硬性约束：
1. interceptText 必须与剧本核心冲突相关，是具体、有行动价值的情报
2. 严禁输出频率、容差、时长等任何玩法数值，全部由后端生成
3.【内容安全】严禁色情低俗、暴力血腥、政治敏感内容
"""

_SEARCH_SYSTEM_PROMPT = """\
你是一位悬疑互动剧的小游戏设计师。玩家正在体验一部互动剧本，
现在进入「现场搜证」环节：证物陈列架上摆满了形形色色的物品，
玩家需要在限时内圈出所有符合搜索目标的证物，一个不多一个不少。

只输出一个 JSON 对象，不要任何额外说明、不要 markdown 代码块，结构如下：
{
  "title": "环节标题（≤15字）",
  "story": "背景叙述（≤80字，说明为何要搜查这个现场）",
  "targetDesc": "搜索目标（≤30字，如“找出所有与纵火有关的物品”）",
  "items": [
    { "id": "ev_1", "name": "物品名（≤10字）", "desc": "外观描述（≤24字）", "isTarget": true }
  ],
  "successText": "搜证成功时的结算语（1句话）",
  "failureText": "搜证失败时的结算语（1句话）"
}

硬性约束：
1. items 数量 8~12 个，id 为 ev_1 到 ev_12，互不重复，name 互不重复
2. 其中恰好 2~4 个 isTarget 为 true，且都明确符合 targetDesc，判定依据唯一、无歧义
3. 非目标物品要与场景相关、有迷惑性，但细看之下明显不符合搜索目标
4. 物品取材于剧本的场景与剧情，营造现场勘查的氛围
5.【内容安全】严禁色情低俗、暴力血腥、政治敏感内容
"""

_DIAL_SYSTEM_PROMPT = """\
你是一位悬疑互动剧的小游戏设计师。玩家正在体验一部互动剧本，
现在进入「密码转盘」环节：一把与剧情相关的转盘密码锁挡住了去路。
你负责设计真实密码与指向它的谜面提示：玩家拨动转盘试开，
每次会得到反馈：几位数字位置正确（A）、几位数字对但位置不对（B），
结合谜面与反馈即可推理出密码，而不是纯碰运气。

只输出一个 JSON 对象，不要任何额外说明、不要 markdown 代码块，结构如下：
{
  "title": "环节标题（≤15字）",
  "story": "背景叙述（≤80字，说明这把锁锁着什么、为何必须打开）",
  "secret": "真实密码（恰好 3 位数字，如 915）",
  "lockNote": "锁身/旁边的谜面提示（≤30字，暗示密码来历但不直接说破，如“锁记住了告别那天的日子”）",
  "lockMark": "锁身刻痕提示（≤30字，比 lockNote 更具体，点明密码的构成或范围，如“刻痕写着：月与日，各取一位”）",
  "hintClue": "更明确的线索（≤30字，玩家拨错后才揭示，点明密码来历，如“九月十五，码头黄昏”）",
  "successText": "开锁成功时的结算语（1句话，点开锁后看到的关键信息）",
  "failureText": "开锁失败时的结算语（1句话）"
}

硬性约束：
1. secret 必须恰好是 3 位数字，且与剧本中的日期/编号/门牌等具体信息挂钩
2. lockNote、lockMark 与 hintClue 必须与 secret 的来历逻辑相关，三者都不得连续写出密码的 3 位数字
3. 提示层层递进：lockNote 走谜面风格，lockMark 更具体（点明构成/范围），hintClue 最直白（答错后才揭示）
4. story 必须与剧本核心冲突相关
5. 严禁输出试拨次数等玩法数值，全部由后端生成
6.【内容安全】严禁色情低俗、暴力血腥、政治敏感内容
"""

_MAZE_SYSTEM_PROMPT = """\
你是一位悬疑互动剧的小游戏设计师。玩家正在体验一部互动剧本，
现在进入「档案室迷宫」环节：玩家必须赶在限时内穿过一片复杂的区域抵达出口。
迷宫里有三盏不断游动的巡逻光点，被照到会被扣时间。
迷宫的网格布局、入口出口位置、光点出生点、限时全部由后端自动生成，你只创作主题内容。

只输出一个 JSON 对象，不要任何额外说明、不要 markdown 代码块，结构如下：
{
  "title": "环节标题（≤15字）",
  "story": "背景叙述（≤80字，说明为何要穿过这个区域、出口那头有什么）",
  "mapNote": "任务提示（≤30字，如“当心三盏游动的巡逻光点”）",
  "successText": "抵达出口时的结算语（1句话，衔接剧情）",
  "failureText": "未能脱身时的结算语（1句话，兼容超时与被光点拖住的情形）"
}

硬性约束：
1. story 必须与剧本核心冲突相关，说明行动动机
2. 严禁输出任何网格、坐标、时长等玩法数值，全部由后端生成
3.【内容安全】严禁色情低俗、暴力血腥、政治敏感内容
"""

_SYSTEM_PROMPTS = {
    "clue": _CLUE_SYSTEM_PROMPT,
    "cipher": _CIPHER_SYSTEM_PROMPT,
    "sequence": _SEQUENCE_SYSTEM_PROMPT,
    "match": _MATCH_SYSTEM_PROMPT,
    "classify": _CLASSIFY_SYSTEM_PROMPT,
    "unlock": _UNLOCK_SYSTEM_PROMPT,
    "voyage": _VOYAGE_SYSTEM_PROMPT,
    "shuffle": _SHUFFLE_SYSTEM_PROMPT,
    "radio": _RADIO_SYSTEM_PROMPT,
    "search": _SEARCH_SYSTEM_PROMPT,
    "dial": _DIAL_SYSTEM_PROMPT,
    "maze": _MAZE_SYSTEM_PROMPT,
}


def _build_user_prompt(material: dict, errors: list[str] | None = None,
                       scene_context: dict | None = None) -> str:
    """组装用户 Prompt。

    两种视野：
      - 独立试玩（scene_context 为 None）：全量剧本素材
      - 剧情内嵌：只给“已揭示视野”（走过的场景/登场角色/玩家选择/当下剧情），
        不透出核心冲突、剧情梗概与未到达场景，防止小游戏剧透后续剧情
    """
    themes_str = "、".join(material["themes"]) if material["themes"] else "（未提供）"

    if scene_context:
        visited = [str(s) for s in (scene_context.get("visited_scenes") or []) if str(s).strip()]
        appeared = [str(n) for n in (scene_context.get("appeared_characters") or []) if str(n).strip()]
        prompt = f"""剧本标题：{material['title']}
主题：{themes_str}

【已揭示剧情视野】小游戏只能使用以下内容创作，严禁涉及尚未发生的剧情、未登场的角色与结局真相：
走过的场景：{'、'.join(visited) if visited else '（故事刚开始）'}
已登场角色：{'、'.join(appeared) if appeared else '（未提供）'}

【防剧透硬规则】
1. 只能把视野内“已实际发生的事件 / 已揭示的信息”写进玩法内容
2. 对话中提到的未来计划、角色担忧、口头转述与伏笔（如“明天会怎样”“听说某事”）一律不算已发生，严禁写进玩法内容
3. 素材不足以填满要求数量时，减少条目数量，宁可少而准，绝不为凑数虚构未发生的剧情
"""

        # 小游戏由具体场景的选项触发，内容必须衔接当下剧情
        ctx_parts = ["\n【当前场景上下文】（小游戏由此刻剧情触发，内容必须与之衔接）"]
        if scene_context.get("choice_text"):
            line = f"玩家点击的选项：{scene_context['choice_text']}"
            if scene_context.get("hint"):
                line += f"（创作提示：{scene_context['hint']}）"
            ctx_parts.append(line)
        if scene_context.get("narration"):
            ctx_parts.append(f"当前场景旁白：{str(scene_context['narration'])[:300]}")
        dialogues = scene_context.get("dialogues") or []
        if dialogues:
            dlg_lines = [
                f"  - {d.get('speaker', '')}：{str(d.get('text', ''))[:80]}"
                for d in dialogues[-8:] if isinstance(d, dict)
            ]
            if dlg_lines:
                ctx_parts.append("最近的对话：\n" + "\n".join(dlg_lines))
        history = scene_context.get("history") or []
        if history:
            h_lines = [
                f"  - {h.get('scene_name', '')}→{h.get('player_choice', '')}"
                for h in history[-5:] if isinstance(h, dict)
            ]
            if h_lines:
                ctx_parts.append("玩家此前的选择：\n" + "\n".join(h_lines))
        prompt += "\n".join(ctx_parts) + "\n"
    else:
        chars_str = "、".join(material["character_names"]) or "（未提供）"
        scenes_block = "\n".join(
            f"- {s['name']}：{s['desc']}" for s in material["scenes"]
        ) or "（未提供）"

        prompt = f"""剧本标题：{material['title']}
核心冲突：{material['core_conflict'] or '（未提供）'}
主题：{themes_str}
剧情梗概：{material['summary'] or '（未提供）'}
主要角色：{chars_str}

场景一览：
{scenes_block}
"""

    prompt += "\n请基于以上素材设计这个小游戏环节。"

    if errors:
        prompt += "\n\n你上一次的输出未通过校验，存在以下问题，请逐条修正后重新输出完整 JSON：\n"
        prompt += "\n".join(f"- {e}" for e in errors)
    return prompt


# ═══════════════════════════════════════════════════════
# 素材提取
# ═══════════════════════════════════════════════════════

def extract_minigame_material(adapter) -> dict:
    """从已解析的剧本适配器中提取小游戏生成所需素材。

    Returns:
        {title, core_conflict, themes, summary, character_names,
         scenes: [{name, desc}]}
    Raises:
        ValueError: 剧本素材不足（core_conflict/themes/summary 全空）
    """
    raw = getattr(adapter, "raw_data", {}) or {}
    main_plot = raw.get("main_plot") or {}
    if not isinstance(main_plot, dict):
        main_plot = {}

    themes = main_plot.get("themes") or []
    if isinstance(themes, str):
        themes = [themes]
    core_conflict = str(main_plot.get("core_conflict", "") or "")
    summary = str(main_plot.get("summary", "") or "")

    if not core_conflict and not themes and not summary:
        raise ValueError("剧本缺少主题描述（main_plot 的 core_conflict/themes/summary 均为空），无法生成小游戏")

    character_names: list[str] = []
    for c in (getattr(adapter, "characters", []) or [])[:6]:
        name = c.get("name") or c.get("id") or ""
        if name:
            character_names.append(name)

    scenes: list[dict] = []
    for s in (getattr(adapter, "scenes", []) or [])[:6]:
        if not isinstance(s, dict):
            continue
        name = str(s.get("name", "") or "").strip()
        desc = str(s.get("description", "") or s.get("narrative_notes", "") or "").strip()[:60]
        if name:
            scenes.append({"name": name, "desc": desc})

    return {
        "title": getattr(adapter, "title", "") or "未命名剧本",
        "core_conflict": core_conflict,
        "themes": [str(t) for t in themes][:3],
        "summary": summary[:150],
        "character_names": character_names,
        "scenes": scenes,
    }


# ═══════════════════════════════════════════════════════
# 校验（按玩法分派，返回错误列表，空列表表示通过）
# ═══════════════════════════════════════════════════════

def _validate_clue(data: dict) -> list[str]:
    errors: list[str] = []
    if not str(data.get("question", "")).strip():
        errors.append("question 不能为空")

    clues = data.get("clues")
    if not isinstance(clues, list):
        return errors + ["clues 必须是数组"]
    if not 4 <= len(clues) <= 6:
        errors.append(f"clues 数量必须为 4~6 张（当前 {len(clues)}）")

    clue_ids: set[str] = set()
    for c in clues:
        if not isinstance(c, dict):
            errors.append("clues 中存在非对象元素")
            continue
        cid = str(c.get("id", "")).strip()
        if not cid:
            errors.append("存在缺少 id 的线索")
        elif cid in clue_ids:
            errors.append(f"线索 id 重复: {cid}")
        else:
            clue_ids.add(cid)
        if not str(c.get("text", "")).strip():
            errors.append(f"线索 {cid or '?'} 缺少 text")
        if not str(c.get("source", "")).strip():
            errors.append(f"线索 {cid or '?'} 缺少 source")

    correct = str(data.get("correctClueId", "")).strip()
    if not correct:
        errors.append("correctClueId 不能为空")
    elif clue_ids and correct not in clue_ids:
        errors.append(f"correctClueId「{correct}」不在 clues 的 id 中")

    if not str(data.get("successText", "")).strip():
        errors.append("successText 不能为空")
    if not str(data.get("failureText", "")).strip():
        errors.append("failureText 不能为空")
    return errors


# 密码玩法只允许后端可验证的模板；密文与提示由后端根据模板生成，保证规则与答案必然自洽
_CIPHER_RULES = {"reverse", "acrostic", "tail"}
_CIPHER_HINTS = {
    "reverse": "把这串密文倒过来读，就是明文。",
    "acrostic": "每句话的第一个字藏着答案，按顺序连起来读。",
    "tail": "每句话的最后一个字藏着答案，按顺序连起来读。",
}


def _validate_cipher(data: dict) -> list[str]:
    errors: list[str] = []
    rule = str(data.get("rule", "")).strip()
    if rule not in _CIPHER_RULES:
        errors.append(f"rule 必须是 {'/'.join(sorted(_CIPHER_RULES))} 之一")
    answer = str(data.get("answer", "")).strip()
    if not answer:
        errors.append("answer 不能为空")
    elif len(answer) < 3:
        errors.append(f"answer 过短（{len(answer)} 字，至少 3 字）")
    elif len(answer) > 6:
        errors.append(f"answer 过长（{len(answer)} 字，最多 6 字）")
    if rule in ("acrostic", "tail") and answer:
        sentences = data.get("sentences")
        pos_name = "首字" if rule == "acrostic" else "末字"
        if not isinstance(sentences, list):
            errors.append(f"{rule} 规则必须提供 sentences 数组")
        elif len(sentences) != len(answer):
            errors.append(f"sentences 数量（{len(sentences)}）必须等于 answer 字数（{len(answer)}）")
        else:
            for i, s in enumerate(sentences):
                text = str(s).strip()
                if not text:
                    errors.append(f"第 {i + 1} 句不能为空")
                elif text[0 if rule == "acrostic" else -1] != answer[i]:
                    ch = text[0] if rule == "acrostic" else text[-1]
                    errors.append(f"第 {i + 1} 句{pos_name}「{ch}」与答案第 {i + 1} 字「{answer[i]}」不符")
    if not str(data.get("story", "")).strip():
        errors.append("story 不能为空")
    if not str(data.get("successText", "")).strip():
        errors.append("successText 不能为空")
    if not str(data.get("failureText", "")).strip():
        errors.append("failureText 不能为空")
    return errors


def _validate_ordering(data: dict, list_key: str, id_prefix: str, min_n: int, max_n: int) -> list[str]:
    """排序类玩法（sequence）的通用校验"""
    errors: list[str] = []
    items = data.get(list_key)
    if not isinstance(items, list):
        return [f"{list_key} 必须是数组"]
    if not min_n <= len(items) <= max_n:
        errors.append(f"{list_key} 数量必须为 {min_n}~{max_n} 个（当前 {len(items)}）")

    ids: list[str] = []
    for it in items:
        if not isinstance(it, dict):
            errors.append(f"{list_key} 中存在非对象元素")
            continue
        iid = str(it.get("id", "")).strip()
        if not iid:
            errors.append(f"存在缺少 id 的{id_prefix}")
        elif iid in ids:
            errors.append(f"{id_prefix} id 重复: {iid}")
        else:
            ids.append(iid)
        if not str(it.get("text", "")).strip():
            errors.append(f"{id_prefix} {iid or '?'} 缺少 text")

    if not str(data.get("successText", "")).strip():
        errors.append("successText 不能为空")
    if not str(data.get("failureText", "")).strip():
        errors.append("failureText 不能为空")
    return errors


def _validate_match(data: dict) -> list[str]:
    errors: list[str] = []
    if not str(data.get("question", "")).strip():
        errors.append("question 不能为空")

    pairs = data.get("pairs")
    if not isinstance(pairs, list):
        return errors + ["pairs 必须是数组"]
    if not 3 <= len(pairs) <= 5:
        errors.append(f"pairs 数量必须为 3~5 组（当前 {len(pairs)}）")

    ids: set[str] = set()
    lefts: set[str] = set()
    rights: set[str] = set()
    for p in pairs:
        if not isinstance(p, dict):
            errors.append("pairs 中存在非对象元素")
            continue
        pid = str(p.get("id", "")).strip()
        if not pid:
            errors.append("存在缺少 id 的配对")
        elif pid in ids:
            errors.append(f"配对 id 重复: {pid}")
        else:
            ids.add(pid)
        left = str(p.get("left", "")).strip()
        right = str(p.get("right", "")).strip()
        if not left:
            errors.append(f"配对 {pid or '?'} 缺少 left")
        elif left in lefts:
            errors.append(f"left 重复: {left}")
        else:
            lefts.add(left)
        if not right:
            errors.append(f"配对 {pid or '?'} 缺少 right")
        elif right in rights:
            errors.append(f"right 重复: {right}")
        else:
            rights.add(right)

    if not str(data.get("successText", "")).strip():
        errors.append("successText 不能为空")
    if not str(data.get("failureText", "")).strip():
        errors.append("failureText 不能为空")
    return errors


def _validate_classify(data: dict) -> list[str]:
    errors: list[str] = []
    if not str(data.get("question", "")).strip():
        errors.append("question 不能为空")

    categories = data.get("categories")
    if not isinstance(categories, list):
        return errors + ["categories 必须是数组"]
    if not 2 <= len(categories) <= 3:
        errors.append(f"categories 数量必须为 2~3 个（当前 {len(categories)}）")

    cat_ids: set[str] = set()
    for c in categories:
        if not isinstance(c, dict):
            errors.append("categories 中存在非对象元素")
            continue
        cid = str(c.get("id", "")).strip()
        if not cid:
            errors.append("存在缺少 id 的类别")
        elif cid in cat_ids:
            errors.append(f"类别 id 重复: {cid}")
        else:
            cat_ids.add(cid)
        if not str(c.get("name", "")).strip():
            errors.append(f"类别 {cid or '?'} 缺少 name")

    items = data.get("items")
    if not isinstance(items, list):
        return errors + ["items 必须是数组"]
    if not 4 <= len(items) <= 8:
        errors.append(f"items 数量必须为 4~8 个（当前 {len(items)}）")

    item_ids: set[str] = set()
    used_cats: set[str] = set()
    for it in items:
        if not isinstance(it, dict):
            errors.append("items 中存在非对象元素")
            continue
        iid = str(it.get("id", "")).strip()
        if not iid:
            errors.append("存在缺少 id 的条目")
        elif iid in item_ids:
            errors.append(f"条目 id 重复: {iid}")
        else:
            item_ids.add(iid)
        if not str(it.get("text", "")).strip():
            errors.append(f"条目 {iid or '?'} 缺少 text")
        cat = str(it.get("categoryId", "")).strip()
        if not cat:
            errors.append(f"条目 {iid or '?'} 缺少 categoryId")
        elif cat_ids and cat not in cat_ids:
            errors.append(f"条目 {iid or '?'} 的 categoryId「{cat}」不在 categories 中")
        else:
            used_cats.add(cat)
    if cat_ids and used_cats != cat_ids:
        missing = "、".join(sorted(cat_ids - used_cats))
        errors.append(f"以下类别没有分配到任何条目: {missing}")

    if not str(data.get("successText", "")).strip():
        errors.append("successText 不能为空")
    if not str(data.get("failureText", "")).strip():
        errors.append("failureText 不能为空")
    return errors


def _validate_unlock(data: dict) -> list[str]:
    errors: list[str] = []
    if not str(data.get("story", "")).strip():
        errors.append("story 不能为空")

    steps = data.get("steps")
    if not isinstance(steps, list):
        return errors + ["steps 必须是数组"]
    if not 2 <= len(steps) <= 4:
        errors.append(f"steps 数量必须为 2~4 层（当前 {len(steps)}）")

    step_ids: set[str] = set()
    for i, st in enumerate(steps, 1):
        if not isinstance(st, dict):
            errors.append("steps 中存在非对象元素")
            continue
        sid = str(st.get("id", "")).strip()
        if not sid:
            errors.append(f"第 {i} 层缺少 id")
        elif sid in step_ids:
            errors.append(f"层 id 重复: {sid}")
        else:
            step_ids.add(sid)
        if not str(st.get("prompt", "")).strip():
            errors.append(f"第 {i} 层缺少 prompt")

        options = st.get("options")
        opt_ids: set[str] = set()
        if not isinstance(options, list):
            errors.append(f"第 {i} 层的 options 必须是数组")
            continue
        if not 2 <= len(options) <= 4:
            errors.append(f"第 {i} 层的 options 数量必须为 2~4 个（当前 {len(options)}）")
        for o in options:
            if not isinstance(o, dict):
                errors.append(f"第 {i} 层的 options 中存在非对象元素")
                continue
            oid = str(o.get("id", "")).strip()
            if not oid:
                errors.append(f"第 {i} 层存在缺少 id 的选项")
            elif oid in opt_ids:
                errors.append(f"第 {i} 层选项 id 重复: {oid}")
            else:
                opt_ids.add(oid)
            if not str(o.get("text", "")).strip():
                errors.append(f"第 {i} 层选项 {oid or '?'} 缺少 text")

        correct = str(st.get("correctId", "")).strip()
        if not correct:
            errors.append(f"第 {i} 层缺少 correctId")
        elif opt_ids and correct not in opt_ids:
            errors.append(f"第 {i} 层 correctId「{correct}」不在该层 options 中")
        if not str(st.get("hint", "")).strip():
            errors.append(f"第 {i} 层缺少 hint（答错时的提示）")

    archive = data.get("archive")
    if not isinstance(archive, dict):
        errors.append("缺少 archive 对象（解锁成功后揭示的档案）")
    else:
        if not str(archive.get("title", "")).strip():
            errors.append("archive.title 不能为空")
        if not str(archive.get("content", "")).strip():
            errors.append("archive.content 不能为空")

    if not str(data.get("successText", "")).strip():
        errors.append("successText 不能为空")
    if not str(data.get("failureText", "")).strip():
        errors.append("failureText 不能为空")
    return errors


def _validate_voyage(data: dict) -> list[str]:
    errors: list[str] = []
    if not str(data.get("story", "")).strip():
        errors.append("story 不能为空")

    targets = data.get("targets")
    if not isinstance(targets, list):
        return errors + ["targets 必须是数组"]
    if not 2 <= len(targets) <= 4:
        errors.append(f"targets 数量必须为 2~4 个（当前 {len(targets)}）")

    ids: set[str] = set()
    labels: set[str] = set()
    for t in targets:
        if not isinstance(t, dict):
            errors.append("targets 中存在非对象元素")
            continue
        tid = str(t.get("id", "")).strip()
        if not tid:
            errors.append("存在缺少 id 的浮标")
        elif tid in ids:
            errors.append(f"浮标 id 重复: {tid}")
        else:
            ids.add(tid)
        label = str(t.get("label", "")).strip()
        if not label:
            errors.append(f"浮标 {tid or '?'} 缺少 label")
        elif label in labels:
            errors.append(f"浮标 label 重复: {label}")
        else:
            labels.add(label)

    if not str(data.get("successText", "")).strip():
        errors.append("successText 不能为空")
    if not str(data.get("failureText", "")).strip():
        errors.append("failureText 不能为空")
    return errors


# 碎纸复原的碎片数只允许能整齐铺满矩形的取值（6=3×2 / 8=4×2 / 9=3×3）
_SHUFFLE_GRID_COUNTS = (6, 8, 9)


def _validate_shuffle(data: dict) -> list[str]:
    errors: list[str] = []
    if not str(data.get("story", "")).strip():
        errors.append("story 不能为空")
    if not str(data.get("docTitle", "")).strip():
        errors.append("docTitle 不能为空")

    pieces = data.get("pieces")
    if not isinstance(pieces, list):
        return errors + ["pieces 必须是数组"]
    if len(pieces) not in _SHUFFLE_GRID_COUNTS:
        errors.append(f"pieces 数量必须是 {'/'.join(str(n) for n in _SHUFFLE_GRID_COUNTS)} 之一（当前 {len(pieces)}）")

    ids: set[str] = set()
    for p in pieces:
        if not isinstance(p, dict):
            errors.append("pieces 中存在非对象元素")
            continue
        pid = str(p.get("id", "")).strip()
        if not pid:
            errors.append("存在缺少 id 的碎片")
        elif pid in ids:
            errors.append(f"碎片 id 重复: {pid}")
        else:
            ids.add(pid)
        if not str(p.get("text", "")).strip():
            errors.append(f"碎片 {pid or '?'} 缺少 text")

    if not str(data.get("successText", "")).strip():
        errors.append("successText 不能为空")
    if not str(data.get("failureText", "")).strip():
        errors.append("failureText 不能为空")
    return errors


def _validate_radio(data: dict) -> list[str]:
    errors: list[str] = []
    if not str(data.get("story", "")).strip():
        errors.append("story 不能为空")
    if not str(data.get("callSign", "")).strip():
        errors.append("callSign 不能为空")
    text = str(data.get("interceptText", "")).strip()
    if not text:
        errors.append("interceptText 不能为空")
    elif len(text) < 20:
        errors.append(f"interceptText 过短（{len(text)} 字，至少 20 字）")
    if not str(data.get("successText", "")).strip():
        errors.append("successText 不能为空")
    if not str(data.get("failureText", "")).strip():
        errors.append("failureText 不能为空")
    return errors


def _validate_search(data: dict) -> list[str]:
    errors: list[str] = []
    if not str(data.get("story", "")).strip():
        errors.append("story 不能为空")
    if not str(data.get("targetDesc", "")).strip():
        errors.append("targetDesc 不能为空")

    items = data.get("items")
    if not isinstance(items, list):
        return errors + ["items 必须是数组"]
    if not 8 <= len(items) <= 12:
        errors.append(f"items 数量必须为 8~12 个（当前 {len(items)}）")

    ids: set[str] = set()
    names: set[str] = set()
    target_count = 0
    for it in items:
        if not isinstance(it, dict):
            errors.append("items 中存在非对象元素")
            continue
        iid = str(it.get("id", "")).strip()
        if not iid:
            errors.append("存在缺少 id 的物品")
        elif iid in ids:
            errors.append(f"物品 id 重复: {iid}")
        else:
            ids.add(iid)
        name = str(it.get("name", "")).strip()
        if not name:
            errors.append(f"物品 {iid or '?'} 缺少 name")
        elif name in names:
            errors.append(f"物品 name 重复: {name}")
        else:
            names.add(name)
        if not str(it.get("desc", "")).strip():
            errors.append(f"物品 {iid or '?'} 缺少 desc")
        if bool(it.get("isTarget")):
            target_count += 1
    if not 2 <= target_count <= 4:
        errors.append(f"isTarget 为 true 的物品必须为 2~4 个（当前 {target_count}）")

    if not str(data.get("successText", "")).strip():
        errors.append("successText 不能为空")
    if not str(data.get("failureText", "")).strip():
        errors.append("failureText 不能为空")
    return errors


def _validate_dial(data: dict) -> list[str]:
    errors: list[str] = []
    if not str(data.get("story", "")).strip():
        errors.append("story 不能为空")
    secret = str(data.get("secret", "")).strip()
    if not (len(secret) == _DIAL_CODE_LEN and secret.isdigit()):
        errors.append(f"secret 必须恰好是 {_DIAL_CODE_LEN} 位数字")
    lock_note = str(data.get("lockNote", "")).strip()
    if not lock_note:
        errors.append("lockNote 不能为空")
    elif secret and secret in lock_note:
        errors.append("lockNote 不得直接包含真实密码的 3 位数字")
    lock_mark = str(data.get("lockMark", "")).strip()
    if not lock_mark:
        errors.append("lockMark 不能为空")
    elif secret and secret in lock_mark:
        errors.append("lockMark 不得直接包含真实密码的 3 位数字")
    hint_clue = str(data.get("hintClue", "")).strip()
    if not hint_clue:
        errors.append("hintClue 不能为空")
    elif secret and secret in hint_clue:
        errors.append("hintClue 不得直接写出密码的 3 位数字")
    if not str(data.get("successText", "")).strip():
        errors.append("successText 不能为空")
    if not str(data.get("failureText", "")).strip():
        errors.append("failureText 不能为空")
    return errors


def _validate_maze(data: dict) -> list[str]:
    errors: list[str] = []
    if not str(data.get("story", "")).strip():
        errors.append("story 不能为空")
    if not str(data.get("mapNote", "")).strip():
        errors.append("mapNote 不能为空")
    if not str(data.get("successText", "")).strip():
        errors.append("successText 不能为空")
    if not str(data.get("failureText", "")).strip():
        errors.append("failureText 不能为空")
    return errors


def _validate_minigame(kind: str, data: dict) -> list[str]:
    if kind == "clue":
        return _validate_clue(data)
    if kind == "cipher":
        return _validate_cipher(data)
    if kind == "sequence":
        return _validate_ordering(data, "items", "片段", 3, 6)
    if kind == "match":
        return _validate_match(data)
    if kind == "classify":
        return _validate_classify(data)
    if kind == "unlock":
        return _validate_unlock(data)
    if kind == "voyage":
        return _validate_voyage(data)
    if kind == "shuffle":
        return _validate_shuffle(data)
    if kind == "radio":
        return _validate_radio(data)
    if kind == "search":
        return _validate_search(data)
    if kind == "dial":
        return _validate_dial(data)
    if kind == "maze":
        return _validate_maze(data)
    return [f"未知玩法类型: {kind}"]


# ═══════════════════════════════════════════════════════
# 演出参数渲染（打乱顺序、分配配色；答案只留在服务端）
# ═══════════════════════════════════════════════════════

_CARD_COLORS = ["#ff007f", "#00ccff", "#ffaa00", "#33ff77", "#cc66ff", "#ff3333", "#7fd4ff", "#ffd166"]

# 巡航收集玩法的固定参数（后端模板化，LLM 不参与数值设计）
_VOYAGE_TIME_LIMIT = 15   # 限时（秒）
_VOYAGE_PASS_SCORE = 150  # 达标分数（浮标 +10 / 障碍 -10，需净撞 15 个浮标）

# 频段截听玩法的固定参数（后端模板化，LLM 只创作主题内容）
_RADIO_TOLERANCE = 0.2    # 锁定容差（MHz）
_RADIO_HOLD_MS = 1500     # 波形对齐后需稳定的时长（毫秒）
_RADIO_TIME_LIMIT = 30    # 调频限时（秒）

# 现场搜证玩法的固定参数
_SEARCH_TIME_LIMIT = 45   # 搜证限时（秒）

# 密码转盘玩法的固定参数（密码由后端随机生成，LLM 只创作主题内容）
_DIAL_CODE_LEN = 3        # 密码位数（数字 0~9，允许重复）
_DIAL_MAX_TRIES = 5       # 试拨次数上限

# 档案室迷宫玩法的固定参数（网格由后端程序化生成，保证可解）
_MAZE_SIZE = 11           # 网格边长（奇数，递归回溯法开凿）
_MAZE_TIME_LIMIT = 20     # 脱身限时（秒）
_MAZE_PATROL_COUNT = 3    # 巡逻光点数量
_MAZE_PATROL_CROSS_SEC = 6.0  # 光点横穿全图的基准耗时（秒），实际各灯有快有慢
_MAZE_CAUGHT_PENALTY = 3  # 被光点抓住扣减的秒数


def _gen_interference_bands(target: float, tolerance: float) -> list[dict]:
    """生成 2~3 个干扰频段：避开目标频率周围的锁定窗口，且彼此不重叠。

    进入干扰频段会重置稳定进度，逼迫玩家在扫频时减速辨识。
    """
    guard_lo = target - tolerance - 0.6
    guard_hi = target + tolerance + 0.6
    bands: list[dict] = []
    for _ in range(random.randint(2, 3)):
        for _try in range(20):
            width = round(random.uniform(0.8, 1.6), 1)
            lo = round(random.uniform(88.0, 108.0 - width), 1)
            hi = round(lo + width, 1)
            if hi < guard_lo - 0.5 or lo > guard_hi + 0.5:
                if all(hi + 0.5 < b["from"] or lo - 0.5 > b["to"] for b in bands):
                    bands.append({"from": lo, "to": hi})
                    break
    return bands


def _shuffle_until_different(items: list[dict]) -> list[dict]:
    """打乱卡片顺序；若打乱后与正确顺序一致则重洗（≤3 张时允许）"""
    if len(items) <= 2:
        return list(items)
    original_ids = [it["id"] for it in items]
    shuffled = list(items)
    for _ in range(10):
        random.shuffle(shuffled)
        if [it["id"] for it in shuffled] != original_ids:
            break
    return shuffled


def _colored(items: list[dict]) -> list[dict]:
    """为打乱后的卡片注入配色与展示序号"""
    out = []
    for i, it in enumerate(items):
        out.append({
            **it,
            "color": _CARD_COLORS[i % len(_CARD_COLORS)],
            "index": i + 1,
        })
    return out


def _dial_feedback(guess: str, secret: str) -> dict:
    """计算试拨反馈：A = 数字与位置均正确，B = 数字正确但位置不对"""
    a = sum(1 for g, s in zip(guess, secret) if g == s)
    matched = sum(min(guess.count(d), secret.count(d)) for d in set(guess) | set(secret))
    return {"guess": guess, "a": a, "b": matched - a}


def _gen_maze(rows: int, cols: int) -> tuple[list[list[int]], list[int], list[int]]:
    """递归回溯法生成迷宫网格（1=墙 0=路），入口左上、出口右下，保证连通。

    Returns:
        (grid, start, exit)：网格二维数组与入口/出口坐标 [行, 列]
    """
    grid = [[1] * cols for _ in range(rows)]

    def carve(r: int, c: int) -> None:
        grid[r][c] = 0
        for dr, dc in random.sample([(2, 0), (-2, 0), (0, 2), (0, -2)], 4):
            nr, nc = r + dr, c + dc
            if 1 <= nr < rows - 1 and 1 <= nc < cols - 1 and grid[nr][nc] == 1:
                grid[r + dr // 2][c + dc // 2] = 0
                carve(nr, nc)

    carve(1, 1)
    return grid, [1, 1], [rows - 2, cols - 2]


def _gen_patrol_spawns(cols: int, rows: int, start: list[int],
                       count: int = 3, min_dist: float = 3.0) -> list[dict]:
    """为巡逻光点挑出生点：画布内连续坐标（以格为单位，无视墙壁），
    离入口足够远、彼此不贴脸（防开局阴人）；速度按横穿全图基准耗时上下浮动。

    Returns:
        [{"x", "y", "speed"}]：出生点中心坐标与速度（格/秒），方向由前端随机
    """
    sx, sy = start[1] + 0.5, start[0] + 0.5
    base_speed = max(cols, rows) / _MAZE_PATROL_CROSS_SEC
    spawns: list[dict] = []
    for _ in range(400):
        if len(spawns) >= count:
            break
        x = random.uniform(0.5, cols - 0.5)
        y = random.uniform(0.5, rows - 0.5)
        if (x - sx) ** 2 + (y - sy) ** 2 < min_dist ** 2:
            continue
        if all((x - s["x"]) ** 2 + (y - s["y"]) ** 2 >= 4.0 for s in spawns):
            spawns.append({
                "x": round(x, 2), "y": round(y, 2),
                "speed": round(base_speed * random.uniform(0.7, 1.3), 2),
            })
    return spawns


def _render_minigame(kind: str, data: dict, material: dict) -> tuple[dict, dict]:
    """将校验通过的 LLM 输出渲染为前端 GAME_DATA 与服务端答案键。

    Returns:
        (game_data, answer_key)：game_data 下发前端（不含答案），
        answer_key 留存服务端用于判定。
    """
    game_id = uuid.uuid4().hex[:8]
    base_title = str(data.get("title") or "").strip() or f"{material['title']}·{_KIND_TITLES[kind]}"

    if kind == "clue":
        clues = _colored(_shuffle_until_different([
            {
                "id": str(c["id"]).strip(),
                "text": str(c["text"]).strip(),
                "source": str(c["source"]).strip(),
            }
            for c in data["clues"]
        ]))
        correct_id = str(data["correctClueId"]).strip()
        correct_clue = next((c for c in clues if c["id"] == correct_id), {})
        correct_text = correct_clue.get("text", "")
        game_data = {
            "type": "clue",
            "gameId": game_id,
            "title": base_title,
            "question": str(data["question"]).strip(),
            "clues": clues,
        }
        answer_key = {
            "kind": kind, "answer": correct_id,
            "correctDisplay": correct_text,
            # 先揭示来源缩小范围，再揭示首字（不直接把答案卡片指给玩家）
            "hintSteps": [
                f"正确线索的来源是：{correct_clue.get('source', '')}",
                f"正确线索的内容以「{correct_text[:1]}」开头",
            ],
        }
    elif kind == "cipher":
        answer = str(data["answer"]).strip()
        rule = str(data.get("rule", "")).strip()
        # 密文由后端按模板生成，确保规则与答案严格自洽
        if rule in ("acrostic", "tail"):
            cipher_text = "；".join(str(s).strip() for s in data["sentences"])
        else:
            cipher_text = answer[::-1]
        game_data = {
            "type": "puzzle",
            "mode": "cipher",
            "gameId": game_id,
            "title": base_title,
            "story": str(data.get("story", "")).strip(),
            "cipherText": cipher_text,
            "hint": _CIPHER_HINTS[rule],
            "answerLength": len(answer),
        }
        answer_key = {
            "kind": kind, "answer": answer,
            "correctDisplay": answer,
            # 逐次答错逐次多揭示答案前缀（对猜词类玩法适用）
            "hintSteps": [f"答案的前 {n} 个字是：{answer[:n]}" for n in range(1, _MAX_ATTEMPTS)],
        }
    elif kind == "sequence":
        items = [
            {"id": str(it["id"]).strip(), "text": str(it["text"]).strip()}
            for it in data["items"]
        ]
        correct_order = [it["id"] for it in items]  # LLM 按正确顺序输出
        shuffled = _colored(_shuffle_until_different(items))
        correct_texts = [
            next(it["text"] for it in items if it["id"] == cid) for cid in correct_order
        ]
        game_data = {
            "type": "puzzle",
            "mode": "sequence",
            "gameId": game_id,
            "title": base_title,
            "question": "",
            "story": str(data.get("story", "")).strip(),
            "hint": str(data.get("hint", "")).strip(),
            "items": shuffled,
        }
        answer_key = {
            "kind": kind, "answer": correct_order,
            "correctDisplay": " → ".join(correct_texts),
            # 逐次答错逐次多揭示正确顺序的前缀
            "hintSteps": [
                f"正确顺序的前 {n} 个是：{' → '.join(correct_texts[:n])}"
                for n in range(1, _MAX_ATTEMPTS)
            ],
        }
    elif kind == "match":
        pairs = data["pairs"]
        lefts = [{"id": f"l{i + 1}", "text": str(p["left"]).strip()} for i, p in enumerate(pairs)]
        rights = [{"id": f"r{i + 1}", "text": str(p["right"]).strip()} for i, p in enumerate(pairs)]
        random.shuffle(rights)  # 右栏打乱；左右用不透明 id，不泄露配对关系
        game_data = {
            "type": "match",
            "gameId": game_id,
            "title": base_title,
            "question": str(data["question"]).strip(),
            "lefts": lefts,
            "rights": rights,
        }
        answer_key = {
            "kind": kind,
            "answer": {f"l{i + 1}": f"r{i + 1}" for i in range(len(pairs))},
            "correctDisplay": "；".join(
                f"{str(p['left']).strip()} → {str(p['right']).strip()}" for p in pairs
            ),
            # 逐次答错逐次多揭示一组完整配对
            "hintSteps": [
                "已确认的配对：" + "；".join(
                    f"{str(p['left']).strip()} ↔ {str(p['right']).strip()}" for p in pairs[:n]
                )
                for n in range(1, _MAX_ATTEMPTS)
            ],
        }
    elif kind == "classify":
        categories = data["categories"]
        cat_remap = {str(c["id"]).strip(): f"c{i + 1}" for i, c in enumerate(categories)}
        cats = [
            {"id": cat_remap[str(c["id"]).strip()], "name": str(c["name"]).strip()}
            for c in categories
        ]
        items = []
        answer_map: dict[str, str] = {}
        for i, it in enumerate(data["items"]):
            iid = f"i{i + 1}"
            items.append({"id": iid, "text": str(it["text"]).strip()})
            answer_map[iid] = cat_remap[str(it["categoryId"]).strip()]
        random.shuffle(items)
        cat_names = {c["id"]: c["name"] for c in cats}
        game_data = {
            "type": "classify",
            "gameId": game_id,
            "title": base_title,
            "question": str(data["question"]).strip(),
            "categories": cats,
            "items": items,
        }
        # 提示按原始条目顺序逐次揭示正确归属（不直接给全部）
        reveal_pool = [
            f"「{str(it['text']).strip()}」应放入「{cat_names[cat_remap[str(it['categoryId']).strip()]]}」"
            for it in data["items"]
        ]
        answer_key = {
            "kind": kind, "answer": answer_map,
            "correctDisplay": "；".join(
                f"{it['text']} → {cat_names[answer_map[it['id']]]}" for it in items
            ),
            "hintSteps": [
                "已确认的归类：" + "；".join(reveal_pool[:n])
                for n in range(1, _MAX_ATTEMPTS)
            ],
        }
    elif kind == "unlock":
        steps_out: list[dict] = []
        expected: list[str] = []
        correct_texts: list[str] = []
        step_hints: list[str] = []
        for i, st in enumerate(data["steps"]):
            opts = [
                {"id": str(o["id"]).strip(), "text": str(o["text"]).strip()}
                for o in st["options"]
            ]
            steps_out.append({
                "id": f"s{i + 1}",
                "prompt": str(st["prompt"]).strip(),
                "options": opts,
            })
            correct = str(st["correctId"]).strip()
            expected.append(correct)
            correct_texts.append(next(o["text"] for o in opts if o["id"] == correct))
            step_hints.append(str(st.get("hint", "")).strip())
        archive_raw = data.get("archive") or {}
        game_data = {
            "type": "unlock",
            "gameId": game_id,
            "title": base_title,
            "story": str(data.get("story", "")).strip(),
            "steps": steps_out,
        }
        answer_key = {
            "kind": kind, "answer": expected,
            "correctDisplay": " → ".join(correct_texts),
            # 逐层即时判定：层内答错时用该层 hint，不用全局前缀揭示
            "stepHints": step_hints,
            "progress": 0,
            # 档案只在结算成功时随结果下发，不提前进入 game_data
            "archive": {
                "title": str(archive_raw.get("title", "")).strip() or "封存档案",
                "content": str(archive_raw.get("content", "")).strip(),
            },
        }
    elif kind == "shuffle":
        pieces = [
            {"id": str(p["id"]).strip(), "text": str(p["text"]).strip()}
            for p in data["pieces"]
        ]
        correct_order = [p["id"] for p in pieces]  # LLM 按正确阅读顺序输出
        shuffled = _colored(_shuffle_until_different(pieces))
        cols = 3 if len(pieces) in (6, 9) else 4  # 6→3×2 / 8→4×2 / 9→3×3
        rows = len(pieces) // cols
        doc_title = str(data.get("docTitle", "")).strip()
        correct_texts = [next(p["text"] for p in pieces if p["id"] == cid) for cid in correct_order]
        game_data = {
            "type": "shuffle",
            "gameId": game_id,
            "title": base_title,
            "story": str(data.get("story", "")).strip(),
            "docTitle": doc_title,
            "cols": cols,
            "rows": rows,
            "pieces": shuffled,
        }
        answer_key = {
            "kind": kind, "answer": correct_order,
            "correctDisplay": f"{doc_title}：" + "".join(correct_texts),
            # 逐次答错逐次多揭示正确拼法的前缀
            "hintSteps": [
                f"正确顺序的前 {n} 片是：{' → '.join(correct_texts[:n])}"
                for n in range(1, _MAX_ATTEMPTS)
            ],
        }
    elif kind == "radio":
        # 目标频率与干扰频段由后端生成；下发 targetFreq 供对齐波形渲染，
        # 判定仍以服务端为准（与 voyage 同属技巧类玩法的上报模式）
        target = round(random.uniform(88.0, 107.5), 1)
        call_sign = str(data.get("callSign", "")).strip()
        game_data = {
            "type": "radio",
            "gameId": game_id,
            "title": base_title,
            "story": str(data.get("story", "")).strip(),
            "callSign": call_sign,
            "targetFreq": target,
            "tolerance": _RADIO_TOLERANCE,
            "holdMs": _RADIO_HOLD_MS,
            "timeLimit": _RADIO_TIME_LIMIT,
            "interference": _gen_interference_bands(target, _RADIO_TOLERANCE),
        }
        answer_key = {
            "kind": kind, "answer": target,
            "correctDisplay": f"调至 {target:.1f} MHz，保持波形对齐稳定 {_RADIO_HOLD_MS / 1000:.1f} 秒",
            "hintSteps": [
                f"目标频率在 {int(target)} MHz 附近频段，放慢速度扫频",
                "波形对齐后稳住旋钮保持 1.5 秒才能截获；红色干扰频段会重置稳定进度",
            ],
            # 密电只在截获成功时随结果下发，不提前进入 game_data
            "intercept": {
                "callSign": call_sign,
                "text": str(data.get("interceptText", "")).strip(),
            },
        }
    elif kind == "search":
        items: list[dict] = []
        target_ids: list[str] = []
        target_names: list[str] = []
        for i, it in enumerate(data["items"]):
            iid = f"i{i + 1}"  # 不透明 id，避免命名模式泄露目标
            name = str(it["name"]).strip()
            items.append({"id": iid, "name": name, "desc": str(it["desc"]).strip()})
            if bool(it.get("isTarget")):
                target_ids.append(iid)
                target_names.append(name)
        random.shuffle(items)  # 陈列架摆放打乱
        game_data = {
            "type": "search",
            "gameId": game_id,
            "title": base_title,
            "story": str(data.get("story", "")).strip(),
            "targetDesc": str(data.get("targetDesc", "")).strip(),
            "targetCount": len(target_ids),
            "timeLimit": _SEARCH_TIME_LIMIT,
            "items": items,
        }
        answer_key = {
            "kind": kind, "answer": target_ids,
            "correctDisplay": "、".join(target_names),
            # 逐次答错逐次揭示一个已确认的目标证物
            "hintSteps": [
                "已确认的证物：" + "、".join(target_names[:n])
                for n in range(1, min(_MAX_ATTEMPTS, len(target_names)) + 1)
            ],
        }
    elif kind == "dial":
        # 密码由 LLM 设计与谜面提示挂钩（校验保证格式与不直含密码），
        # 后端只做判定与试拨反馈，答案不下发前端
        secret = str(data["secret"]).strip()
        hint_clue = str(data.get("hintClue", "")).strip()
        game_data = {
            "type": "dial",
            "gameId": game_id,
            "title": base_title,
            "story": str(data.get("story", "")).strip(),
            "lockNote": str(data.get("lockNote", "")).strip(),
            "lockMark": str(data.get("lockMark", "")).strip(),
            "codeLength": _DIAL_CODE_LEN,
        }
        answer_key = {
            "kind": kind, "answer": secret,
            "correctDisplay": f"密码：{secret}",
            # 逐次答错逐次加深揭示：先给更明确的来历线索，再逐位揭示真实密码
            "hintSteps": [
                hint_clue,
                f"密码的第 1 位是 {secret[0]}",
                f"密码的前 {_DIAL_CODE_LEN - 1} 位是 {secret[:_DIAL_CODE_LEN - 1]}",
            ],
        }
    elif kind == "maze":
        # 网格由后端程序化生成保证可解；前端限时内抵达出口后上报，
        # 与 voyage 同属技巧类玩法的上报模式
        grid, start, exit_cell = _gen_maze(_MAZE_SIZE, _MAZE_SIZE)
        spawns = _gen_patrol_spawns(_MAZE_SIZE, _MAZE_SIZE, start, _MAZE_PATROL_COUNT)
        game_data = {
            "type": "maze",
            "gameId": game_id,
            "title": base_title,
            "story": str(data.get("story", "")).strip(),
            "mapNote": str(data.get("mapNote", "")).strip(),
            "rows": _MAZE_SIZE,
            "cols": _MAZE_SIZE,
            "grid": grid,
            "start": start,
            "exit": exit_cell,
            "timeLimit": _MAZE_TIME_LIMIT,
            "patrols": spawns,              # 巡逻光点出生点 {x, y, speed}（格坐标）
            "caughtPenalty": _MAZE_CAUGHT_PENALTY,
        }
        answer_key = {
            "kind": kind, "answer": True,
            "correctDisplay": (f"在 {_MAZE_TIME_LIMIT} 秒内从入口抵达出口"
                               f"（被巡逻光点照到扣 {_MAZE_CAUGHT_PENALTY} 秒）"),
            "hintSteps": [
                f"提示：光点无视墙壁在全图游动，有快有慢，看准走向钻空子，被照到会扣 {_MAZE_CAUGHT_PENALTY} 秒",
                "再试一次：贴着一侧墙壁摸索前进，遇死路退回最近的岔口，别和光点抢同一条路",
            ],
        }
    else:  # voyage：玩法数值由后端模板化，LLM 只提供主题内容
        labels = [str(t["label"]).strip() for t in data["targets"]]
        game_data = {
            "type": "voyage",
            "gameId": game_id,
            "title": base_title,
            "story": str(data.get("story", "")).strip(),
            "targets": labels,
            "timeLimit": _VOYAGE_TIME_LIMIT,
            "passScore": _VOYAGE_PASS_SCORE,
        }
        answer_key = {
            "kind": kind, "answer": _VOYAGE_PASS_SCORE,
            "correctDisplay": f"在 {_VOYAGE_TIME_LIMIT} 秒内达到 {_VOYAGE_PASS_SCORE} 分（撞到记忆浮标 +10，碰到暗礁/障碍 -10）",
            # 达标类玩法没有可逐步揭示的答案，给固定策略提示
            "hintSteps": [
                f"策略提示：优先撞浮标（+10），避开暗礁与游动障碍（-10），{_VOYAGE_TIME_LIMIT} 秒内需净攒 {_VOYAGE_PASS_SCORE} 分",
                f"再试一次：贴着浮标出现的水域巡航，别贪路线去碰障碍",
            ],
        }

    answer_key.update({
        "successText": str(data.get("successText", "")).strip() or "挑战成功！",
        "failureText": str(data.get("failureText", "")).strip() or "挑战失败……",
        "attemptsLeft": _MAX_ATTEMPTS,
        "maxAttempts": _MAX_ATTEMPTS,
    })
    game_data["maxAttempts"] = _MAX_ATTEMPTS
    if kind == "dial":
        # 转盘玩法有独立的试拨预算，需在通用更新之后覆盖
        answer_key["attemptsLeft"] = _DIAL_MAX_TRIES
        answer_key["maxAttempts"] = _DIAL_MAX_TRIES
        game_data["maxAttempts"] = _DIAL_MAX_TRIES
    return game_data, answer_key


# ═══════════════════════════════════════════════════════
# 待判定游戏暂存与判定（答案不下发前端）
# ═══════════════════════════════════════════════════════

_PENDING_GAMES: dict[str, dict] = {}
_MAX_PENDING = 64
# 玩家作答次数上限（含首次），答错时逐次揭示答案前缀
_MAX_ATTEMPTS = 3


def _store_pending(game_id: str, answer_key: dict) -> None:
    """暂存答案键；超限时按插入顺序淘汰最旧条目"""
    while len(_PENDING_GAMES) >= _MAX_PENDING:
        _PENDING_GAMES.pop(next(iter(_PENDING_GAMES)))
    _PENDING_GAMES[game_id] = answer_key


def judge_minigame(game_id: str, answer) -> dict:
    """判定玩家作答，支持有限次重试（默认 3 次），每次答错按玩法揭示针对性提示。

    unlock 逐层协议：answer = {"partial": True, "selection": 选项 id} 时逐层即时判定，
    选对进入下一层，最后一层选对直接结算成功（附带解锁的 archive）；
    传完整选项 id 列表则一次性整体判定（兼容）。

    Returns:
        终局：{success, successText, failureText, correctAnswer, final: True, [archive]}
        非终局（仍有重试机会）：{success: False, final: False,
            attemptsLeft, revealHint, failureText}
        非终局（unlock 逐层通过）：{success: True, final: False, layerCleared: True, stepIndex}
    Raises:
        KeyError: game_id 不存在或已结算
    """
    key = _PENDING_GAMES.get(game_id)
    if key is None:
        raise KeyError("小游戏不存在或已结算")

    kind = key["kind"]
    extra: dict = {}  # 随结果附带的玩法专属反馈（如 dial 的 A/B 反馈）

    # unlock 逐层即时判定（不结算，进度保留在 answer_key 上）
    if kind == "unlock" and isinstance(answer, dict) and answer.get("partial"):
        return _judge_unlock_layer(game_id, key, answer.get("selection"))

    if kind == "cipher":
        norm = lambda s: "".join(str(s).split()).lower()
        success = norm(answer) == norm(key["answer"])
    elif kind in ("sequence", "unlock"):
        expected = [str(x) for x in key["answer"]]
        given = [str(x) for x in answer] if isinstance(answer, list) else []
        success = given == expected
    elif kind in ("match", "classify"):
        expected_map = {str(k): str(v) for k, v in key["answer"].items()}
        given_map = {str(k): str(v) for k, v in answer.items()} if isinstance(answer, dict) else {}
        success = given_map == expected_map
    elif kind == "voyage":
        try:
            score = int(answer)
        except (TypeError, ValueError):
            score = -1
        success = score >= int(key["answer"])
    elif kind == "shuffle":
        expected = [str(x) for x in key["answer"]]
        given = [str(x) for x in answer] if isinstance(answer, list) else []
        success = given == expected
    elif kind == "radio":
        try:
            freq = float(answer)
        except (TypeError, ValueError):
            freq = None
        success = freq is not None and abs(freq - float(key["answer"])) <= float(key.get("tolerance", 0.2))
    elif kind == "search":
        expected_set = {str(x) for x in key["answer"]}
        given_set = {str(x) for x in answer} if isinstance(answer, list) else set()
        success = bool(given_set) and given_set == expected_set
    elif kind == "dial":
        guess = str(answer).strip()
        expected = str(key["answer"])
        success = guess == expected
        if not success:
            if len(guess) == len(expected) and guess.isdigit():
                extra["guessFeedback"] = _dial_feedback(guess, expected)
            else:
                extra["guessFeedback"] = {
                    "guess": guess, "a": 0, "b": 0,
                    "formatError": f"请拨入 {len(expected)} 位数字（0~9，可重复）",
                }
    elif kind == "maze":
        if isinstance(answer, dict):
            success = bool(answer.get("reached"))
        else:
            success = bool(answer)
    else:  # clue
        success = str(answer).strip() == str(key["answer"]).strip()

    if success:
        _PENDING_GAMES.pop(game_id, None)
        result = {
            "success": True,
            "successText": key["successText"],
            "failureText": key["failureText"],
            "correctAnswer": key["correctDisplay"],
            "final": True,
        }
        if kind == "unlock" and key.get("archive"):
            result["archive"] = key["archive"]
        if kind == "radio" and key.get("intercept"):
            result["intercept"] = key["intercept"]
        return result

    # 答错：扣减重试次数，未耗尽则按玩法揭示针对性提示
    attempts_left = key.get("attemptsLeft", _MAX_ATTEMPTS) - 1
    key["attemptsLeft"] = attempts_left
    if attempts_left > 0:
        revealed = int(key.get("maxAttempts", _MAX_ATTEMPTS)) - attempts_left
        hint_steps = key.get("hintSteps") or []
        if hint_steps:
            reveal_hint = hint_steps[min(revealed, len(hint_steps)) - 1]
        else:
            reveal_hint = ""
        return {
            "success": False,
            "final": False,
            "attemptsLeft": attempts_left,
            "revealHint": reveal_hint,
            "failureText": key["failureText"],
            **extra,
        }

    _PENDING_GAMES.pop(game_id, None)
    return {
        "success": False,
        "successText": key["successText"],
        "failureText": key["failureText"],
        "correctAnswer": key["correctDisplay"],
        "final": True,
        **extra,
    }


def _judge_unlock_layer(game_id: str, key: dict, selection) -> dict:
    """unlock 逐层即时判定：选对进入下一层，选错扣机会并给该层提示。

    进度保留在 key["progress"]：答错不退回已通过的层；
    最后一层选对直接结算成功并随结果下发 archive。
    """
    expected = [str(x) for x in key["answer"]]
    step_hints = key.get("stepHints") or []
    progress = int(key.get("progress", 0))
    sel = str(selection or "").strip()

    if sel and progress < len(expected) and sel == expected[progress]:
        progress += 1
        key["progress"] = progress
        if progress >= len(expected):
            _PENDING_GAMES.pop(game_id, None)
            result = {
                "success": True,
                "successText": key["successText"],
                "failureText": key["failureText"],
                "correctAnswer": key["correctDisplay"],
                "final": True,
            }
            if key.get("archive"):
                result["archive"] = key["archive"]
            return result
        return {
            "success": True,
            "final": False,
            "layerCleared": True,
            "stepIndex": progress,
            "attemptsLeft": key.get("attemptsLeft", _MAX_ATTEMPTS),
        }

    # 本层选错：扣减机会，保留进度，给出该层提示
    attempts_left = key.get("attemptsLeft", _MAX_ATTEMPTS) - 1
    key["attemptsLeft"] = attempts_left
    if attempts_left > 0:
        return {
            "success": False,
            "final": False,
            "layerCleared": False,
            "attemptsLeft": attempts_left,
            "revealHint": step_hints[progress] if progress < len(step_hints) else "",
            "failureText": key["failureText"],
        }

    _PENDING_GAMES.pop(game_id, None)
    return {
        "success": False,
        "successText": key["successText"],
        "failureText": key["failureText"],
        "correctAnswer": key["correctDisplay"],
        "final": True,
    }


# ═══════════════════════════════════════════════════════
# 主入口
# ═══════════════════════════════════════════════════════

def generate_minigame(adapter, kind: str, max_retries: int = 1,
                      scene_context: dict | None = None) -> dict:
    """生成指定玩法的小游戏数据（GAME_DATA）。

    Args:
        adapter: 已 load 的 GenericScriptAdapter
        kind: 玩法类型（clue/cipher/sequence/match/classify/unlock/voyage/
            shuffle/radio/search，兼容别名 puzzle/dossier）
        max_retries: 校验失败后的重试次数（重试时携带错误反馈）
        scene_context: 剧情内嵌模式的场景上下文
            {choice_text, hint, narration, dialogues, history}，
            传入后生成内容会衔接当下剧情；独立试玩模式传 None
    Returns:
        前端可直接渲染的 GAME_DATA dict（含 gameId，答案已留存服务端）
    Raises:
        ValueError: 玩法非法、素材不足或重试耗尽仍未通过校验
    """
    kind = normalize_kind(kind)
    if kind not in VALID_KINDS:
        raise ValueError(f"未知玩法类型: {kind}（可选：{'/'.join(VALID_KINDS)}）")

    material = extract_minigame_material(adapter)
    client = _build_minigame_client()
    system_prompt = _SYSTEM_PROMPTS[kind]

    errors: list[str] | None = None
    for attempt in range(max_retries + 1):
        user_prompt = _build_user_prompt(material, errors, scene_context)
        try:
            data = client.generate_json(
                system_prompt, user_prompt, expect_type=dict, retries=1,
            )
        except ValueError as e:
            logger.warning("[minigame:%s] 第 %d 次 LLM 调用 JSON 解析失败: %s", kind, attempt + 1, e)
            errors = ["输出不是合法 JSON，请只输出 JSON 对象"]
            continue

        errors = _validate_minigame(kind, data)
        if not errors:
            game_data, answer_key = _render_minigame(kind, data, material)
            _store_pending(game_data["gameId"], answer_key)
            logger.info("[minigame:%s] 生成成功（第 %d 次尝试）: %s", kind, attempt + 1, game_data.get("title"))
            return game_data
        logger.warning("[minigame:%s] 第 %d 次尝试校验未通过: %s", kind, attempt + 1, errors)

    raise ValueError(f"小游戏生成失败（重试耗尽）：{'；'.join(errors or ['未知错误'])}")
