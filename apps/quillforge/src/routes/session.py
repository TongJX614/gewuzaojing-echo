# -*- coding: utf-8 -*-
"""游戏会话路由：/api/session/{session_id}/*"""

from __future__ import annotations

import json
import concurrent.futures

from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse

from session_manager import ChoiceRequest
from dependencies import (
    get_harness,
    get_image_generator,
    get_tts_generator,
    sessions,
    settings,
)
from image_gen import (
    ImageGenerator, build_character_prompt, build_background_prompt,
    slugify, DEFAULT_BG_SIZE, DEFAULT_CHAR_SIZE,
)
from logger import get_logger

logger = get_logger("routes.session")

router = APIRouter(tags=["session"])

# 美术素材并行生成并发数
IMAGE_CONCURRENCY = settings.image_concurrency
# Phase 1 仅预加载第 1 个场景
IMAGE_BG_PRELOAD_COUNT = settings.image_bg_preload_count
# 单场景图片并发上限（超过则滑动窗口分批提交）
SCENE_IMAGE_CAP = settings.scene_image_cap
# TTS 并行生成并发数：典型场景对话 6-12 条，6 个 worker 可在 2 轮内处理完毕
TTS_CONCURRENCY = settings.tts_concurrency


@router.post("/api/session/{session_id}/generate")
def generate_scene(session_id: str):
    session = sessions.get(session_id)
    if not session:
        raise HTTPException(404, "会话不存在")
    return session.generate(get_harness())


