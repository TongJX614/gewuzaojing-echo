import json
from pathlib import Path

import pytest

from gewuzaojing_config import GewuzaojingConfigError, resolve_gewuzaojing_env_path


def test_environment_contract_and_monorepo_root_are_shared(tmp_path: Path) -> None:
    root = tmp_path / "gewuzaojing-echo"
    start = root / "apps" / "quillforge" / "src" / "gewuzaojing_config.py"
    contract = root / "shared" / "contracts" / "environment.json"
    start.parent.mkdir(parents=True)
    contract.parent.mkdir(parents=True)
    (root / "package.json").write_text('{"name":"gewuzaojing-echo","private":true}\n', encoding="utf-8")
    contract.write_text('{"version":1,"connectionGroups":["SHARED_LLM","ECHO_LLM","QUILLFORGE_LLM"]}\n', encoding="utf-8")
    (root / ".env").write_text("SHARED_LLM_PROVIDER=openai-compatible\n", encoding="utf-8")
    assert resolve_gewuzaojing_env_path({}, start) == (root / ".env").resolve()
    assert json.loads(contract.read_text(encoding="utf-8"))["connectionGroups"] == [
        "SHARED_LLM", "ECHO_LLM", "QUILLFORGE_LLM"
    ]


def test_legacy_aggregation_shape_is_not_a_root(tmp_path: Path) -> None:
    start = tmp_path / "src" / "Quillforge" / "src" / "gewuzaojing_config.py"
    start.parent.mkdir(parents=True)
    (tmp_path / "src" / "echo").mkdir(parents=True)
    with pytest.raises(GewuzaojingConfigError, match="AGGREGATION_ROOT_NOT_FOUND"):
        resolve_gewuzaojing_env_path({}, start)
