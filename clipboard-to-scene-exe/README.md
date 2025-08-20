# Clipboard‑to‑Scene (No API) — Windows EXE

This app **does not** call any API. You chat on **chat.openai.com** in your browser, copy the assistant's reply, and this app:
- validates it against a SceneSpec schema,
- saves it as `scene.json` you can use in UE5/FreeCAD later.

## Build EXE in the cloud (GitHub Actions)
1) Create a new GitHub repo and upload this folder (or the ZIP).
2) Go to **Actions** → run **Build Clipboard-to-Scene EXE**.
3) Download the artifact `Clipboard-to-Scene-Installer` → run the `.exe` installer.

## Use
1) Ask ChatGPT to **reply ONLY JSON** that matches the schema shown in the app (copy the prompt from the app).
2) Copy the assistant's message.
3) Click **Paste from clipboard** in the app.
4) Click **Validate** → **Save** or **Export as...**

> No ToS violations: you perform the browsing and copying yourself. The app just works with your clipboard.
