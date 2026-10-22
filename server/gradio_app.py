"""Trusted in-app Gradio lab. Uploaded source is data, never Python to execute."""
import json
import os
import urllib.error
import urllib.request
from uuid import uuid4
from datetime import datetime, timezone
import gradio as gr

BASE = os.environ["REFRAME_URL"]
TOKEN = os.environ["REFRAME_GRADIO_TOKEN"]


def workbench(route, body=None):
    request = urllib.request.Request(
        BASE + route,
        data=json.dumps(body).encode() if body is not None else None,
        headers={"Content-Type": "application/json", "X-Reframe-Gradio": TOKEN},
    )
    try:
        with urllib.request.urlopen(request, timeout=180) as response:
            return json.load(response)
    except urllib.error.HTTPError as error:
        try:
            message = json.load(error).get("error", "The workbench request failed.")
        except (ValueError, AttributeError):
            message = "The workbench request failed."
        raise gr.Error(message) from None
    except (OSError, ValueError):
        raise gr.Error("Reframe is unavailable. Start the workbench and reopen the lab.") from None


def load_capture():
    context = workbench("/api/gradio/context")
    return context["item"]["name"], context["item"]["html"], context["goal"], context["item"]


def run(name, html, source, goal, provider, item):
    if not item:
        raise gr.Error("Load a capture from Reframe first.")
    item = dict(item)
    if html != item["html"]:
        item.pop("feature", None)
        item.pop("libraryId", None)
        item["id"] = str(uuid4())
        item["capturedAt"] = datetime.now(timezone.utc).isoformat()
        item["source"] = "Gradio lab · edited capture"
    item["name"] = name[:100] or "Gradio capture"
    item["html"] = html
    result = workbench("/api/gradio/run", {
        "item": item, "source": source, "filename": "", "goal": goal,
        "provider": provider, "target": "gradio", "skill": "gradio",
    })
    summary = "\n\n".join(stage["summary"] for stage in result["stages"])
    report = {key: result[key] for key in ["id", "ready", "provider", "decision", "stages", "limitation"]}
    report["files"] = list(result["files"])
    report["skills"] = [skill["name"] for skill in result["skills"]]
    return summary, report


with gr.Blocks(title="Reframe · Gradio Lab") as demo:
    gr.Markdown("# A Python skill. Inside your workspace.\nUse Gradio Blocks and event listeners with the same Reframe agents. Source stays data; it is never executed.")
    current = gr.State()
    with gr.Row():
        with gr.Column():
            name = gr.Textbox(label="Component name", max_length=100)
            html = gr.Code(label="Captured HTML", language="html", lines=12)
            source = gr.Textbox(label="Optional source to inspect", lines=6, max_length=100000)
            goal = gr.Textbox(label="Intended behavior", lines=3, max_length=3000)
            provider = gr.Radio([("Local rules · no AI inference", "local"), ("OpenAI · server key", "openai")], value="local", label="Decision provider")
            gr.Markdown("OpenAI sends the selected capture/source and instructions to OpenAI. A server OPENAI_API_KEY is required here; per-run keys can be used on Reframe's Agents page.")
            run_button = gr.Button("Run specialist workflow", variant="primary")
        with gr.Column():
            summary = gr.Textbox(label="Agent handoff", lines=10, interactive=False)
            result = gr.JSON(label="Reusable report")
            gr.Markdown("Return to Reframe and choose **Load lab result**. Review the behavior, then save it to your clipboard or open Projects.")
    demo.load(load_capture, outputs=[name, html, goal, current])
    run_button.click(run, inputs=[name, html, source, goal, provider, current], outputs=[summary, result], api_name="run_workflow", concurrency_limit=1)

if __name__ == "__main__":
    demo.queue(max_size=4).launch(server_name="127.0.0.1", server_port=int(os.environ["GRADIO_SERVER_PORT"]), share=False, show_error=False, strict_cors=True, footer_links=[], theme=gr.themes.Base())
