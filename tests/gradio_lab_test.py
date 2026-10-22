import importlib.util
import os
import base64
import json
import tempfile
from pathlib import Path
import unittest
from unittest.mock import patch

with patch.dict(os.environ, {"REFRAME_URL": "http://127.0.0.1:5173", "REFRAME_GRADIO_TOKEN": "test-local-token", "GRADIO_ANALYTICS_ENABLED": "False"}):
    spec = importlib.util.spec_from_file_location("reframe_gradio", Path(__file__).parents[1] / "server/gradio_app.py")
    lab = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(lab)


class GradioLabTest(unittest.TestCase):
    def test_generated_gradio_component_wires_real_state_validation_errors_and_retry_identity(self):
        contract = {"id": "rf_000000000001", "name": "Test component", "fields": [{"id": "field1", "label": "Email", "type": "email", "required": True}], "actions": [{"id": "action1", "label": "Save", "operation": "create", "target": "", "message": ""}]}
        source = (Path(__file__).parents[1] / "server/gradio-component.py").read_text().replace("REFRAME_SPEC_BASE64", base64.b64encode(json.dumps(contract).encode()).decode()).replace("REFRAME_BRAND_BASE64", base64.b64encode(json.dumps({"primary": "#176e9b", "radius": 12}).encode()).decode())
        with tempfile.TemporaryDirectory() as folder:
            file = Path(folder) / "GradioApp.py"
            file.write_text(source)
            module_spec = importlib.util.spec_from_file_location("generated_gradio", file)
            module = importlib.util.module_from_spec(module_spec)
            module_spec.loader.exec_module(module)
            session = {"data": {"version": 0, "records": []}, "pending": None}
            seen = []

            def failed(body):
                seen.append(body)
                raise OSError("Disconnected after request")

            with patch.object(module, "request", side_effect=failed):
                first = module.invoke("action1", "", session, "user@example.org")
                second = module.invoke("action1", "", first[0], "user@example.org")
            self.assertEqual(seen[0]["requestId"], seen[1]["requestId"])
            self.assertIn("Retry the same action", second[2]["error"])
            confirmed = {"version": 1, "records": [{"id": "record1", "values": {"field1": "user@example.org"}}]}
            with patch.object(module, "request", return_value=confirmed):
                result = module.invoke("action1", "", session, "user@example.org")
            self.assertIsNone(result[0]["pending"])
            self.assertEqual(result[2]["records"][0]["values"]["field1"], "user@example.org")

    def test_edited_capture_is_a_new_item_and_report_omits_source_files(self):
        original = {"id": "keep-original", "name": "Original", "html": "<p>Original</p>", "libraryId": "tabs", "feature": {"files": {}}, "capturedAt": "original-time", "source": "Original"}
        seen = []

        def workbench(route, body):
            seen.append((route, body))
            return {"id": "run-id", "ready": True, "provider": "local", "decision": {}, "stages": [{"summary": "Done"}], "limitation": "Verify runtime", "skills": [{"name": "Gradio"}], "files": {"Component.tsx": "private code omitted from display"}}

        with patch.object(lab, "workbench", side_effect=workbench):
            summary, report = lab.run("New component", "<button>Count</button>", "unexecuted_source()", "Count", "local", original)
        item = seen[0][1]["item"]
        self.assertNotEqual(item["id"], original["id"])
        self.assertEqual(original["html"], "<p>Original</p>")
        self.assertIn("feature", original)
        self.assertNotIn("feature", item)
        self.assertNotIn("libraryId", item)
        self.assertEqual(item["name"], "New component")
        self.assertEqual(seen[0][1]["source"], "unexecuted_source()")
        self.assertEqual(summary, "Done")
        self.assertEqual(report["files"], ["Component.tsx"])

    def test_real_gradio_blocks_wires_named_event_and_session_state(self):
        config = lab.demo.get_config_file()
        self.assertEqual(config["title"], "Reframe · Gradio Lab")
        self.assertTrue(any(dependency["api_name"] == "run_workflow" for dependency in config["dependencies"]))
        self.assertTrue(any(component["type"] == "state" for component in config["components"]))


if __name__ == "__main__":
    unittest.main()
