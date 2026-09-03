# -*- coding: utf-8 -*-
"""No-cost Echo project-two server using production QuillForge routes.

The script generator, runtime Harness, image generator, and TTS generator are
deterministic local doubles.  A loopback-only socket guard fails closed if any
other code path attempts outbound network access.  HTTP routing,
generated-package registration, disk worldbook extraction, review metadata,
session creation, and idempotency behavior remain production code.
"""

from __future__ import annotations

import sys
import socket
from contextlib import contextmanager
from dataclasses import dataclass
from pathlib import Path
from tempfile import TemporaryDirectory
from typing import Iterator

TESTS_DIR = Path(__file__).resolve().parent.parent
SRC_DIR = TESTS_DIR.parent / "src"
for import_root in (str(SRC_DIR), str(TESTS_DIR)):
    if import_root not in sys.path:
        sys.path.insert(0, import_root)

from fastapi import FastAPI, Request

import dependencies as runtime_dependencies
from config_manager import OpenAICompatibleConnection, QuillForgeSettings
from dependencies import (
    _loaded_stories,
    sessions,
    start_receipts,
    uploaded_scripts,
)
import routes.script_gen as script_gen_route
from script_generator import SAMPLES_DIR
from script_registry import registered_scripts
from server import create_app
from test_script_registry import write_generated_package


PRIMARY_SCRIPT_ID = "a" * 32
SECONDARY_SCRIPT_ID = "b" * 32
CANONICAL_PROMPT = (
    "项目二·世界编织。母题：观测与真实。身份：旁证者。世界书简报："
    "一个观测会改变被观测现实的世界。你追踪互相矛盾的证据，并检验“不干预”是否真的可能。\n"
    "请生成原创科幻科普世界书与互动剧本；科学规律是边界，不冒充真实历史。"
)
SECONDARY_PROMPT = "项目二集成测试的第二份固定简报。"
WORLD_BOOK_RAW = (
    "观测记录必须保留因果边界。\n\n"
    "<img src=x onerror=window.__projectTwoXss=1>\n\n"
    "生成内容是科幻想象，不冒充真实历史。"
)
WORLD_BOOK_EXCERPT = (
    "观测记录必须保留因果边界。 "
    "<img src=x onerror=window.__projectTwoXss=1> "
    "生成内容是科幻想象，不冒充真实历史。"
)


class _NoCostRuntimeHarness:
    def __init__(self) -> None:
        self.calls = 0
        self.narration = "固定测试场景已经就绪；本地替身不会访问任何模型供应商。"
        self.dialogues = [
            {
                "speaker": "测试观察员",
                "text": "这段内容来自确定性测试夹具。",
                "emotion": "neutral",
            }
        ]
        self.choices = [
            {
                "id": "continue",
                "text": "继续核验",
                "description": "推进无成本测试场景",
                "effect": "进入下一步",
                "consequences": {},
            }
        ]

    def _result(self) -> dict[str, object]:
        return {
            "success": True,
            "data": {
                "narration": self.narration,
                "dialogues": list(self.dialogues),
                "nextChoices": list(self.choices),
                "worldlineState": {
                    "currentNode": "no-cost-browser-qa",
                    "nodeIndex": 0,
                    "totalNodes": 1,
                    "progress": 0.0,
                },
            },
            "validation": {"passed": True, "checks": [], "retryCount": 0},
            "metadata": {"generationTime": 0, "model": "no-cost-local-double"},
        }

    def run_stream(self, _input_data):
        self.calls += 1
        yield {"event": "stage", "stage": 1, "message": "无成本测试：装配固定场景"}
        yield {"event": "narration", "text": self.narration}
        for dialogue in self.dialogues:
            yield {"event": "dialogue", **dialogue}
        yield {"event": "choices", "choices": list(self.choices)}
        yield {
            "event": "done",
            "success": True,
            "validation": {"passed": True},
            "elapsed_ms": 0,
            "result": self._result(),
        }


class _NoCostImageGenerator:
    enabled = False

    def __init__(self) -> None:
        self.calls = 0

    def generate(self, *_args, **_kwargs):
        self.calls += 1
        return None


class _NoCostTTSGenerator:
    enabled = False

    def __init__(self) -> None:
        self.calls = 0

    def generate(self, *_args, **_kwargs):
        self.calls += 1
        raise AssertionError("disabled no-cost TTS generator was called")


@dataclass
class NoCostEchoServer:
    app: FastAPI
    primary_script_dir: Path
    secondary_script_dir: Path
    request_paths: list[str]
    generate_prompts: list[str]
    runtime_harness: _NoCostRuntimeHarness
    image_generator: _NoCostImageGenerator
    tts_generator: _NoCostTTSGenerator
    blocked_outbound_calls: list[str]

    @property
    def runtime_generation_calls(self) -> int:
        return self.runtime_harness.calls

    @property
    def image_generation_calls(self) -> int:
        return self.image_generator.calls

    @property
    def tts_generation_calls(self) -> int:
        return self.tts_generator.calls


