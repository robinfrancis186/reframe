"""Generated Gradio UI for a reviewed public Reframe feature contract."""
import base64
import functools
import html
import json
import os
import urllib.error
import urllib.request
from uuid import uuid4
import gradio as gr

SPEC = json.loads(base64.b64decode("REFRAME_SPEC_BASE64"))
BRAND = json.loads(base64.b64decode("REFRAME_BRAND_BASE64"))
ENDPOINT = os.environ.get("REFRAME_API_URL", "http://127.0.0.1:5176/api/reframe/" + SPEC["id"])


def request(body=None):
    req = urllib.request.Request(ENDPOINT, data=json.dumps(body).encode() if body is not None else None, headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=15) as response:
        return json.load(response)


def records(data, selected=""):
    choices = [(" · ".join(str(v) for v in row["values"].values()) or "Record " + row["id"][:8], row["id"]) for row in data.get("records", [])]
    return gr.Dropdown(choices=choices, value=selected if any(key == selected for _, key in choices) else None)


def load():
    try:
        data = request()
        return {"data": data, "pending": None}, records(data), data
    except (OSError, ValueError):
        return {"data": {}, "pending": None}, records({}), {"error": "Start the included backend, set REFRAME_API_URL and refresh."}


def invoke(action_id, selected, session, *inputs):
    session = session or {"data": {}, "pending": None}
    data = session["data"]
    action = next(action for action in SPEC["actions"] if action["id"] == action_id)
    values = {field["id"]: value for field, value in zip(SPEC["fields"], inputs)}
    if action["operation"] == "reset":
        return session, records(data), {"message": "Fields cleared."}, *[False if field["type"] == "checkbox" else "" for field in SPEC["fields"]]
    if action["operation"] in ["navigate", "details"]:
        return session, records(data, selected), {"message": action["message"], "destination": action["target"]}, *inputs
    if "version" not in data:
        return session, records(data), {"error": "Load the backend before invoking an action."}, *inputs
    if action["operation"] in ["update", "delete"] and not selected:
        return session, records(data), {"error": "Select a record first."}, *inputs
    body = {"action": action_id, "values": values, "recordId": selected or "", "query": " ".join(map(str, values.values()))}
    fingerprint = json.dumps(body, sort_keys=True)
    if not session["pending"] or session["pending"]["fingerprint"] != fingerprint:
        session["pending"] = {"fingerprint": fingerprint, "body": {**body, "version": data["version"], "requestId": str(uuid4())}}
    try:
        data = request(session["pending"]["body"])
        session["data"] = data
        session["pending"] = None
        return session, records(data, selected), data, *inputs
    except urllib.error.HTTPError as error:
        if error.code < 500:
            session["pending"] = None
        try:
            message = json.load(error).get("error", "Action rejected.")
        except (ValueError, AttributeError):
            message = "Action rejected."
        if error.code == 409:
            try:
                session["data"] = data = request()
            except (OSError, ValueError):
                pass
        return session, records(data, selected), {"error": message}, *inputs
    except (OSError, ValueError):
        return session, records(data, selected), {"error": "Connection failed. Retry the same action to reuse its request ID."}, *inputs


with gr.Blocks(title=SPEC["name"]) as demo:
    gr.Markdown("# " + html.escape(SPEC["name"]) + "\nPublic local records · independently authored behavior")
    state = gr.State({"data": {}, "pending": None})
    fields = [gr.Checkbox(label=field["label"]) if field["type"] == "checkbox" else gr.Textbox(label=field["label"] + (" *" if field["required"] else ""), max_length=2000) for field in SPEC["fields"]]
    selected = gr.Dropdown(label="Selected record", choices=[], value=None)
    output = gr.JSON(label="Confirmed backend state")
    with gr.Row():
        for action in SPEC["actions"]:
            button = gr.Button(action["label"], elem_classes=["rf-primary"])
            button.click(functools.partial(invoke, action["id"]), inputs=[selected, state, *fields], outputs=[state, selected, output, *fields], concurrency_id="feature-actions", concurrency_limit=1, api_name=action["id"])
    gr.Button("Refresh backend state").click(load, outputs=[state, selected, output], concurrency_id="feature-actions", concurrency_limit=1)
    demo.load(load, outputs=[state, selected, output])

if __name__ == "__main__":
    css = ".rf-primary{background:" + BRAND["primary"] + "!important;color:white!important;border-radius:" + str(BRAND["radius"]) + "px!important}"
    demo.queue(max_size=4).launch(server_name="127.0.0.1", share=False, strict_cors=True, css=css, footer_links=[])
