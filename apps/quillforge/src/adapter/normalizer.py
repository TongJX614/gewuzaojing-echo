# -*- coding: utf-8 -*-
"""
adapter.normalizer — 角色字段归一化与缺失推断

从 generic_adapter.py 提取的 _fill_character_gaps 函数。
"""

from __future__ import annotations

import re


def fill_character_gaps(characters: list[dict]) -> None:
    """从 personality/backstory 文本中推断缺失的角色字段（降级策略）"""
    # 收集所有角色名，用于关系推断
    all_names = [c.get("name", "") for c in characters]

    for c in characters:
        personality = c.get("personality", "")
        backstory = c.get("background", "")
        role = c.get("role", "")
        combined = f"{personality}。{backstory}"

        # ── motivation: 从 backstory 中提取目的/动机 ──
        if not c.get("motivation"):
            patterns = [
                r'(为了[^，。；\n]{3,40})',
                r'(急需[^，。；\n]{3,30})',
                r'(想要[^，。；\n]{3,30})',
                r'(前来[^，。；\n]{3,30})',
                r'(特意[^，。；\n]{3,30})',
                r'(赶来[^，。；\n]{3,30})',
                r'(需要[^，。；\n]{3,30})',
                r'(决心[^，。；\n]{3,30})',
                r'(一直在[^，。；\n]{3,30})',
                r'(不愿[^，。；\n]{3,25})',
                r'(坚持[^，。；\n]{3,25})',
            ]
            for pat in patterns:
                m = re.search(pat, backstory)
                if m:
                    c["motivation"] = m.group(1).strip()
                    break
            if not c.get("motivation") and personality:
                trait = re.search(r'([^\s，。；]{2,6}(?:感|欲|心|力))', personality)
                if trait:
                    c["motivation"] = f"{trait.group(1)}驱使"
            if not c.get("motivation"):
                c["motivation"] = f"基于{role.split('/')[0].strip()}身份参与故事"

        # ── secrets: 从 backstory 中提取隐藏信息 ──
        if not c.get("secrets"):
            patterns = [
                r'([^，。；\n]{0,10}(?:不知道的是|秘密|隐藏|隐瞒)[^。；\n]{3,50})',
                r'([^，。；\n]{0,10}(?:始终拒绝|不愿|不敢|未曾|始终)[^。；\n]{3,40})',
                r'([^，。；\n]{0,10}(?:其实|实际上|真相是|真相)[^。；\n]{3,40})',
                r'([^，。；\n]{0,10}(?:耿耿于怀|心事|愧疚|负罪)[^。；\n]{3,40})',
                r'([^，。；\n]{0,10}(?:被窃取|被夺走|失去|丧失)[^。；\n]{3,40})',
                r'([^，。；\n]{0,5}(?:但他|但她)[^。；\n]{0,5}(?:越|其实|从不)[^。；\n]{3,30})',
            ]
            for pat in patterns:
                m = re.search(pat, combined)
                if m:
                    secret = m.group(1).strip()
                    if len(secret) > 80:
                        secret = secret[:80] + "…"
                    c["secrets"] = secret
                    break
            if not c.get("secrets"):
                c["secrets"] = "故事中逐渐揭示的隐藏过往"

        # ── relationships: 从 backstory 提取与其他角色的关系 ──
        if not c.get("relationships"):
            rel_patterns = [
                # 亲属
                r'([^，。；\n]{0,10}(?:父亲|母亲|女儿|儿子|姐姐|妹妹|哥哥|弟弟|外婆|爷爷|奶奶|丈夫|妻子)[^。；\n]{3,40})',
                # 社交关系
                r'([^，。；\n]{0,10}(?:搭档|同事|朋友|上司|下属|对手|闺蜜|青梅竹马|导师|恩师|患者)[^。；\n]{3,30})',
                # 暗恋/恋爱
                r'([^，。；\n]{0,10}(?:暗恋|相恋|喜欢|心动|恋[爱人])[^。；\n]{3,30})',
            ]
            rels = []
            for pat in rel_patterns:
                for m in re.finditer(pat, combined):
                    rel = m.group(1).strip()
                    if len(rel) > 60:
                        rel = rel[:60] + "…"
                    rels.append(rel)
                    if len(rels) >= 2:
                        break
                if rels:
                    break
            # 尝试通过其他角色名匹配关系
            if not rels:
                my_name = c.get("name", "")
                for other in all_names:
                    if other and other != my_name and other in backstory:
                        idx = backstory.find(other)
                        start = max(0, idx - 15)
                        end = min(len(backstory), idx + len(other) + 30)
                        snippet = backstory[start:end].strip()
                        rels.append(snippet)
                        if len(rels) >= 2:
                            break
            if rels:
                c["relationships"] = "；".join(rels)
            else:
                c["relationships"] = "与其他角色在故事进程中逐步建立联系"

        # ── appearance: 从 personality 中提取外貌/气质相关描述 ──
        if not c.get("appearance"):
            patterns = [
                r'([^，。；\n]{0,10}(?:外表|外貌|穿着|装扮|形象|随[^，。\n]{0,6}(?:携带|带着))[。；\n]{3,40})',
                r'([^，。；\n]{0,5}(?:眼神|笑容|声音|表情|目光|气质)[^。；\n]{3,35})',
                r'([^，。；\n]{0,5}(?:老人|老太|青年|年轻人|女孩|男孩|大叔)[^。；\n]{3,25})',
                r'([^，。；\n]{0,5}(?:饱经沧桑|温柔|知性|阳光|沉稳)[^。；\n]{0,5}(?:外表|气质|形象|感觉)[^。；\n]{3,20})',
            ]
            for pat in patterns:
                m = re.search(pat, personality)
                if m:
                    c["appearance"] = m.group(1).strip()
                    break
            if not c.get("appearance"):
                style = c.get("speakingStyle", "")
                if style:
                    style_match = re.search(r'([^，。；\n]{2,15}(?:温暖|冷静|沉稳|温柔|爽朗|沧桑|低沉|活泼)[^。；\n]{0,15})', style)
                    if style_match:
                        c["appearance"] = f"说话{style_match.group(1).strip()}"
            if not c.get("appearance"):
                c["appearance"] = f"符合{role.split('/')[0].strip()}身份的外表"

        # ── arc: 从 backstory 提取角色变化趋势 ──
        if not c.get("arc"):
            if backstory:
                patterns = [
                    r'([^，。；\n]{0,5}(?:发现|意识到|觉醒|改变|成长|面对|渐渐)[^。；\n]{3,40})',
                ]
                for pat in patterns:
                    m = re.search(pat, backstory)
                    if m:
                        c["arc"] = m.group(1).strip()
                        break
            if not c.get("arc"):
                c["arc"] = f"从{role.split('/')[0].strip()}身份出发，经历内心冲突后做出关键抉择"


# 向后兼容别名
_fill_character_gaps = fill_character_gaps
