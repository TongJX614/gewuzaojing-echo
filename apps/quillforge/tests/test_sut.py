# -*- coding: utf-8 -*-
"""SUT 模块集成测试

测试覆盖：
  1. render_template 模板渲染
  2. NarrativeSUT 初始化和配置
  3. LLM 调用委托（mock LLMClient）
  4. Prompt 渲染逻辑
"""

from unittest.mock import MagicMock, patch
import pytest

from config_manager import OpenAICompatibleConnection, QuillForgeSettings
from quillforge.sut import NarrativeSUT, render_template, load_config, load_prompt


@pytest.fixture
def test_settings() -> QuillForgeSettings:
    """Provide explicit process settings without reading a developer .env file."""

    return QuillForgeSettings(
        source="shared",
        connection=OpenAICompatibleConnection(
            provider="openai-compatible",
            api_key="test-secret",
            base_url="https://provider.example/v1/",
        ),
        runtime_model="test-runtime-model",
        script_model="test-script-model",
        debate_model="test-debate-model",
        minigame_model="test-minigame-model",
        host="127.0.0.1",
        port=8050,
        echo_entry_enabled=True,
    )


# ═══════════════════════════════════════════════════════
# render_template 测试
# ═══════════════════════════════════════════════════════

class TestRenderTemplate:
    """模板渲染"""

    def test_simple_variable_replacement(self):
        """简单变量替换"""
        template = "你好，{{name}}！"
        variables = {"name": "张三"}
        result = render_template(template, variables)
        assert result == "你好，张三！"

    def test_multiple_variables(self):
        """多个变量替换"""
        template = "{{greeting}}，{{name}}！今天是{{day}}。"
        variables = {"greeting": "你好", "name": "李四", "day": "星期一"}
        result = render_template(template, variables)
        assert result == "你好，李四！今天是星期一。"

    def test_if_block_true(self):
        """if 条件为真时渲染 then 块"""
        template = "{{#if show}}显示内容{{/if}}"
        variables = {"show": True}
        result = render_template(template, variables)
        assert result == "显示内容"

    def test_if_block_false(self):
        """if 条件为假时不渲染"""
        template = "{{#if show}}显示内容{{/if}}"
        variables = {"show": False}
        result = render_template(template, variables)
        assert result == ""

    def test_if_else_block(self):
        """if-else 条件渲染"""
        template = "{{#if active}}激活{{#else}}未激活{{/if}}"
        variables = {"active": True}
        result = render_template(template, variables)
        assert result == "激活"

        variables = {"active": False}
        result = render_template(template, variables)
        assert result == "未激活"

    def test_each_block_with_dicts(self):
        """each 循环遍历字典列表"""
        template = "{{#each items}}名称: {{this.name}}, 值: {{this.value}}\n{{/each}}"
        variables = {
            "items": [
                {"name": "A", "value": 1},
                {"name": "B", "value": 2},
            ]
        }
        result = render_template(template, variables)
        assert "名称: A, 值: 1" in result
        assert "名称: B, 值: 2" in result

    def test_each_block_with_strings(self):
        """each 循环遍历字符串列表"""
        template = "{{#each tags}}#{{this}} {{/each}}"
        variables = {"tags": ["python", "test", "code"]}
        result = render_template(template, variables)
        assert "#python" in result
        assert "#test" in result
        assert "#code" in result

    def test_each_block_empty_list(self):
        """each 循环空列表"""
        template = "{{#each items}}内容{{/each}}"
        variables = {"items": []}
        result = render_template(template, variables)
        assert result == ""

    def test_complex_template(self):
        """复杂模板混合使用"""
        template = """
# {{title}}

{{#if subtitle}}## {{subtitle}}{{/if}}

{{#each sections}}
### {{this.title}}
{{this.content}}
{{/each}}

{{#if footer}}---
{{footer}}{{/if}}
"""
        variables = {
            "title": "测试文档",
            "subtitle": "副标题",
            "sections": [
                {"title": "第一节", "content": "内容1"},
                {"title": "第二节", "content": "内容2"},
            ],
            "footer": "结束",
        }
        result = render_template(template, variables)
        assert "# 测试文档" in result
        assert "## 副标题" in result
        assert "### 第一节" in result
        assert "内容1" in result
        assert "---" in result
        assert "结束" in result

    def test_numeric_variables(self):
        """数值类型变量"""
        template = "共 {{count}} 项，进度 {{progress}}%"
        variables = {"count": 10, "progress": 50}
        result = render_template(template, variables)
        assert result == "共 10 项，进度 50%"

    def test_missing_variables(self):
        """缺失变量保留原样"""
        template = "你好，{{name}}！"
        variables = {}
        result = render_template(template, variables)
        assert result == "你好，{{name}}！"


# ═══════════════════════════════════════════════════════
# NarrativeSUT 初始化测试
# ═══════════════════════════════════════════════════════

