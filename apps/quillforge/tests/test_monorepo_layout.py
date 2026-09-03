from pathlib import Path
import unittest


class MonorepoLayoutTest(unittest.TestCase):
    def test_quillforge_is_flat_and_runtime_sources_are_present(self) -> None:
        app_root = Path(__file__).resolve().parents[1]
        self.assertFalse((app_root / "Quillforge").exists())
        self.assertFalse((app_root / "quillforge").exists())
        self.assertFalse((app_root / ".env").exists())
        self.assertTrue((app_root / "server_start.py").is_file())
        self.assertTrue((app_root / "src" / "routes" / "debate.py").is_file())
        self.assertTrue((app_root / "src" / "routes" / "minigame.py").is_file())
        self.assertTrue((app_root / "src" / "static" / "debate.html").is_file())
        self.assertTrue((app_root / "src" / "static" / "minigame.html").is_file())

    def test_only_approved_public_sample_is_shipped(self) -> None:
        samples = Path(__file__).resolve().parents[1] / "samples"
        self.assertEqual(
            sorted(path.name for path in samples.iterdir() if path.is_dir()),
            ["回响-DEMO"],
        )


if __name__ == "__main__":
    unittest.main()