def _test_settings() -> QuillForgeSettings:
    return QuillForgeSettings(
        source="shared",
        connection=OpenAICompatibleConnection(
            provider="openai-compatible",
            api_key="test-only-not-used",
            base_url="https://provider.invalid/v1/",
        ),
        runtime_model="no-cost-runtime-model",
        script_model="no-cost-script-model",
        debate_model="no-cost-debate-model",
        minigame_model="no-cost-minigame-model",
        host="127.0.0.1",
        port=8050,
        echo_entry_enabled=True,
    )


def _clear_runtime_state() -> None:
    registered_scripts.clear()
    uploaded_scripts.clear()
    sessions.clear()
    start_receipts.clear()
    _loaded_stories.clear()


@contextmanager
def no_cost_echo_server() -> Iterator[NoCostEchoServer]:
    """Yield production routes with every external generation seam isolated."""

    SAMPLES_DIR.mkdir(parents=True, exist_ok=True)
    _clear_runtime_state()
    original_generate_script = script_gen_route.generate_script
    original_settings = runtime_dependencies.settings
    original_harness = runtime_dependencies._harness
    original_image_generator = runtime_dependencies._image_generator
    original_tts_generator = runtime_dependencies._tts_generator
    original_getaddrinfo = socket.getaddrinfo
    original_socket_connect = socket.socket.connect
    runtime_harness = _NoCostRuntimeHarness()
    image_generator = _NoCostImageGenerator()
    tts_generator = _NoCostTTSGenerator()
    blocked_outbound_calls: list[str] = []
    test_settings = _test_settings()

    def guarded_getaddrinfo(host, *args, **kwargs):
        host_text = "" if host is None else str(host).lower()
        if host_text in {"", "localhost", "127.0.0.1", "::1"}:
            return original_getaddrinfo(host, *args, **kwargs)
        blocked_outbound_calls.append(f"dns:{host_text}")
        raise RuntimeError("NO_COST_OUTBOUND_NETWORK_BLOCKED")

    def guarded_connect(sock, address):
        if not isinstance(address, tuple):
            return original_socket_connect(sock, address)
        host_text = str(address[0]).lower()
        if host_text == "localhost" or host_text == "::1" or host_text.startswith("127."):
            return original_socket_connect(sock, address)
        blocked_outbound_calls.append(f"connect:{host_text}")
        raise RuntimeError("NO_COST_OUTBOUND_NETWORK_BLOCKED")

    runtime_dependencies.settings = test_settings
    runtime_dependencies._harness = runtime_harness
    runtime_dependencies._image_generator = image_generator
    runtime_dependencies._tts_generator = tts_generator
    socket.getaddrinfo = guarded_getaddrinfo
    socket.socket.connect = guarded_connect
    with TemporaryDirectory(prefix="echo-project-two-", dir=SAMPLES_DIR) as temp:
        temporary_samples_root = Path(temp)
        primary_script_dir = write_generated_package(
            temporary_samples_root,
            "primary",
            worldbook_text=WORLD_BOOK_RAW,
        )
        secondary_script_dir = write_generated_package(
            temporary_samples_root,
            "secondary",
            worldbook_text="第二份世界书，用于验证幂等键不能绑定不同剧本。",
        )
        generate_prompts: list[str] = []
        request_paths: list[str] = []

        def fake_generate_script(prompt: str):
            generate_prompts.append(prompt)
            if prompt == SECONDARY_PROMPT:
                script_id = SECONDARY_SCRIPT_ID
                script_dir = secondary_script_dir
            else:
                script_id = PRIMARY_SCRIPT_ID
                script_dir = primary_script_dir
            yield {
                "type": "progress",
                "step": "foundation",
                "message": "无成本测试：正在整理固定世界规则",
            }
            yield {
                "type": "done",
                "script_id": script_id,
                "path": str(script_dir),
            }

        script_gen_route.generate_script = fake_generate_script
        app = create_app(_test_settings())

        @app.middleware("http")
        async def record_request_path(request: Request, call_next):
            request_paths.append(request.url.path)
            return await call_next(request)

        app.state.echo_project_two_no_cost = True
        harness = NoCostEchoServer(
            app=app,
            primary_script_dir=primary_script_dir,
            secondary_script_dir=secondary_script_dir,
            request_paths=request_paths,
            generate_prompts=generate_prompts,
            runtime_harness=runtime_harness,
            image_generator=image_generator,
            tts_generator=tts_generator,
            blocked_outbound_calls=blocked_outbound_calls,
        )
        try:
            yield harness
        finally:
            script_gen_route.generate_script = original_generate_script
            runtime_dependencies.settings = original_settings
            runtime_dependencies._harness = original_harness
            runtime_dependencies._image_generator = original_image_generator
            runtime_dependencies._tts_generator = original_tts_generator
            socket.getaddrinfo = original_getaddrinfo
            socket.socket.connect = original_socket_connect
            _clear_runtime_state()


def main() -> None:
    """Bind the deterministic browser-QA server to the QuillForge port."""

    import uvicorn

    with no_cost_echo_server() as harness:
        uvicorn.run(
            harness.app,
            host="127.0.0.1",
            port=8050,
            log_level="info",
        )


if __name__ == "__main__":
    main()