class TestNarrativeSUTInit:
    """NarrativeSUT 初始化"""

    @patch("quillforge.sut.LLMClient")
    @patch("quillforge.sut.load_prompt")
    def test_init_with_default_config(
        self, mock_load_prompt, mock_llm_client, test_settings
    ):
        """使用默认配置初始化"""
        mock_load_prompt.return_value = "mock prompt"
        config = {
            "quillforge": {
                "llm": {
                    "temperature": 0.7,
                    "maxTokens": 2000,
                }
            }
        }

        sut = NarrativeSUT(config=config, settings=test_settings)

        assert sut.config == config
        mock_llm_client.assert_called_once()
        assert len(sut.prompts) == 5
        assert "system" in sut.prompts
        assert "narration" in sut.prompts
        assert "dialogue" in sut.prompts
        assert "choices" in sut.prompts

    @patch("quillforge.sut.LLMClient")
    @patch("quillforge.sut.load_prompt")
    def test_init_with_custom_config(
        self, mock_load_prompt, mock_llm_client, test_settings
    ):
        """使用自定义配置初始化"""
        mock_load_prompt.return_value = "mock prompt"
        config = {
            "quillforge": {
                "llm": {
                    "temperature": 0.9,
                    "maxTokens": 4000,
                }
            }
        }

        sut = NarrativeSUT(config=config, settings=test_settings)

        mock_llm_client.assert_called_once()
        call_args = mock_llm_client.call_args
        assert call_args[1]["connection"] is test_settings.connection
        assert call_args[1]["model"] == "test-runtime-model"
        assert call_args[1]["temperature"] == 0.9
        assert call_args[1]["max_tokens"] == 4000


# ═══════════════════════════════════════════════════════
# NarrativeSUT LLM 调用测试
# ═══════════════════════════════════════════════════════

class TestNarrativeSUTCall:
    """NarrativeSUT LLM 调用委托"""

    @patch("quillforge.sut.LLMClient")
    @patch("quillforge.sut.load_prompt")
    def test_call(self, mock_load_prompt, mock_llm_client, test_settings):
        """非流式调用"""
        mock_load_prompt.return_value = "mock prompt"
        mock_llm = MagicMock()
        mock_llm.generate.return_value = "生成的文本"
        mock_llm_client.return_value = mock_llm

        sut = NarrativeSUT(
            config={"quillforge": {"llm": {}}}, settings=test_settings
        )
        result = sut.call("system prompt", "user prompt")

        mock_llm.generate.assert_called_once_with("system prompt", "user prompt", "")
        assert result == "生成的文本"

    @patch("quillforge.sut.LLMClient")
    @patch("quillforge.sut.load_prompt")
    def test_call_stream(self, mock_load_prompt, mock_llm_client, test_settings):
        """流式调用"""
        mock_load_prompt.return_value = "mock prompt"
        mock_llm = MagicMock()
        mock_llm.generate_stream.return_value = iter(["chunk1", "chunk2", "chunk3"])
        mock_llm_client.return_value = mock_llm

        sut = NarrativeSUT(
            config={"quillforge": {"llm": {}}}, settings=test_settings
        )
        result = list(sut.call_stream("system", "user"))

        assert result == ["chunk1", "chunk2", "chunk3"]

    @patch("quillforge.sut.LLMClient")
    @patch("quillforge.sut.load_prompt")
    def test_call_json(self, mock_load_prompt, mock_llm_client, test_settings):
        """JSON 调用"""
        mock_load_prompt.return_value = "mock prompt"
        mock_llm = MagicMock()
        mock_llm.generate_json.return_value = {"key": "value"}
        mock_llm_client.return_value = mock_llm

        sut = NarrativeSUT(
            config={"quillforge": {"llm": {}}}, settings=test_settings
        )
        result = sut.call_json("system", "user")

        mock_llm.generate_json.assert_called_once()
        assert result == {"key": "value"}

    @patch("quillforge.sut.LLMClient")
    @patch("quillforge.sut.load_prompt")
    def test_call_json_stream(
        self, mock_load_prompt, mock_llm_client, test_settings
    ):
        """JSON 流式调用"""
        mock_load_prompt.return_value = "mock prompt"
        mock_llm = MagicMock()
        mock_llm.generate_json_stream.return_value = iter([{"a": 1}, {"b": 2}])
        mock_llm_client.return_value = mock_llm

        sut = NarrativeSUT(
            config={"quillforge": {"llm": {}}}, settings=test_settings
        )
        result = list(sut.call_json_stream("system", "user"))

        assert result == [{"a": 1}, {"b": 2}]


# ═══════════════════════════════════════════════════════
# NarrativeSUT Prompt 渲染测试
# ═══════════════════════════════════════════════════════