@router.post("/api/session/{session_id}/generate-stream", summary="流式生成场景（SSE）")
def generate_scene_stream(session_id: str):
    """
    SSE 流式版本的场景生成。
    Pipeline 各阶段产出时立即推送给前端，无需等待全部完成。
    当 TTS 启用时，dialogue 事件之后会额外下发 tts 事件（音频URL），
    前端据此播放语音，旁白和动作旁白不发语音。
    """
    session = sessions.get(session_id)
    if not session:
        raise HTTPException(404, "会话不存在")

    # 预检：在返回 200 流之前拦截非法状态，避免 SSE 中途抛异常导致前端无错误反馈
    from session_manager import SessionState
    if session.state == SessionState.GENERATED:
        raise HTTPException(400, "当前场景已生成，请先做出选择后才能继续")
    if session.state == SessionState.MINIGAME:
        raise HTTPException(400, "小游戏进行中，请先完成或取消小游戏")
    if session.state == SessionState.FINISHED:
        raise HTTPException(400, "故事已结束")
    if session.current_scene_index >= session.total_scenes:
        raise HTTPException(400, "没有更多场景")

    tts_gen = get_tts_generator()
    script_slug = slugify(session.adapter.title)
    characters = session.adapter.characters or []

    def event_stream():
        import concurrent.futures as _cf
        tts_futures: dict = {}

        queue_idx = -1
        narration_streaming = False  # 是否处于流式旁白中（narration_start → narration）
        narration_counted = False    # 当前旁白是否已计入行号（流式首个 delta 或独立 narration）

        with _cf.ThreadPoolExecutor(max_workers=TTS_CONCURRENCY) as tts_pool:
            try:
                stream_iter = session.generate_stream(get_harness())
            except Exception as e:
                logger.error("[session] generate_stream 初始化失败: %s", e)
                err = json.dumps({"event": "error", "message": f"生成失败: {e}"}, ensure_ascii=False)
                yield f"event: error\ndata: {err}\n\n"
                return
            for evt in stream_iter:
                evt_type = evt.get("event", "message")

                # ── 验证重试：前端会清空行队列重建，后端必须同步重置行号并丢弃旧尝试的 TTS。
                # 否则 queue_idx 按累计行数继续递增，重试后 tts.lineIdx 超出前端
                # 实际行号范围，音频永远匹配不上（首场景无语音）。
                if evt_type == "retry":
                    for _old_fut in tts_futures:
                        _old_fut.cancel()
                    tts_futures.clear()
                    queue_idx = -1
                    narration_streaming = False
                    narration_counted = False

                if evt_type == "narration_start":
                    narration_streaming = True
                    narration_counted = False
                elif evt_type == "narration_delta":
                    if narration_streaming and not narration_counted:
                        queue_idx += 1
                        narration_counted = True
                elif evt_type == "narration":
                    # 流式收尾（已计行）不重复计；独立 narration（保底重推）计一行
                    if not narration_counted:
                        queue_idx += 1
                    narration_streaming = False
                    narration_counted = False
                elif evt_type in ("dialogue", "action"):
                    queue_idx += 1

                # 首句 dialogue 不再同步阻塞生成 TTS（旧设计）：遇服务商 429 限流时
                # 会把第一句文字拖慢 6s+，用户看到长时间转圈。现统一走下方异步提交，
                # 文字立即下发，音频按 lineIdx 迟到补挂。

                # ── 正常流程：先下发事件 ──
                payload = json.dumps(evt, ensure_ascii=False)
                yield f"event: {evt_type}\ndata: {payload}\n\n"

                # 拦截后续 dialogue 事件：异步提交 TTS 任务
                if evt_type == "dialogue" and tts_gen.enabled:
                    speaker = evt.get("speaker", "")
                    text = evt.get("text", "")
                    if speaker and text:
                        voice_id = tts_gen.get_voice_id(speaker, characters)
                        fut = tts_pool.submit(
                            tts_gen.generate, script_slug, speaker, text, voice_id
                        )
                        tts_futures[fut] = (speaker, queue_idx)

                # 非阻塞地收取已完成的 TTS 结果
                _done = [f for f in tts_futures if f.done()]
                for fut in _done:
                    _speaker, _idx = tts_futures.pop(fut)
                    try:
                        _url = fut.result()
                        if _url:
                            _tts_evt = {"event": "tts", "speaker": _speaker,
                                        "url": _url, "lineIdx": _idx}
                            _tts_payload = json.dumps(_tts_evt, ensure_ascii=False)
                            yield f"event: tts\ndata: {_tts_payload}\n\n"
                    except Exception as e:
                        logger.warning("[session] TTS 异步结果获取失败: %s", e)

            # 主流结束后，等待所有 TTS 任务完成并下发
            if tts_futures:
                for fut in _cf.as_completed(tts_futures):
                    _speaker, _idx = tts_futures.pop(fut)
                    try:
                        _url = fut.result()
                        if _url:
                            _tts_evt = {"event": "tts", "speaker": _speaker,
                                        "url": _url, "lineIdx": _idx}
                            _tts_payload = json.dumps(_tts_evt, ensure_ascii=False)
                            yield f"event: tts\ndata: {_tts_payload}\n\n"
                    except Exception as e:
                        logger.warning("[session] TTS 最终结果获取失败: %s", e)

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )


