# -*- coding: utf-8 -*-
"""上传与剧本加载路由：/api/upload, /api/load-folder, /api/upload-directory, /api/samples, /api/upload-sample-path, /api/start"""

from __future__ import annotations

from copy import deepcopy
from typing import Annotated
import uuid
from pathlib import Path

from fastapi import APIRouter, File, Header, HTTPException, Request, UploadFile
from slowapi import Limiter
from slowapi.util import get_remote_address

from generic_adapter import GenericScriptAdapter, load_story
from runtime_paths import ensure_runtime_paths, resolve_runtime_paths
from session_manager import GameSession
from dependencies import (
    StartReceipt,
    _loaded_stories,
    sessions,
    start_receipt_lock,
    start_receipts,
    uploaded_scripts,
)
from script_registry import get_ready_script

router = APIRouter(tags=["upload"])
limiter = Limiter(key_func=get_remote_address)

# 上传安全：文件扩展名白名单 + 大小限制
_ALLOWED_UPLOAD_EXTS = {".yaml", ".yml", ".json", ".md", ".txt"}
_MAX_UPLOAD_SIZE = 10 * 1024 * 1024  # 10 MB

_RUNTIME_PATHS = ensure_runtime_paths(resolve_runtime_paths())
UPLOAD_DIR = _RUNTIME_PATHS.uploads
SAMPLES_DIR = Path(__file__).resolve().parents[2] / "samples"
SAMPLES_DIR.mkdir(exist_ok=True)


def _safe_upload_path(script_dir: Path, filename: str) -> Path:
    """净化上传文件名，防止路径穿越攻击。

    保留合法的相对子目录（如 角色/主要角色.yaml），
    剥离绝对路径前缀、盘符与 .. 组件，并校验最终路径仍在 script_dir 内。
    """
    rel = Path((filename or "").replace("\\", "/"))
    parts = [p for p in rel.parts if p not in ("..", "/", "\\") and ":" not in p]
    if not parts:
        raise HTTPException(400, f"非法的文件名: {filename}")
    file_path = script_dir.joinpath(*parts).resolve()
    if script_dir.resolve() not in file_path.parents:
        raise HTTPException(400, f"非法的文件名（路径穿越）: {filename}")
    return file_path


def save_upload(filename: str, content: bytes) -> str:
    """保存上传的文件，返回 script_id"""
    script_id = str(uuid.uuid4())[:8]
    script_dir = UPLOAD_DIR / script_id
    script_dir.mkdir(exist_ok=True)

    file_path = _safe_upload_path(script_dir, filename)
    file_path.parent.mkdir(parents=True, exist_ok=True)  # 创建子目录（如 角色/、剧情/）
    with open(file_path, "wb") as f:
        f.write(content)

    return script_id


def parse_script(script_id: str) -> GenericScriptAdapter:
    """解析已上传的剧本"""
    script_dir = UPLOAD_DIR / script_id
    if not script_dir.exists():
        raise HTTPException(404, f"剧本不存在: {script_id}")

    adapter = GenericScriptAdapter()
    files = list(script_dir.glob("*"))
    if len(files) == 1:
        adapter.load(str(files[0]))
    else:
        adapter.load(str(script_dir))

    return adapter


@router.post("/api/upload")
@limiter.limit("20/minute")
async def upload_script(request: Request, file: UploadFile = File(...)):
    """上传剧本文件"""
    ext = Path(file.filename or "").suffix.lower()
    if ext not in _ALLOWED_UPLOAD_EXTS:
        raise HTTPException(400, f"不支持的文件类型：{ext}（允许：{', '.join(_ALLOWED_UPLOAD_EXTS)}）")
    content = await file.read()
    if len(content) > _MAX_UPLOAD_SIZE:
        raise HTTPException(413, f"文件过大（最大 {_MAX_UPLOAD_SIZE // 1024 // 1024}MB）")
    script_id = save_upload(file.filename, content)

    try:
        adapter = parse_script(script_id)
        summary = adapter.to_summary()
        uploaded_scripts[script_id] = {
            "path": str(UPLOAD_DIR / script_id),
            "adapter": adapter,
            "summary": summary,
        }
        return {"script_id": script_id, **summary}
    except Exception as e:
        raise HTTPException(400, f"剧本解析失败: {str(e)}")


@router.post("/api/load-folder", summary="从本地文件夹路径加载剧本")
async def load_folder(body: dict) -> dict:
    """
    直接指定本地文件夹路径加载剧本（支持嵌套目录结构）。
    """
    path = body.get("path", "")
    if not path:
        raise HTTPException(400, "缺少 path 参数")

    folder = Path(path)
    if not folder.exists():
        raise HTTPException(404, f"路径不存在：{path}")
    if not folder.is_dir():
        raise HTTPException(400, f"路径不是文件夹：{path}")

    script_id = str(uuid.uuid4())[:8]
    try:
        adapter = GenericScriptAdapter()
        adapter.load(str(folder))
        summary = adapter.to_summary()
        uploaded_scripts[script_id] = {
            "path": str(folder),
            "adapter": adapter,
            "summary": summary,
        }

        story = load_story(str(folder))
        _loaded_stories[str(folder)] = story

        return {
            "script_id": script_id,
            "path": str(folder),
            **summary,
            "story_title": story.get("title", ""),
            "story_scenes": len(story.get("scenes", [])),
            "story_characters": len(story.get("characters", [])),
        }
    except Exception as e:
        raise HTTPException(400, f"剧本解析失败: {str(e)}")


