"""Gradio Space bridge for the Accent Oracle FastAPI backend."""

import os
from contextlib import asynccontextmanager
from pathlib import Path

os.environ["HF_HOME"] = "/tmp/hf_cache"
os.environ.setdefault("ORACLE_RETAIN_USER_DATA", "0")
os.environ.setdefault("ORACLE_RETAIN_ORIGIN_COUNTS", "1")
os.environ.setdefault("ORACLE_CORS_ORIGINS", "https://miquelt9.github.io")

import spaces  # noqa: F401 - required by Hugging Face ZeroGPU Spaces.
import gradio as gr
from huggingface_hub import snapshot_download

MODEL_REPO_ID = "miquelt-9/cv26-hubert-svm-calibrated"
MODEL_REVISION_FILE = Path(__file__).with_name("model-revision.txt")
MODEL_REVISION = (
    MODEL_REVISION_FILE.read_text(encoding="utf-8").strip()
    if MODEL_REVISION_FILE.is_file()
    else "main"
)
MODEL_DIR = Path(os.environ.setdefault("ORACLE_MODEL_DIR", "/tmp/accent-oracle-model"))

# Resolve a pinned public model revision into the ephemeral Space filesystem.
snapshot_download(
    repo_id=MODEL_REPO_ID,
    repo_type="model",
    revision=MODEL_REVISION,
    local_dir=str(MODEL_DIR),
)

from backend.app import app as fastapi_app  # noqa: E402


@asynccontextmanager
async def _lifespan(_server):
    async with fastapi_app.router.lifespan_context(fastapi_app):
        yield


app = gr.Server(title="Catalan Accent Oracle API")
app.include_router(fastapi_app.router)
app.user_middleware = list(fastapi_app.user_middleware)


@app.api(name="check_zerogpu")
@spaces.GPU(duration=10)
def check_zerogpu() -> str:
    """Expose a small Gradio API action so ZeroGPU can be checked on demand."""
    import torch

    return "ZeroGPU is available." if torch.cuda.is_available() else "GPU unavailable."


if __name__ == "__main__":
    # Gradio's launch path replaces the FastAPI router lifespan unless it is
    # supplied via app_kwargs. Without this, the inference pool never starts.
    app.launch(
        server_name="0.0.0.0",
        server_port=7860,
        app_kwargs={"lifespan": _lifespan},
    )