@router.get("/api/session/{session_id}/assets-stream", summary="预生成美术素材（SSE）")
def assets_stream(session_id: str):
    """
    分两阶段预生成美术素材（SSE 推送进度）：
      Phase 1（阻塞）：仅第 1 个场景的背景 + 出场角色立绘 → assets_ready
        并发上限 SCENE_IMAGE_CAP(9) 张，超过则滑动窗口分批提交，
        必须全部完成才放行进入剧情。
      Phase 2（后台）：剩余场景背景 + 剩余角色立绘，异步生成并推送热更新
    """
    session = sessions.get(session_id)
    if not session:
        raise HTTPException(404, "会话不存在")

    gen = get_image_generator()
    script_slug = slugify(session.adapter.title)
    characters = session.adapter.characters or []
    scenes = session.adapter.scenes or []

    # ─── 按需生图：只为至少出现在一个场景中的角色生成立绘 ───
    _all_scene_refs: set[str] = set()
    for _s in scenes:
        for _ref in (_s.get("characters_present", []) or []):
            _all_scene_refs.add(str(_ref).strip())
    _referenced_chars: list[dict] = []
    for _c in characters:
        _cid = str(_c.get("id", "")).strip()
        _cname = str(_c.get("name", "")).strip()
        if _cid in _all_scene_refs or _cname in _all_scene_refs:
            _referenced_chars.append(_c)
    if not _referenced_chars and characters:
        _referenced_chars = characters

    def event_stream():
        char_urls: dict[str, str] = {}
        scene_urls: dict[str, str] = {}

        char_tasks: list[dict] = []
        bg_tasks: list[dict] = []

        for c in _referenced_chars:
            name = str(c.get("name", "")).strip()
            cid = str(c.get("id", "") or name)
            if not name:
                continue
            char_tasks.append({"kind": "character", "cache_kind": "char", "cache_id": cid,
                               "name": name, "prompt": build_character_prompt(c),
                               "size": DEFAULT_CHAR_SIZE, "store": ("char", name, ""),
                               "_cid": cid})

        bg_sources = session.adapter.get_scene_bg_sources()
        for i, s in enumerate(scenes):
            sid = str(s.get("id", "") or s.get("name", ""))
            sname = str(s.get("name", "") or sid)
            asset = bg_sources[i] if i < len(bg_sources) else s
            bg_tasks.append({"kind": "scene", "cache_kind": "bg", "cache_id": sid,
                             "name": sname, "prompt": build_background_prompt(asset),
                             "size": DEFAULT_BG_SIZE, "store": ("scene", sid, sname)})

        # ─── 确定第 1 个场景中出场的角色 ───
        preload_n = min(IMAGE_BG_PRELOAD_COUNT, len(scenes))
        preload_char_names: set[str] = set()
        cid_to_name = {}
        for c in characters:
            cname = str(c.get("name", "")).strip()
            ccid = str(c.get("id", "") or cname)
            if cname:
                cid_to_name[ccid] = cname
                cid_to_name[cname] = cname
        for s in scenes[:preload_n]:
            for ref in (s.get("characters_present", []) or []):
                ref_str = str(ref).strip()
                mapped = cid_to_name.get(ref_str, ref_str)
                preload_char_names.add(mapped)

        # ─── 拆分任务为 Phase 1（第1场景）/ Phase 2（剩余）───
        phase1_tasks = bg_tasks[:preload_n] + [
            t for t in char_tasks if t["name"] in preload_char_names
        ]
        phase2_tasks = bg_tasks[preload_n:] + [
            t for t in char_tasks if t["name"] not in preload_char_names
        ]

        total = len(phase1_tasks) + len(phase2_tasks)
        yield {"event": "assets_meta", "enabled": gen.enabled, "total": total,
               "phase1_total": len(phase1_tasks),
               "message": (f"正在生成第 1 个场景的素材（共 {total} 张）" if gen.enabled
                           else "加载美术素材（缓存模式）")}

        # ─── Phase 1：滑动窗口，最多 SCENE_IMAGE_CAP 张同时生成 ───
        phase1_done = 0
        if phase1_tasks:
            cap = min(SCENE_IMAGE_CAP, IMAGE_CONCURRENCY)
            max_workers = min(len(phase1_tasks), cap)
            with concurrent.futures.ThreadPoolExecutor(max_workers=max_workers) as executor:
                pending = list(phase1_tasks)  # 待提交队列
                in_flight: dict = {}  # future -> task
                # 填满窗口
                while pending and len(in_flight) < cap:
                    t = pending.pop(0)
                    fut = executor.submit(gen.generate, script_slug, t["cache_kind"],
                                          t["cache_id"], t["prompt"], t["size"])
                    in_flight[fut] = t
                # 滑动窗口：完成一个就补一个
                while in_flight:
                    done_set, _ = concurrent.futures.wait(
                        in_flight, timeout=180,
                        return_when=concurrent.futures.FIRST_COMPLETED
                    )
                    if not done_set:
                        logger.warning("[assets_stream] Phase 1 超时(180s)，跳过未完成任务")
                        break
                    for fut in done_set:
                        t = in_flight.pop(fut)
                        try:
                            url = fut.result()
                        except Exception as e:
                            logger.warning("[session_assets] Phase 1 图片生成失败: %s", e)
                            url = None
                        if url:
                            store_kind, key_a, key_b = t["store"]
                            if store_kind == "char":
                                char_urls[key_a] = url
                            else:
                                scene_urls[key_a] = url
                                if key_b and key_b != key_a:
                                    scene_urls[key_b] = url
                        phase1_done += 1
                        yield {"event": "asset_progress", "kind": t["kind"], "name": t["name"],
                               "done": phase1_done, "total": len(phase1_tasks),
                               "status": "done" if url else "fallback", "url": url}
                    # 补充新任务填满窗口
                    while pending and len(in_flight) < cap:
                        t = pending.pop(0)
                        fut = executor.submit(gen.generate, script_slug, t["cache_kind"],
                                              t["cache_id"], t["prompt"], t["size"])
                        in_flight[fut] = t

        yield {"event": "assets_ready", "enabled": gen.enabled,
               "characters": dict(char_urls), "scenes": dict(scene_urls),
               "remaining": len(phase2_tasks)}

        # ─── Phase 2 ───
        if phase2_tasks:
            max_workers = min(len(phase2_tasks), IMAGE_CONCURRENCY)
            with concurrent.futures.ThreadPoolExecutor(max_workers=max_workers) as executor:
                future_map = {
                    executor.submit(gen.generate, script_slug, t["cache_kind"],
                                    t["cache_id"], t["prompt"], t["size"]): t
                    for t in phase2_tasks
                }
                try:
                    for fut in concurrent.futures.as_completed(future_map, timeout=300):
                        t = future_map[fut]
                        try:
                            url = fut.result()
                        except Exception as e:
                            logger.warning("[session_assets] Phase 2 图片生成失败: %s", e)
                            url = None
                        store_kind, key_a, key_b = t["store"]
                        if url:
                            if store_kind == "char":
                                char_urls[key_a] = url
                            else:
                                scene_urls[key_a] = url
                                if key_b and key_b != key_a:
                                    scene_urls[key_b] = url
                        if store_kind == "char":
                            yield {"event": "asset_char_ready",
                                   "char_name": key_a, "url": url, "name": t["name"],
                                   "status": "done" if url else "fallback"}
                        else:
                            yield {"event": "asset_bg_ready",
                                   "scene_id": key_a, "scene_name": key_b,
                                   "url": url, "name": t["name"],
                                   "status": "done" if url else "fallback"}
                except concurrent.futures.TimeoutError:
                    logger.warning("[assets_stream] Phase 2 超时(300s)，跳过未完成任务")

        yield {"event": "assets_done", "enabled": gen.enabled,
               "characters": char_urls, "scenes": scene_urls}

    def sse():
        for evt in event_stream():
            evt_type = evt.get("event", "message")
            yield f"event: {evt_type}\ndata: {json.dumps(evt, ensure_ascii=False)}\n\n"

    return StreamingResponse(
        sse(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@router.post("/api/session/{session_id}/choose")
def submit_choice(session_id: str, req: ChoiceRequest):
    session = sessions.get(session_id)
    if not session:
        raise HTTPException(404, "会话不存在")
    return session.choose(req.choice_index, req.choice_text)


@router.post("/api/session/{session_id}/finish", summary="终局场景无选项时直接完稿进入结局")
def finish_story(session_id: str):
    """终局场景既无剧本选项也无 LLM 选项时，前端调本接口直达结局页，
    响应体与 choose 返回 finished 时一致（含 ending.matched_ending）。"""
    session = sessions.get(session_id)
    if not session:
        raise HTTPException(404, "会话不存在")
    return session.finish()


@router.get("/api/session/{session_id}/state")
def get_session_state(session_id: str):
    session = sessions.get(session_id)
    if not session:
        raise HTTPException(404, "会话不存在")
    return session.get_state()


@router.get("/api/session/{session_id}/history")
def get_history(session_id: str):
    session = sessions.get(session_id)
    if not session:
        raise HTTPException(404, "会话不存在")
    return {"history": session.history}


@router.post("/api/session/{session_id}/exit", summary="退出当前剧本（销毁会话）")
def exit_session(session_id: str):
    """玩家退出当前剧本：移除会话，后续生成/选择请求将拒绝，
    不会再产生任何模型调用。"""
    session = sessions.pop(session_id, None)
    if not session:
        raise HTTPException(404, "会话不存在")
    return {"ok": True, "session_id": session_id}
