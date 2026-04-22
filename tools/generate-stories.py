#!/usr/bin/env python3
import urllib.request
import urllib.error
import json
import sys

API_KEY = "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"
MODEL = "claude-opus-4-5"
MAX_TOKENS = 4000

SYSTEM_PROMPT = """You are the world's greatest children's storyteller. You write stories that make parents cry because of how deeply personal they feel, and make children gasp because they cannot believe the story knows them.

YOUR RULES:

1. EVERY DETAIL IS SACRED
The parent has told you things about their child. Their name, their friend, their interests, their pet, things they are proud of, extra details. You must treat every single one as a gift. Do not mention a detail once and move on. Weave it into the fabric of the story.

2. THE CHILD'S NAME IS MUSIC
Use their name at least 8 times. Use it the way a loving storyteller would: at moments of wonder, in dialogue from their friend, in quiet reflective beats, at the climax.

3. WRITTEN FOR THE EAR, NOT THE EYE
This story will be read aloud by a text to speech narrator. Write for how it sounds, not how it looks.

PACING AND PAUSES (critical for audio):
- Use three dots ( ... ) to create a breath pause. Place them at moments of suspense, wonder, scene transitions, and before emotional reveals.
- Aim for at least one pause ( ... ) every 100 to 150 words.
- After a big emotional moment or scene change, use a double pause: "... ... "
- Avoid parentheses, asterisks, em dashes, or any visual formatting.

AUDIO TAGS (for emotional expression):
Use SPARINGLY at key emotional moments, no more than 8 to 12 per story:
- [whispers] before a secret, a bedtime moment, or a quiet reveal
- [laughs softly] or [laughs] during genuinely funny moments
- [gasps] before a big reveal or surprise
- [sighs] for moments of relief, contentment, or gentle emotion
- [excitedly] before exciting dialogue or action
- Place audio tags at the START of the sentence or clause they apply to
- NEVER use more than one audio tag per paragraph

4. AGE IS EVERYTHING
Ages 5 to 7: Clear beginning, middle, end. The child is brave but the world is kind. Simple moral woven in naturally.
Ages 8 to 10: Real narrative tension. The child is clever and capable. Humour works brilliantly.

5. START IMMEDIATELY
Drop the listener straight into a moment. The first sentence should make a parent lean in.
BEDTIME EXCEPTION: May begin with a gentle, calming setup. Use the child's name and a personal detail within the first two sentences.

6. EVERY STORY MUST END with the child's name and: "This story was made just for [name]."

LENGTH: Approximately 600-700 words (this is a highlight clip, not the full story)."""

STORIES = [
    {
        "prompt": "Write a bedtime story for Poppy, a 6-year-old girl. Her best friend is Mia. She loves unicorns and glitter. Her cuddly toy is called Bunny. Her pet is Daisy the cat. Her family is Mummy and Daddy. The setting is a night sky adventure. What makes her her: she always wears her wellies even in sunshine. Use she/her pronouns.",
        "output": "public/audio/story-bedtime-raw.txt",
        "label": "Story 1 (Poppy - bedtime)"
    },
    {
        "prompt": "Write an adventure story for Chase, a 9-year-old boy. His best friend is Ellis. He loves dinosaurs and space. The villain is Daddy (make it playful and silly, pantomime villain energy). His pet is Bruno the dog. His family is Dad and Mum. The setting is an Enchanted Forest. What makes him him: he regularly argues with nature documentaries on TV when they get something wrong, and he is usually right. Use he/him pronouns.",
        "output": "public/audio/story-adventure-raw.txt",
        "label": "Story 2 (Chase - adventure)"
    },
    {
        "prompt": "Write a bedtime story as a gift from Grandma to Livvie, a 4-year-old girl. She loves butterflies and dancing. Her cuddly toy is Mr Elephant. The setting is a secret butterfly meadow. What makes her her: she does a bow after every single dance, no matter where she is, even in the supermarket. This is a gift from Grandma. Grandma must appear in the story as a character with meaningful moments. Include a personal message read aloud at the very start by the narrator: 'My darling Livvie, this story is just for you, from Grandma, because you are the most wonderful little dancer I have ever seen. I hope it makes you smile as big as your hugs. All my love, always.' Use she/her pronouns.",
        "output": "public/audio/story-gift-raw.txt",
        "label": "Story 3 (Livvie - gift)"
    }
]

def call_api(prompt):
    url = "https://api.anthropic.com/v1/messages"
    payload = {
        "model": MODEL,
        "max_tokens": MAX_TOKENS,
        "system": SYSTEM_PROMPT,
        "messages": [{"role": "user", "content": prompt}]
    }
    data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(url, data=data, method="POST")
    req.add_header("x-api-key", API_KEY)
    req.add_header("anthropic-version", "2023-06-01")
    req.add_header("content-type", "application/json")
    with urllib.request.urlopen(req, timeout=90) as resp:
        body = json.loads(resp.read())
    return body["content"][0]["text"]

story_index = int(sys.argv[1])  # 0, 1, or 2
story = STORIES[story_index]
print(f"Calling API for {story['label']}...")
text = call_api(story["prompt"])
with open(story["output"], "w", encoding="utf-8") as f:
    f.write(text)
word_count = len(text.split())
print(f"Saved {word_count} words to {story['output']}")
