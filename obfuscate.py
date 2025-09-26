import base64
import os
import shutil
from mimetypes import guess_type
from pathlib import Path
import zipfile

ROOT = Path(__file__).resolve().parent
TARGET_DIR = ROOT.parent / "findgreetings_obfuscated"
ZIP_PATH = ROOT.parent / "findgreetings-obfuscated.zip"
ASSET_DATA_URIS: dict[str, str] = {}

JS_TEMPLATE = '(()=>{{eval(atob("{payload}"));}})();'
HTML_TEMPLATE = '<!doctype html><meta charset="utf-8"><script>document.write(atob("{payload}"));</script>'
CSS_TEMPLATE = '@import url("data:text/css;base64,{payload}");'
GENERIC_TEXT_TEMPLATE = '# base64:{payload}'
GENERIC_BINARY_TEMPLATE = '# base64-bin:{payload}'

JS_EXTS = {".js"}
HTML_EXTS = {".html", ".htm"}
CSS_EXTS = {".css"}
TEXT_BASE64_EXTS = {".md", ".txt", ".json", ".csv", ".tsv", ".xml", ".svg", ".yml", ".yaml", ".toml"}
BINARY_EXTS = {".png", ".jpg", ".jpeg", ".gif", ".bmp", ".webp", ".mp3", ".wav", ".ogg", ".opus", ".mp4", ".mov", ".avi", ".zip", ".gz"}
IGNORE_DIRS = {".git", "node_modules", "dist", "build", "findgreetings_obfuscated"}


def encode_text(text: str) -> str:
    return base64.b64encode(text.encode("utf-8")).decode("ascii")


def encode_bytes(data: bytes) -> str:
    return base64.b64encode(data).decode("ascii")


def build_asset_map() -> None:
    ASSET_DATA_URIS.clear()
    for dirpath, dirnames, filenames in os.walk(ROOT):
        current = Path(dirpath)
        rel_dir = current.relative_to(ROOT)
        dirnames[:] = [d for d in dirnames if d not in IGNORE_DIRS]
        for filename in filenames:
            src_path = current / filename
            if src_path == Path(__file__):
                continue
            rel_path = src_path.relative_to(ROOT).as_posix()
            ext = src_path.suffix.lower()
            if ext in BINARY_EXTS:
                data = src_path.read_bytes()
                mime = guess_type(src_path.name)[0] or "application/octet-stream"
                payload = encode_bytes(data)
                ASSET_DATA_URIS[rel_path] = f"data:{mime};base64,{payload}"


def replace_asset_references(text: str) -> str:
    for rel_path, data_uri in ASSET_DATA_URIS.items():
        normalized = rel_path.replace("\\", "/")
        alt = normalized.replace("/", "\\\\")
        variants = {
            normalized,
            alt,
            f"./{normalized}",
            f".\\{alt}",
        }
        filename = normalized.split("/")[-1]
        variants.add(f"${{MEDIA_BASE}}{filename}")
        for variant in variants:
            text = text.replace(variant, data_uri)
    return text


def obfuscate_text_file(src: Path, dest: Path) -> None:
    ext = src.suffix.lower()
    text = src.read_text(encoding="utf-8")
    text = replace_asset_references(text)
    payload = encode_text(text)
    if ext in JS_EXTS:
        content = JS_TEMPLATE.format(payload=payload)
    elif ext in HTML_EXTS:
        content = HTML_TEMPLATE.format(payload=payload)
    elif ext in CSS_EXTS:
        content = CSS_TEMPLATE.format(payload=payload)
    else:
        content = GENERIC_TEXT_TEMPLATE.format(payload=payload)
    dest.write_text(content, encoding="utf-8")


def obfuscate_binary_file(src: Path, dest: Path) -> None:
    data = src.read_bytes()
    payload = encode_bytes(data)
    content = GENERIC_BINARY_TEMPLATE.format(payload=payload)
    dest.write_text(content, encoding="utf-8")


def prepare_target_dir() -> None:
    if TARGET_DIR.exists():
        shutil.rmtree(TARGET_DIR)
    TARGET_DIR.mkdir(parents=True)


def write_zip() -> None:
    if ZIP_PATH.exists():
        ZIP_PATH.unlink()
    with zipfile.ZipFile(ZIP_PATH, "w", compression=zipfile.ZIP_DEFLATED) as archive:
        for file_path in TARGET_DIR.rglob("*"):
            archive.write(file_path, file_path.relative_to(TARGET_DIR))


def build_structure() -> None:
    for dirpath, dirnames, filenames in os.walk(ROOT):
        current = Path(dirpath)
        rel_dir = current.relative_to(ROOT)
        dirnames[:] = [d for d in dirnames if d not in IGNORE_DIRS]
        target_subdir = TARGET_DIR / rel_dir
        target_subdir.mkdir(parents=True, exist_ok=True)
        for filename in filenames:
            src_path = current / filename
            if src_path == Path(__file__):
                continue
            rel_path = src_path.relative_to(ROOT)
            rel_posix = rel_path.as_posix()
            if rel_posix in ASSET_DATA_URIS:
                continue
            dest_path = TARGET_DIR / rel_path
            dest_path.parent.mkdir(parents=True, exist_ok=True)
            ext = src_path.suffix.lower()
            try:
                obfuscate_text_file(src_path, dest_path)
            except UnicodeDecodeError:
                obfuscate_binary_file(src_path, dest_path)


def main() -> None:
    build_asset_map()
    prepare_target_dir()
    build_structure()
    write_zip()
    print(f"Created obfuscated archive at {ZIP_PATH}")


if __name__ == "__main__":
    main()
