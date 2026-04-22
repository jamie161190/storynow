#!/usr/bin/env python3
"""
Hear Their Name Video Ad Builder
=================================
One script to go from raw footage → finished ad with narration, music, subtitles, overlays & end cards.

USAGE:
  python3 tools/make-ad.py

Edit the CONFIG section below for each new ad, then run.

PROCESS:
  1. Cut video clip from raw footage at specified timestamps
  2. Mute original audio
  3. Cut narrator audio from story narration MP3 (same timestamps)
  4. Mix narrator + adventure background music (15% volume, faded)
  5. Burn subtitles into video (from SRT file or auto-transcribe)
  6. Add hook text overlay (first 2 seconds)
  7. Add mid-point text flash (configurable timestamp)
  8. Add end cards (dark purple background, white/orange text)
  9. Fade audio, concatenate everything → final export

REQUIREMENTS:
  pip3 install moviepy SpeechRecognition
  ffmpeg at /opt/homebrew/bin/ffmpeg
"""

import subprocess, os, sys, re, json
import numpy as np
from PIL import Image, ImageDraw, ImageFont
from moviepy import VideoFileClip, TextClip, CompositeVideoClip, VideoClip, concatenate_videoclips

# ═══════════════════════════════════════════════════════════════
# CONFIG — Edit this section for each new ad
# ═══════════════════════════════════════════════════════════════

CONFIG = {
    # Source files
    "raw_video": os.path.expanduser("~/Downloads/Full Video.MOV"),
    "narrator_audio": os.path.expanduser("~/Downloads/storytold-story.mp3"),
    "background_music": os.path.join(os.path.dirname(__file__), "../public/music/adventure-ambient.mp3"),

    # Clip timestamps (start, end) — "M:SS" or "H:MM:SS" format
    "clip_start": "2:45",
    "clip_end": "3:20",

    # Background music settings
    "music_volume": 0.15,       # 0.0 to 1.0
    "music_fade_in": 2,         # seconds
    "music_fade_out_start": 30, # seconds from clip start
    "music_fade_out_dur": 5,    # seconds

    # Subtitles — provide SRT path OR set to "auto" to transcribe
    "subtitles": "/tmp/subs.srt",  # or "auto"

    # Hook overlay (top of video, first few seconds)
    "hook_text": "They don't know what's coming...",
    "hook_start": 0,
    "hook_end": 2,

    # Mid-point text flash
    "mid_text": "You can make yourself the villain too.",
    "mid_start": 20,
    "mid_end": 22,
    "mid_color": (255, 255, 50),  # yellow

    # End cards — list of cards, each with lines [(text, color)]
    "end_cards": [
        {
            "duration": 2.5,
            "lines": [
                ("This is what happened when we put the kids in their own story.", (255, 255, 255)),
                ("Dad was the villain.", (255, 140, 0)),  # orange
            ]
        },
        {
            "duration": 2.5,
            "lines": [
                ("Their name. Their best friend. Their world.", (255, 255, 255)),
                ("In a story made just for them.", (255, 255, 255)),
            ]
        },
    ],

    # Output
    "output": os.path.expanduser("~/Downloads/storytold-ad-export.mp4"),

    # Caption (for copy/paste into TikTok/Reels)
    "caption": "Made the kids the heroes of their own story. Made Dad the villain.",
}

# ═══════════════════════════════════════════════════════════════
# PIPELINE — You shouldn't need to edit below this line
# ═══════════════════════════════════════════════════════════════

FFMPEG = "/opt/homebrew/bin/ffmpeg"
FFPROBE = "/opt/homebrew/bin/ffprobe"
TMP = "/tmp/storytold-ad-build"
W, H = 1080, 1920
PURPLE_BG = (45, 15, 65)
# FB/TikTok/Reels safe zone — avoid top 350px (username/status) and bottom 450px (caption/buttons)
SAFE_TOP = 350
SAFE_BOTTOM = H - 450  # 1470

os.makedirs(TMP, exist_ok=True)

def run(cmd, desc=""):
    print(f"  → {desc}")
    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0:
        print(f"    ERROR: {result.stderr[-500:]}")
        sys.exit(1)
    return result

def get_duration(path):
    r = subprocess.run([FFPROBE, "-v", "quiet", "-print_format", "json", "-show_format", path],
                       capture_output=True, text=True)
    return float(json.loads(r.stdout)["format"]["duration"])

