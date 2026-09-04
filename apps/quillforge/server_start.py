# -*- coding: utf-8 -*-
"""
QuillForge Server - Launcher
"""
import io
import os
from pathlib import Path
import re
import subprocess
import sys
import threading
import time
import webbrowser

if sys.platform == "win32":
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding="utf-8", errors="replace")

SCRIPT_DIR = Path(__file__).resolve().parent
SRC_DIR = SCRIPT_DIR / "src"
sys.path.insert(0, str(SRC_DIR))

from config_manager import get_settings, validate_final_bind


def main() -> None:
    settings = get_settings()
    host, port = validate_final_bind(settings, settings.host, settings.port)
    print("=" * 60)
    print("  GEWUZAOJING · QuillForge - 通用文本生成引擎")
    print("=" * 60)
    print()
    print("[1/1] 启动服务器...")
    print(f"      前端: http://{host}:{port}")
    print(f"      API:  http://{host}:{port}/docs")
    print()

    def browser_open_enabled() -> bool:
        raw = os.environ.get("QUILLFORGE_OPEN_BROWSER")
        if raw is None:
            root_env = SCRIPT_DIR.parent.parent / ".env"
            if root_env.exists():
                for line in root_env.read_text(encoding="utf-8-sig").splitlines():
                    match = re.match(r"QUILLFORGE_OPEN_BROWSER=(.*)", line.strip())
                    if match:
                        raw = match.group(1).strip()
                        break
        return (raw or "true").strip().lower() != "false"

    def open_browser():
        time.sleep(2)
        if browser_open_enabled():
            webbrowser.open(f"http://{host}:{port}")

    threading.Thread(target=open_browser, daemon=True).start()

    cmd = [
        sys.executable,
        str(SRC_DIR / "server.py"),
        "--host",
        host,
        "--port",
        str(port),
    ]
    subprocess.run(cmd, cwd=SCRIPT_DIR, check=False)


if __name__ == "__main__":
    main()