@router.post("/api/upload-directory")
async def upload_directory(files: list[UploadFile] = File(...)):
    """上传多个剧本文件（目录形式，保留子目录结构）"""
    script_id = str(uuid.uuid4())[:8]
    script_dir = UPLOAD_DIR / script_id
    script_dir.mkdir(exist_ok=True)

    for file in files:
        # 与单文件上传一致：扩展名白名单 + 大小限制 + 路径穿越防护
        ext = Path(file.filename or "").suffix.lower()
        if ext not in _ALLOWED_UPLOAD_EXTS:
            raise HTTPException(400, f"不支持的文件类型：{ext}（允许：{', '.join(_ALLOWED_UPLOAD_EXTS)}）")
        content = await file.read()
        if len(content) > _MAX_UPLOAD_SIZE:
            raise HTTPException(413, f"文件过大（最大 {_MAX_UPLOAD_SIZE // 1024 // 1024}MB）")
        file_path = _safe_upload_path(script_dir, file.filename)
        file_path.parent.mkdir(parents=True, exist_ok=True)
        with open(file_path, "wb") as f:
            f.write(content)

    try:
        adapter = GenericScriptAdapter()
        adapter.load(str(script_dir))
        summary = adapter.to_summary()
        uploaded_scripts[script_id] = {
            "path": str(script_dir),
            "adapter": adapter,
            "summary": summary,
        }
        return {"script_id": script_id, **summary}
    except Exception as e:
        raise HTTPException(400, f"剧本解析失败: {str(e)}")


@router.get("/api/samples")
def list_samples():
    """列出内置示例剧本（支持单文件和目录结构）"""
    samples = []
    if SAMPLES_DIR.exists():
        for f in sorted(SAMPLES_DIR.glob("*")):
            if f.is_dir():
                has_data = any(
                    p.suffix in (".yaml", ".yml", ".json")
                    for p in f.rglob("*") if p.is_file()
                )
                if not has_data:
                    continue
                try:
                    adapter = GenericScriptAdapter()
                    adapter.load(str(f))
                    samples.append({
                        "id": f.name,
                        "filename": f.name,
                        "path": str(f),
                        **adapter.to_summary(),
                    })
                except Exception:
                    samples.append({"id": f.name, "filename": f.name, "error": "解析失败"})
            elif f.suffix in (".yaml", ".yml", ".json"):
                try:
                    adapter = GenericScriptAdapter()
                    adapter.load(str(f))
                    samples.append({
                        "id": f.stem,
                        "filename": f.name,
                        "path": str(f),
                        **adapter.to_summary(),
                    })
                except Exception:
                    samples.append({"id": f.stem, "filename": f.name, "error": "解析失败"})
    return {"samples": samples}


@router.post("/api/upload-sample-path")
def upload_sample_path(path: str = ""):
    """从文件路径加载内置示例剧本"""
    if not path:
        raise HTTPException(400, "缺少 path 参数")

    file_path = Path(path)
    if not file_path.exists():
        raise HTTPException(404, f"文件不存在: {path}")

    try:
        file_path.resolve().relative_to(SAMPLES_DIR.resolve())
    except ValueError:
        raise HTTPException(403, "只能加载 samples 目录下的剧本文件")

    script_id = str(uuid.uuid4())[:8]
    try:
        adapter = GenericScriptAdapter()
        adapter.load(str(file_path))
        summary = adapter.to_summary()
        uploaded_scripts[script_id] = {
            "path": str(file_path),
            "adapter": adapter,
            "summary": summary,
        }
        return {"script_id": script_id, **summary}
    except Exception as e:
        raise HTTPException(400, f"剧本解析失败: {str(e)}")


def _create_start_response(adapter: GenericScriptAdapter) -> dict[str, object]:
    if not adapter.scenes:
        raise HTTPException(400, "剧本中未解析到任何场景，无法开始游戏")
    session = GameSession(adapter)
    sessions[session.session_id] = session
    return {
        "session_id": session.session_id,
        "script": adapter.to_summary(),
        "state": session.get_state(),
    }


@router.post("/api/start")
def start_game(
    script_id: str = "",
    idempotency_key: Annotated[
        str | None,
        Header(alias="Idempotency-Key"),
    ] = None,
):
    """开始游戏会话；带幂等头时只接受已审阅的 ready 生成记录。"""
    if idempotency_key is None:
        if not script_id or script_id not in uploaded_scripts:
            raise HTTPException(400, "请先上传剧本文件")
        adapter = uploaded_scripts[script_id]["adapter"]
        return _create_start_response(adapter)

    try:
        parsed_key = uuid.UUID(idempotency_key)
    except (AttributeError, ValueError):
        raise HTTPException(400, "Idempotency-Key 必须是有效 UUID") from None
    if str(parsed_key) != idempotency_key.lower():
        raise HTTPException(400, "Idempotency-Key 必须是有效 UUID")

    with start_receipt_lock:
        ready = get_ready_script(script_id)
        if ready is None:
            raise HTTPException(400, "审阅剧本尚未注册或未就绪")
        receipt = start_receipts.get(idempotency_key)
        if receipt is not None:
            if receipt.script_id != script_id:
                raise HTTPException(409, "Idempotency-Key 已绑定其他剧本")
            return deepcopy(receipt.response)
        response = _create_start_response(ready.adapter)
        stored_response = deepcopy(response)
        start_receipts[idempotency_key] = StartReceipt(
            idempotency_key=idempotency_key,
            script_id=script_id,
            response=stored_response,
        )
        return deepcopy(stored_response)