# Fonts
try:
    FONT_BOLD_LG = ImageFont.truetype("/System/Library/Fonts/Supplemental/Arial Bold.ttf", 64)
    FONT_BOLD_MD = ImageFont.truetype("/System/Library/Fonts/Supplemental/Arial Bold.ttf", 60)
    FONT_CARD = ImageFont.truetype("/System/Library/Fonts/Supplemental/Arial Bold.ttf", 56)
    FONT_CARD_ACCENT = ImageFont.truetype("/System/Library/Fonts/Supplemental/Arial Bold.ttf", 62)
    FONT_SUBS = ImageFont.truetype("/System/Library/Fonts/Helvetica.ttc", 42)
except:
    FONT_BOLD_LG = ImageFont.truetype("/System/Library/Fonts/Helvetica.ttc", 64)
    FONT_BOLD_MD = ImageFont.truetype("/System/Library/Fonts/Helvetica.ttc", 60)
    FONT_CARD = ImageFont.truetype("/System/Library/Fonts/Helvetica.ttc", 56)
    FONT_CARD_ACCENT = ImageFont.truetype("/System/Library/Fonts/Helvetica.ttc", 62)
    FONT_SUBS = ImageFont.truetype("/System/Library/Fonts/Helvetica.ttc", 42)


def wrap_text(draw, text, font, max_width):
    words = text.split()
    lines, current = [], ""
    for word in words:
        test = f"{current} {word}".strip()
        bbox = draw.textbbox((0, 0), test, font=font)
        if bbox[2] - bbox[0] <= max_width:
            current = test
        else:
            if current: lines.append(current)
            current = word
    if current: lines.append(current)
    return lines


def parse_srt(path):
    with open(path) as f:
        content = f.read()
    blocks = content.strip().split("\n\n")
    subs = []
    for block in blocks:
        lines = block.strip().split("\n")
        if len(lines) < 3: continue
        m = re.match(r"(\d+):(\d+):(\d+),(\d+)\s*-->\s*(\d+):(\d+):(\d+),(\d+)", lines[1])
        if not m: continue
        start = int(m[1])*3600 + int(m[2])*60 + int(m[3]) + int(m[4])/1000
        end = int(m[5])*3600 + int(m[6])*60 + int(m[7]) + int(m[8])/1000
        text = " ".join(lines[2:])
        subs.append((start, end, text))
    return subs


def auto_transcribe(audio_path):
    """Transcribe audio using Google Speech Recognition."""
    import speech_recognition as sr
    # Convert to wav first
    wav_path = f"{TMP}/transcribe.wav"
    run([FFMPEG, "-y", "-i", audio_path, "-ar", "16000", "-ac", "1", wav_path], "Converting audio for transcription")
    r = sr.Recognizer()
    with sr.AudioFile(wav_path) as source:
        audio = r.record(source)
    result = r.recognize_google(audio, show_all=True)
    # Build basic SRT from result
    duration = get_duration(audio_path)
    if isinstance(result, dict) and "alternative" in result:
        text = result["alternative"][0]["transcript"]
    else:
        text = str(result)
    words = text.split()
    chunk_size = 8
    srt_path = f"{TMP}/auto_subs.srt"
    chunks = [words[i:i+chunk_size] for i in range(0, len(words), chunk_size)]
    time_per_chunk = duration / len(chunks)
    with open(srt_path, "w") as f:
        for i, chunk in enumerate(chunks):
            start = i * time_per_chunk
            end = (i + 1) * time_per_chunk
            f.write(f"{i+1}\n")
            f.write(f"{int(start//3600):02d}:{int(start%3600//60):02d}:{int(start%60):02d},{int(start%1*1000):03d} --> ")
            f.write(f"{int(end//3600):02d}:{int(end%3600//60):02d}:{int(end%60):02d},{int(end%1*1000):03d}\n")
            f.write(" ".join(chunk) + "\n\n")
    print(f"    Auto-generated subtitles: {srt_path}")
    return srt_path