class TestNarrativeSUTRender:
    """NarrativeSUT Prompt 渲染"""

    @patch("quillforge.sut.LLMClient")
    @patch("quillforge.sut.load_prompt")
    def test_render_template_method(
        self, mock_load_prompt, mock_llm_client, test_settings
    ):
        """render_template 方法"""
        mock_load_prompt.return_value = "mock prompt"
        sut = NarrativeSUT(
            config={"quillforge": {"llm": {}}}, settings=test_settings
        )

        template = "你好，{{name}}！"
        result = sut.render_template(template, {"name": "测试"})
        assert result == "你好，测试！"

    @patch("quillforge.sut.LLMClient")
    @patch("quillforge.sut.load_prompt")
    def test_render_system_prompt_with_dict(
        self, mock_load_prompt, mock_llm_client, test_settings
    ):
        """使用 dict 渲染系统提示词"""
        mock_load_prompt.return_value = "风格: {{narrativeStyle}}, 世界书: {{worldbookRules}}"
        sut = NarrativeSUT(
            config={"quillforge": {"llm": {}}}, settings=test_settings
        )

        extra = {
            "_narrativeStyle": "第三人称",
            "_worldbook": "测试世界书",
            "_plotSummary": "",
            "_coreConflict": "",
            "_themes": "",
            "_relationshipNetwork": "",
            "_sceneAtmosphere": "",
        }

        from schemas import HarnessInput, GenerationOptions
        harness_input = HarnessInput(
            current_scene="测试",
            characters=[],
            worldline="A → B",
            options=GenerationOptions(dialogue_count_min=3, dialogue_count_max=10),
        )

        result = sut.render_system_prompt(extra, harness_input)
        assert "第三人称" in result
        assert "测试世界书" in result

    @patch("quillforge.sut.LLMClient")
    @patch("quillforge.sut.load_prompt")
    def test_render_system_prompt_with_extra_context(
        self, mock_load_prompt, mock_llm_client, test_settings
    ):
        """使用 ExtraContext 对象渲染系统提示词"""
        mock_load_prompt.return_value = "风格: {{narrativeStyle}}, 世界书: {{worldbookRules}}"
        sut = NarrativeSUT(
            config={"quillforge": {"llm": {}}}, settings=test_settings
        )

        # 模拟 ExtraContext 对象
        extra = MagicMock()
        extra.to_prompt_variables.return_value = {
            "narrativeStyle": "第二人称",
            "worldbookRules": "ExtraContext世界书",
            "plotSummary": "",
            "coreConflict": "",
            "themes": "",
            "relationshipNetwork": "",
            "sceneAtmosphere": "",
            "narrativeNotes": "",
            "emotionalArc": "",
        }
        extra.narrative_style = "第二人称"
        extra.worldbook = "ExtraContext世界书"
        extra.plot_summary = ""
        extra.core_conflict = ""
        extra.themes = ""
        extra.relationship_network = ""
        extra.scene_details = ""

        from schemas import HarnessInput, GenerationOptions
        harness_input = HarnessInput(
            current_scene="测试",
            characters=[],
            worldline="A → B",
            options=GenerationOptions(dialogue_count_min=5, dialogue_count_max=15),
        )

        result = sut.render_system_prompt(extra, harness_input)
        assert "第二人称" in result
        assert "ExtraContext世界书" in result


# ═══════════════════════════════════════════════════════
# load_config 和 load_prompt 测试
# ═══════════════════════════════════════════════════════

class TestLoadFunctions:
    """加载函数"""

    @patch("quillforge.sut.CONFIG_DIR")
    def test_load_config_exists(self, mock_config_dir):
        """加载存在的配置文件"""
        import tempfile
        from pathlib import Path

        with tempfile.TemporaryDirectory() as tmpdir:
            config_path = Path(tmpdir) / "quillforge_config.yaml"
            config_path.write_text("quillforge:\n  llm:\n    model: test", encoding="utf-8")

            with patch("quillforge.sut.CONFIG_DIR", Path(tmpdir)):
                config = load_config()
                assert "quillforge" in config
                assert config["quillforge"]["llm"]["model"] == "test"

    @patch("quillforge.sut.CONFIG_DIR")
    def test_load_config_not_exists(self, mock_config_dir):
        """加载不存在的配置文件"""
        from pathlib import Path
        with patch("quillforge.sut.CONFIG_DIR", Path("/nonexistent")):
            config = load_config()
            assert config == {}

    @patch("quillforge.sut.PROMPTS_DIR")
    def test_load_prompt(self, mock_prompts_dir):
        """加载 Prompt 模板"""
        import tempfile
        from pathlib import Path

        with tempfile.TemporaryDirectory() as tmpdir:
            prompt_path = Path(tmpdir) / "test.md"
            prompt_path.write_text("测试 Prompt {{variable}}", encoding="utf-8")

            with patch("quillforge.sut.PROMPTS_DIR", Path(tmpdir)):
                result = load_prompt("test.md")
                assert result == "测试 Prompt {{variable}}"
