# MeetSpark

MeetSpark is a lightweight Chromebook-friendly companion app for Google Meet sessions.

## What it does

- Opens a Google Meet URL in a new tab.
- Adds a quick reaction board for engaging team sessions.
- Includes a built-in 10-minute focus sprint timer.
- Provides a spin-the-idea wheel for random prompts.
- Tracks session energy with a simple slider.

## How to use it on a Chromebook

### Option A: Use the hosted files (recommended for students)
1. Open MeetSpark in Chrome.
2. Copy your Google Meet link from Google Calendar, Classroom, or Meet.
3. Paste the Meet link in the **Launch your Meet** box and click **Open Meet**.
4. Keep MeetSpark in one tab and your live Meet call in the other tab.
5. During the call:
   - tap emojis in **Reaction Board** to keep engagement high,
   - run **Focus Sprint Timer** for timed activities,
   - use **Spin-the-Idea Wheel** to pick who/what goes next,
   - move the **Energy Meter** for quick class/team check-ins.

### Option B: Run locally on a Chromebook (Linux mode)
If your Chromebook has Linux development enabled:

1. Open the Linux Terminal app.
2. Put the project files in a folder.
3. Run:
## Run locally

```bash
python3 -m http.server 4173
```

4. In Chrome, open `http://localhost:4173`.
5. Use the app as a second-tab companion while Meet runs in another tab.

## Tips for best Chromebook experience

- Pin both tabs (Meet + MeetSpark) so they’re easy to switch between.
- Use Split Screen for side-by-side view during classes or clubs.
- If pop-ups are blocked, allow pop-ups for the MeetSpark site so **Open Meet** works.
Then open <http://localhost:4173>.

## Why this helps

Google Meet itself stays focused on video and audio. MeetSpark adds interactive meeting facilitation tools in a second tab so classes, clubs, and team sessions feel more energetic.