def make_overlay_png(text, font, text_color, banner_alpha, outpath):
    """Create transparent PNG with banner + text at top of frame."""
    img = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    lines = wrap_text(draw, text, font, W - 80)
    line_heights = [draw.textbbox((0, 0), l, font=font)[3] - draw.textbbox((0, 0), l, font=font)[1] for l in lines]
    total_h = sum(line_heights) + (len(lines) - 1) * 16
    banner_top, pad_v = SAFE_TOP, 30
    banner_bottom = banner_top + pad_v * 2 + total_h
    draw.rectangle([(0, banner_top), (W, banner_bottom)], fill=(0, 0, 0, banner_alpha))
    y = banner_top + pad_v
    for i, line in enumerate(lines):
        bbox = draw.textbbox((0, 0), line, font=font)
        tw = bbox[2] - bbox[0]
        x = (W - tw) // 2
        for dx in range(-3, 4):
            for dy in range(-3, 4):
                if abs(dx) + abs(dy) > 0:
                    draw.text((x + dx, y + dy), line, font=font, fill=(0, 0, 0, 255))
        draw.text((x, y), line, font=font, fill=text_color + (255,) if len(text_color) == 3 else text_color)
        y += line_heights[i] + 16
    img.save(outpath)


def make_end_card_png(lines_config, outpath):
    """Create end card PNG with dark purple bg."""
    img = Image.new("RGB", (W, H), PURPLE_BG)
    draw = ImageDraw.Draw(img)
    all_data = []
    total_h = 0
    for text, color in lines_config:
        font = FONT_CARD_ACCENT if color != (255, 255, 255) else FONT_CARD
        wrapped = wrap_text(draw, text, font, W - 140)
        block_h = sum(draw.textbbox((0, 0), l, font=font)[3] - draw.textbbox((0, 0), l, font=font)[1] + 16 for l in wrapped)
        all_data.append((wrapped, color, font, block_h))
        total_h += block_h + 40
    y = (H - total_h) // 2
    for wrapped, color, font, _ in all_data:
        for line in wrapped:
            bbox = draw.textbbox((0, 0), line, font=font)
            tw, th = bbox[2] - bbox[0], bbox[3] - bbox[1]
            draw.text(((W - tw) // 2, y), line, font=font, fill=color)
            y += th + 16
        y += 40
    img.save(outpath)


# ═══════════════════════════════════════════════════════════════
print("=" * 60)
print("HEAR THEIR NAME AD BUILDER")
print("=" * 60)

c = CONFIG

# STEP 1: Cut video clip
print("\n[1/9] Cutting video clip...")
clip_raw = f"{TMP}/clip-raw.mp4"
run([FFMPEG, "-y", "-i", c["raw_video"], "-ss", c["clip_start"], "-to", c["clip_end"], "-c", "copy", clip_raw],
    f"Cutting {c['clip_start']} → {c['clip_end']}")

# STEP 2: Mute original audio
print("\n[2/9] Muting original audio...")
clip_muted = f"{TMP}/clip-muted.mp4"
run([FFMPEG, "-y", "-i", clip_raw, "-an", "-c:v", "copy", clip_muted], "Removing audio track")

# STEP 3: Cut narrator audio
print("\n[3/9] Cutting narrator audio...")
clip_audio = f"{TMP}/clip-audio.m4a"
run([FFMPEG, "-y", "-i", c["narrator_audio"], "-ss", c["clip_start"], "-to", c["clip_end"], "-c", "copy", clip_audio],
    f"Cutting narrator {c['clip_start']} → {c['clip_end']}")

# STEP 4: Combine video + narrator
print("\n[4/9] Combining video + narrator...")
clip_narrated = f"{TMP}/clip-narrated.mp4"
run([FFMPEG, "-y", "-i", clip_muted, "-i", clip_audio, "-c:v", "copy", "-c:a", "aac", "-shortest", clip_narrated],
    "Merging video + narrator")

# STEP 5: Add background music
print("\n[5/9] Mixing in background music...")
clip_duration = get_duration(clip_narrated)
music_path = os.path.abspath(c["background_music"])
clip_mixed = f"{TMP}/clip-mixed.mp4"
run([FFMPEG, "-y", "-i", clip_narrated, "-i", music_path,
     "-filter_complex",
     f"[1:a]atrim=0:{clip_duration},afade=t=in:d={c['music_fade_in']},"
     f"afade=t=out:st={c['music_fade_out_start']}:d={c['music_fade_out_dur']},"
     f"volume={c['music_volume']}[music];"
     f"[0:a][music]amix=inputs=2:duration=first:normalize=0[out]",
     "-map", "0:v", "-map", "[out]", "-c:v", "copy", "-c:a", "aac", "-b:a", "192k", clip_mixed],
    f"Adventure music at {int(c['music_volume']*100)}% volume")

# STEP 6: Burn subtitles
print("\n[6/9] Burning subtitles...")
srt_path = c["subtitles"]
if srt_path == "auto":
    srt_path = auto_transcribe(clip_audio)
subs = parse_srt(srt_path)

video = VideoFileClip(clip_mixed)
sub_clips = [video]
for start, end, text in subs:
    txt = TextClip(text=text, font_size=42, color="white",
                   font="/System/Library/Fonts/Helvetica.ttc",
                   stroke_color="black", stroke_width=2,
                   size=(W - 100, None), method="caption", text_align="center")
    txt = txt.with_start(start).with_end(end).with_position(("center", SAFE_BOTTOM))
    sub_clips.append(txt)

clip_subbed = CompositeVideoClip(sub_clips)
clip_subbed_path = f"{TMP}/clip-subbed.mp4"
clip_subbed.write_videofile(clip_subbed_path, codec="libx264", audio_codec="aac", fps=30, logger=None)
video.close()
print("  → Subtitles burned in")

# STEP 7: Create overlay PNGs
print("\n[7/9] Creating text overlay PNGs...")
hook_png = f"{TMP}/overlay_hook.png"
mid_png = f"{TMP}/overlay_mid.png"
make_overlay_png(c["hook_text"], FONT_BOLD_LG, (255, 255, 255), 180, hook_png)
make_overlay_png(c["mid_text"], FONT_BOLD_MD, c["mid_color"], 200, mid_png)
print("  → Hook + mid-point overlays created")

# STEP 8: Composite overlays with ffmpeg (preserves color)
print("\n[8/9] Compositing overlays onto video...")
clip_overlaid = f"{TMP}/clip-overlaid.mp4"
run([FFMPEG, "-y", "-i", clip_subbed_path, "-i", hook_png, "-i", mid_png,
     "-filter_complex",
     f"[0:v][1:v]overlay=0:0:enable='between(t,{c['hook_start']},{c['hook_end']})'[v1];"
     f"[v1][2:v]overlay=0:0:enable='between(t,{c['mid_start']},{c['mid_end']})'[vout]",
     "-map", "[vout]", "-map", "0:a", "-c:v", "libx264", "-crf", "18", "-c:a", "copy", clip_overlaid],
    "ffmpeg overlay filter")

# Fade audio at end
clip_faded = f"{TMP}/clip-faded.mp4"
run([FFMPEG, "-y", "-i", clip_overlaid, "-af", f"afade=t=out:st={clip_duration-3}:d=3",
     "-c:v", "copy", "-c:a", "aac", "-b:a", "192k", clip_faded],
    "Fading audio out")

# STEP 9: End cards + final concat
print("\n[9/9] Building end cards and final export...")
concat_list = f"{TMP}/concat.txt"
with open(concat_list, "w") as f:
    f.write(f"file '{clip_faded}'\n")

for i, card in enumerate(c["end_cards"]):
    card_png = f"{TMP}/endcard{i+1}.png"
    card_mp4 = f"{TMP}/endcard{i+1}.mp4"
    make_end_card_png(card["lines"], card_png)
    run([FFMPEG, "-y", "-loop", "1", "-framerate", "30", "-t", str(card["duration"]),
         "-i", card_png, "-f", "lavfi", "-t", str(card["duration"]), "-i", "anullsrc=r=44100:cl=mono",
         "-c:v", "libx264", "-crf", "18", "-pix_fmt", "yuv420p", "-c:a", "aac", "-shortest", card_mp4],
        f"End card {i+1}")
    with open(concat_list, "a") as f:
        f.write(f"file '{card_mp4}'\n")

run([FFMPEG, "-y", "-f", "concat", "-safe", "0", "-i", concat_list,
     "-c:v", "libx264", "-crf", "18", "-c:a", "aac", "-b:a", "192k", c["output"]],
    "Final concatenation")

# Done!
total_dur = get_duration(c["output"])
print("\n" + "=" * 60)
print(f"DONE! → {c['output']}")
print(f"Duration: {total_dur:.1f}s")
print(f"\nCaption for TikTok/Reels:")
print(f'"{c["caption"]}"')
print("=" * 60)
